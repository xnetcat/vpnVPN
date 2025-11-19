use axum::{routing::get, Router};
use clap::Parser;
use std::{env, net::SocketAddr};
use tokio::net::TcpListener;
use tokio::signal;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

mod admin;
mod metrics;
mod vpn;

#[derive(Parser, Debug, Clone)]
#[command(author, version, about, long_about = None)]
struct Cli {
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
}

#[tokio::main]
async fn main() {
    let filter_layer = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new("info"))
        .unwrap();
    tracing_subscriber::fmt()
        .with_env_filter(filter_layer)
        .with_target(false)
        .init();

    let args = Cli::parse();
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
        // In a real scenario we might want to exit, but for now we log error
        // and might fail later when trying to start backends
        std::process::exit(1);
    }
    info!("system_dependencies_check_passed");

    // Initialize VPN backends
    let protos_env = env::var("VPN_PROTOCOLS").unwrap_or_else(|_| "wireguard,openvpn,ikev2".into());
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

    let app = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics))
        .route("/status", get(status));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    axum::serve(TcpListener::bind(addr).await.unwrap(), app)
        .with_graceful_shutdown(async {
            signal::ctrl_c().await.ok();
        })
        .await
        .ok();
}
