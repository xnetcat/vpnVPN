use axum::{routing::get, Router};
use clap::{Args, Parser, Subcommand};
use std::{env, net::SocketAddr};
use tokio::net::TcpListener;
use tokio::signal;
use tracing::{error, info, warn};

mod admin;
mod client;
mod logging;
mod metrics;
mod net;
mod vpn;

#[derive(Parser, Debug, Clone)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug, Clone)]
enum Command {
    /// Run the VPN node agent (default mode).
    Run(RunArgs),
    /// Check prerequisites and environment without starting the server.
    Doctor,
}

#[derive(Args, Debug, Clone)]
struct RunArgs {
    /// Control Plane API URL
    #[arg(long, env = "API_URL")]
    api_url: String,

    /// Authentication Token for Control Plane
    #[arg(long, env = "VPN_TOKEN")]
    token: String,

    /// Port for the VPN server to listen on (UDP)
    #[arg(long, env = "LISTEN_UDP_PORT", default_value_t = 51820)]
    listen_port: u16,

    /// Admin API port
    #[arg(long, env = "ADMIN_PORT", default_value_t = 8080)]
    admin_port: u16,

    /// Optional static peer public key for local/docker tests
    #[arg(long, env = "STATIC_PEER_PUBLIC_KEY")]
    static_peer_public_key: Option<String>,

    /// Optional static peer allowed IPs (comma-separated, e.g. 10.8.0.2/32,10.8.0.3/32)
    #[arg(long, env = "STATIC_PEER_ALLOWED_IPS")]
    static_peer_allowed_ips: Option<String>,

    /// Optional static peer endpoint (host:port) for local/docker tests
    #[arg(long, env = "STATIC_PEER_ENDPOINT")]
    static_peer_endpoint: Option<String>,
}

#[tokio::main]
async fn main() {
    let _buffer = logging::init_logging();
    let cli = Cli::parse();

    match cli.command {
        Command::Run(args) => {
            if let Err(code) = run_server(args).await {
                std::process::exit(code);
            }
        }
        Command::Doctor => {
            let ok = run_doctor();
            std::process::exit(if ok { 0 } else { 1 });
        }
    }
}

fn run_doctor() -> bool {
    use tracing::Level;

    info!(target: "doctor", "running_doctor_checks");

    // OS-level VPN tooling and TUN/TAP prerequisites.
    let nm = crate::net::os::get_network_manager();
    match nm.check_dependencies() {
        Ok(_) => {
            info!(target: "doctor", "network_manager_dependencies_ok");
        }
        Err(e) => {
            error!(target: "doctor", error = ?e, "network_manager_dependencies_failed");
            return false;
        }
    }

    // CloudWatch can be disabled; just log what will happen.
    let cw_disabled = std::env::var("DISABLE_CLOUDWATCH_METRICS")
        .map(|v| v == "1")
        .unwrap_or(false);
    if cw_disabled {
        info!(target: "doctor", "cloudwatch_metrics_disabled_by_env");
    } else {
        info!(target: "doctor", "cloudwatch_metrics_enabled");
    }

    info!(target: "doctor", "doctor_checks_passed");
    true
}

async fn run_server(args: RunArgs) -> Result<(), i32> {
    info!(
        api_url = %args.api_url,
        listen_port = args.listen_port,
        admin_port = args.admin_port,
        "starting_vpn_server"
    );

    // Check system dependencies
    let nm = crate::net::os::get_network_manager();
    if let Err(e) = nm.check_dependencies() {
        error!(error = ?e, "missing_dependencies");
        return Err(1);
    }
    info!("system_dependencies_check_passed");

    // Initialize VPN backends
    let protos_env =
        env::var("VPN_PROTOCOLS").unwrap_or_else(|_| "wireguard,openvpn,ikev2".into());
    let enabled: Vec<vpn::VpnProtocol> = protos_env
        .split(',')
        .map(|s| s.trim().to_ascii_lowercase())
        .filter_map(|s| match s.as_str() {
            "wireguard" => Some(vpn::VpnProtocol::WireGuard),
            "openvpn" => Some(vpn::VpnProtocol::OpenVpn),
            "ikev2" => Some(vpn::VpnProtocol::IkeV2),
            _ => None,
        })
        .collect();

    let node = vpn::VpnNode::new(&enabled, args.listen_port).expect("vpn node init");
    node.start_all();
    let node_arc = std::sync::Arc::new(node);
    let _ = vpn::VPN_NODE.set(node_arc.clone());

    // Optional static peer for local/docker tests (bypasses control plane peer sync)
    if let Some(static_pk) = args.static_peer_public_key.clone() {
        let allowed_raw = args
            .static_peer_allowed_ips
            .clone()
            .unwrap_or_else(|| "10.8.0.2/32".to_string());
        let allowed_ips: Vec<String> = allowed_raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let static_peer = vpn::PeerSpec {
            public_key: Some(static_pk),
            preshared_key: None,
            allowed_ips,
            endpoint: args.static_peer_endpoint.clone(),
        };

        match node_arc.apply_peers(&[static_peer]) {
            Ok(_) => info!("applied_static_peer_configuration"),
            Err(e) => error!(error = ?e, "static_peer_apply_failed"),
        }
    }

    // Client initialization
    let cp_client = std::sync::Arc::new(crate::client::ControlPlaneClient::new(
        args.api_url.clone(),
        args.token.clone(),
    ));

    // Registration
    if let Some(pubkey) = node_arc.get_public_key() {
        let client = cp_client.clone();
        let listen_port = args.listen_port;
        tokio::spawn(async move {
            // Simple retry loop for registration
            loop {
                match client.register(&pubkey, listen_port).await {
                    Ok(_) => break,
                    Err(e) => {
                        error!(error = ?e, "registration_failed_retrying");
                        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    }
                }
            }
        });
    } else {
        warn!("no_public_key_found_skipping_registration");
    }

    // Peer Sync Loop
    let sync_node = node_arc.clone();
    let sync_client = cp_client.clone();
    tokio::spawn(async move {
        loop {
            // Initial delay and interval
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;

            match sync_client.fetch_peers().await {
                Ok(peers) => {
                    info!(count = peers.len(), "applying_peers");
                    if let Err(e) = sync_node.apply_peers(&peers) {
                        error!(error = ?e, "apply_peers_failed");
                    }
                }
                Err(e) => error!(error = ?e, "peer_sync_request_failed"),
            }
        }
    });

    // Periodic sampler to update metrics
    tokio::spawn(async move {
        use metrics::*;
        loop {
            if let Some(node) = vpn::VPN_NODE.get() {
                let statuses = node.collect_status();
                let mut total_active = 0usize;
                for st in &statuses {
                    total_active += st.active_sessions;
                    record_active_sessions_for(&st.protocol, st.active_sessions);
                    // record per protocol transfer totals as increments; compute deltas here is heavy; we let cloudwatch compute deltas via stored last values
                    record_transfer_for(&st.protocol, "egress", st.egress_bytes);
                    record_transfer_for(&st.protocol, "ingress", st.ingress_bytes);
                }
                record_active_sessions(total_active);
            }
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    });

    metrics::cloudwatch::start_publisher_task().await;

    let admin_server = tokio::spawn(run_admin(args.admin_port));

    info!(port = args.admin_port, "admin_server_started");

    tokio::select! {
        _ = signal::ctrl_c() => {
            info!(signal="ctrl_c");
        }
        r = admin_server => { if let Err(e)=r { error!("admin_error"=?e); } }
    }

    Ok(())
}

async fn run_admin(port: u16) {
    async fn health() -> &'static str { "ok" }
    async fn metrics() -> ([(axum::http::header::HeaderName, axum::http::HeaderValue); 1], Vec<u8>) {
        let buffer = crate::metrics::encode_prometheus();
        (
            [(axum::http::header::CONTENT_TYPE, axum::http::HeaderValue::from_static("text/plain; version=0.0.4"))],
            buffer,
        )
    }
    async fn status() -> axum::Json<Vec<crate::vpn::BackendStatus>> {
        let statuses = crate::vpn::VPN_NODE
            .get()
            .map(|n| n.collect_status())
            .unwrap_or_default();
        axum::Json(statuses)
    }

    async fn pubkey() -> axum::Json<Option<String>> {
        let pk = crate::vpn::VPN_NODE
            .get()
            .and_then(|n| n.get_public_key());
        axum::Json(pk)
    }

    let app = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics))
        .route("/status", get(status))
        .route("/pubkey", get(pubkey));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    axum::serve(TcpListener::bind(addr).await.unwrap(), app)
        .with_graceful_shutdown(async {
            signal::ctrl_c().await.ok();
        })
        .await
        .ok();
}
