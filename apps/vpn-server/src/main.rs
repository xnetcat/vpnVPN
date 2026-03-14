use axum::{routing::get, Router};
use clap::{Args, Parser, Subcommand};
use std::{env, net::SocketAddr};
use tokio::net::TcpListener;
use tokio::signal;
use tracing::{error, info, warn};

mod admin;
mod client;
mod ikev2;
mod logging;
mod metrics;
mod net;
mod pki;
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
    let log_buffer = logging::init_logging();
    let cli = Cli::parse();

    match cli.command {
        Command::Run(args) => {
            if let Err(code) = run_server(args, log_buffer).await {
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

    info!(target: "doctor", "doctor_checks_passed");
    true
}

/// Set up IP forwarding and NAT masquerading for VPN client traffic.
/// This allows VPN clients to access the internet through the VPN node.
fn setup_nat_and_forwarding() -> Result<(), i32> {
    use std::process::Command;

    info!("setting_up_ip_forwarding_and_nat");

    // Enable IPv4 forwarding
    let forward_result = Command::new("sysctl")
        .args(["-w", "net.ipv4.ip_forward=1"])
        .output();

    match forward_result {
        Ok(output) if output.status.success() => {
            info!("ipv4_forwarding_enabled");
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!(stderr = stderr.as_ref(), "failed_to_enable_ipv4_forwarding");
        }
        Err(e) => {
            warn!(error = ?e, "failed_to_run_sysctl_for_ipv4_forwarding");
        }
    }

    // Enable IPv6 forwarding (needed for WireGuard/IKEv2 IPv6 pools)
    let forward_v6_result = Command::new("sysctl")
        .args(["-w", "net.ipv6.conf.all.forwarding=1"])
        .output();

    match forward_v6_result {
        Ok(output) if output.status.success() => {
            info!("ipv6_forwarding_enabled");
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!(stderr = stderr.as_ref(), "failed_to_enable_ipv6_forwarding");
        }
        Err(e) => {
            warn!(error = ?e, "failed_to_run_sysctl_for_ipv6_forwarding");
        }
    }

    // Find the default route interface
    // In host network mode, this will be the host's main interface (e.g., en0, eth0, wlan0)
    // In Docker bridge mode, this will be eth0
    let default_iface = find_default_interface().unwrap_or_else(|| {
        warn!("could_not_determine_default_interface_using_eth0");
        "eth0".to_string()
    });

    // Validate interface name to prevent iptables argument injection
    if !default_iface.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
        || default_iface.is_empty()
        || default_iface.len() > 15
    {
        error!(interface = default_iface.as_str(), "invalid_interface_name");
        return Err(1);
    }

    info!(
        interface = default_iface.as_str(),
        "setting_up_nat_masquerading"
    );

    // Set up NAT masquerading for traffic from VPN interface (wg0) going out the default interface
    // This allows VPN clients to access the internet
    let masq_result = Command::new("iptables")
        .args([
            "-t",
            "nat",
            "-C",
            "POSTROUTING",
            "-o",
            &default_iface,
            "-j",
            "MASQUERADE",
        ])
        .output();

    // If rule doesn't exist, add it
    let needs_add = match masq_result {
        Ok(output) => !output.status.success(), // Rule doesn't exist if check fails
        Err(_) => true,                         // Command failed, assume we need to add
    };

    if needs_add {
        let add_result = Command::new("iptables")
            .args([
                "-t",
                "nat",
                "-A",
                "POSTROUTING",
                "-o",
                &default_iface,
                "-j",
                "MASQUERADE",
            ])
            .output();

        match add_result {
            Ok(output) if output.status.success() => {
                info!(
                    interface = default_iface.as_str(),
                    "nat_masquerading_configured"
                );
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                error!(
                    stderr = stderr.as_ref(),
                    interface = default_iface.as_str(),
                    "failed_to_setup_nat_masquerading"
                );
                return Err(1);
            }
            Err(e) => {
                error!(error = ?e, interface = default_iface.as_str(), "failed_to_run_iptables_for_nat");
                return Err(1);
            }
        }
    } else {
        info!(
            interface = default_iface.as_str(),
            "nat_masquerading_already_configured"
        );
    }

    Ok(())
}

/// Find the default network interface by checking the default route.
fn find_default_interface() -> Option<String> {
    use std::process::Command;

    // Try 'ip route' first (Linux)
    if let Ok(output) = Command::new("ip")
        .args(["route", "show", "default"])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Parse "default via ... dev eth0 ..."
            for line in stdout.lines() {
                if let Some(dev_pos) = line.find("dev ") {
                    let after_dev = &line[dev_pos + 4..];
                    if let Some(space_pos) = after_dev.find(char::is_whitespace) {
                        let iface = after_dev[..space_pos].trim();
                        if !iface.is_empty() {
                            return Some(iface.to_string());
                        }
                    } else if !after_dev.trim().is_empty() {
                        return Some(after_dev.trim().to_string());
                    }
                }
            }
        }
    }

    // Fallback: try to find any non-loopback interface
    if let Ok(output) = Command::new("ip").args(["route", "show"]).output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some(dev_pos) = line.find("dev ") {
                    let after_dev = &line[dev_pos + 4..];
                    if let Some(space_pos) = after_dev.find(char::is_whitespace) {
                        let iface = after_dev[..space_pos].trim();
                        if !iface.is_empty() && iface != "lo" && !iface.starts_with("wg") {
                            return Some(iface.to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

async fn run_server(
    args: RunArgs,
    log_buffer: std::sync::Arc<logging::LogBuffer>,
) -> Result<(), i32> {
    info!(
        api_url = %args.api_url,
        listen_port = args.listen_port,
        admin_port = args.admin_port,
        "starting_vpn_server"
    );

    // Start Admin Server EARLY so we can debug registration failures
    let admin_server = tokio::spawn(run_admin(args.admin_port, log_buffer));
    info!(port = args.admin_port, "admin_server_started_early");

    // Log environment for debugging
    info!(
        server_id = env::var("SERVER_ID").ok(),
        vpn_region = env::var("VPN_REGION").ok(),
        vpn_protocols = env::var("VPN_PROTOCOLS").ok(),
        metrics_url = env::var("METRICS_URL").ok().map(|_| "[SET]"),
        "environment_variables"
    );

    // Check system dependencies
    info!("checking_system_dependencies");
    let nm = crate::net::os::get_network_manager();
    if let Err(e) = nm.check_dependencies() {
        error!(error = ?e, "missing_dependencies");
        return Err(1);
    }
    info!("system_dependencies_check_passed");

    // Initialize VPN backends
    let protos_env = env::var("VPN_PROTOCOLS").unwrap_or_else(|_| "wireguard,openvpn,ikev2".into());
    info!(
        protocols_config = protos_env.as_str(),
        "parsing_vpn_protocols"
    );

    let enabled: Vec<vpn::VpnProtocol> = protos_env
        .split(',')
        .map(|s| s.trim().to_ascii_lowercase())
        .filter_map(|s| match s.as_str() {
            "wireguard" => Some(vpn::VpnProtocol::WireGuard),
            "openvpn" => Some(vpn::VpnProtocol::OpenVpn),
            "ikev2" => Some(vpn::VpnProtocol::IkeV2),
            other => {
                warn!(protocol = other, "unknown_protocol_skipped");
                None
            }
        })
        .collect();

    info!(
        enabled_protocols = ?enabled.iter().map(|p| p.as_str()).collect::<Vec<_>>(),
        "vpn_protocols_enabled"
    );

    info!("initializing_vpn_node");
    let node = match vpn::VpnNode::new(&enabled, args.listen_port) {
        Ok(n) => {
            info!("vpn_node_created_successfully");
            n
        }
        Err(e) => {
            error!(error = ?e, "failed_to_create_vpn_node");
            return Err(1);
        }
    };

    info!("starting_all_vpn_backends");
    node.start_all();

    // Set up IP forwarding and NAT masquerading for VPN client traffic
    // This allows VPN clients to access the internet through the VPN node
    setup_nat_and_forwarding()?;

    let node_arc = std::sync::Arc::new(node);
    let _ = vpn::VPN_NODE.set(node_arc.clone());
    info!("vpn_node_registered_globally");

    // Optional static peer for local/docker tests (bypasses control plane peer sync)
    // Treat empty env/flag as "disabled" so docker default-empty vars don't break WireGuard.
    if let Some(static_pk) = args
        .static_peer_public_key
        .clone()
        .filter(|pk| !pk.trim().is_empty())
    {
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
            username: None,
            password: None,
        };

        match node_arc.apply_peers(&[static_peer]) {
            Ok(_) => info!("applied_static_peer_configuration"),
            Err(e) => error!(error = ?e, "static_peer_apply_failed"),
        }
    }

    // Client initialization
    let server_id = env::var("SERVER_ID")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "vpn-node".to_string());

    let cp_client = std::sync::Arc::new(crate::client::ControlPlaneClient::new(
        args.api_url.clone(),
        args.token.clone(),
        server_id.clone(),
    ));

    // Detect public IP early for metadata
    let detected_public_ip = cp_client.detect_public_ip().await;

    // Detect geolocation BEFORE spawning any tasks to avoid thread-unsafe env::set_var.
    // All env vars must be set before spawning async tasks.
    if let Some(ref ip) = detected_public_ip {
        info!(ip = ip.as_str(), "detected_public_ip");

        if env::var("VPN_IKEV2_REMOTE").is_err() {
            env::set_var("VPN_IKEV2_REMOTE", format!("{ip}:500"));
        }
        if env::var("VPN_WG_ENDPOINT").is_err() {
            env::set_var("VPN_WG_ENDPOINT", ip.clone());
        }
        if env::var("VPN_OVPN_ENDPOINT").is_err() {
            env::set_var("VPN_OVPN_ENDPOINT", ip.clone());
        }

        // Detect geolocation synchronously (before spawning tasks)
        if env::var("VPN_REGION").is_err() || env::var("VPN_COUNTRY").is_err() {
            if let Some((country, region)) = cp_client.detect_geolocation(ip).await {
                info!(
                    country = country.as_str(),
                    region = region.as_str(),
                    "detected_geolocation_from_ip"
                );
                env::set_var("VPN_COUNTRY", &country);
                env::set_var("VPN_REGION", &region);
            } else {
                warn!("failed_to_detect_geolocation");
            }
        }
    }

    if env::var("VPN_WG_PORT").is_err() {
        env::set_var("VPN_WG_PORT", args.listen_port.to_string());
    }
    if env::var("VPN_OVPN_PORT").is_err() {
        env::set_var("VPN_OVPN_PORT", "1194");
    }

    // Registration (fail fast if we cannot talk to the control plane)
    if let Some(pubkey) = node_arc.get_public_key() {
        let client = cp_client.clone();
        let listen_port = args.listen_port;

        // Generate self-signed PKI for OpenVPN/IKE if none provided via env
        let pki_artifacts = match pki::ensure_pki(detected_public_ip.clone()) {
            Ok(pki) => {
                // Set env vars before any tasks are spawned (safe, single-threaded context)
                env::set_var("VPN_OVPN_CA_BUNDLE", &pki.ca_pem);
                env::set_var("VPN_OVPN_PEER_FINGERPRINT", &pki.server_fingerprint);
                pki
            }
            Err(err) => {
                warn!(error = ?err, "pki_generation_failed");
                return Err(1);
            }
        };

        // Attempt to start IKEv2 (strongSwan) with generated PKI
        if let Ok(meta) = crate::ikev2::setup_ikev2(
            detected_public_ip.clone(),
            &pki_artifacts.ca_pem,
            &pki_artifacts.server_pem,
            &pki_artifacts.server_fingerprint,
        ) {
            if env::var("VPN_IKEV2_REMOTE").is_err() {
                env::set_var("VPN_IKEV2_REMOTE", &meta.remote);
            }
            env::set_var("VPN_IKEV2_FINGERPRINT", &meta.server_fingerprint);
            env::set_var("VPN_IKEV2_CA_BUNDLE", &meta.ca_pem);
        }

        const MAX_ATTEMPTS: u32 = 12; // ~1 minute of retries
        let mut attempts: u32 = 0;

        loop {
            attempts += 1;
            match client.register(&pubkey, listen_port).await {
                Ok(_) => {
                    info!("successfully_registered_with_control_plane");
                    break;
                }
                Err(e) => {
                    error!(error = ?e, attempt = attempts, "registration_failed_retrying");
                    if attempts >= MAX_ATTEMPTS {
                        error!("registration_failed_max_retries; exiting vpn-node");
                        return Err(1);
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
        }
    } else {
        warn!("no_public_key_found; cannot register with control plane");
        return Err(1);
    }

    // Peer Sync Loop
    let sync_node = node_arc.clone();
    let sync_client = cp_client.clone();
    tokio::spawn(async move {
        loop {
            // Initial delay and interval
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;

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

    // Heartbeat Loop - send periodic status updates to stay marked as online
    let heartbeat_node = node_arc.clone();
    let heartbeat_client = cp_client.clone();
    tokio::spawn(async move {
        let public_ip = detected_public_ip.clone();

        loop {
            // Send heartbeat every 2 minutes (well under the 5 minute offline threshold)
            tokio::time::sleep(std::time::Duration::from_secs(120)).await;

            if let Some(pubkey) = heartbeat_node.get_public_key() {
                match heartbeat_client
                    .heartbeat(&pubkey, args.listen_port, public_ip.clone())
                    .await
                {
                    Ok(_) => info!("heartbeat_sent"),
                    Err(e) => error!(error = ?e, "heartbeat_failed"),
                }
            }
        }
    });

    // Periodic sampler to update in-process Prometheus metrics
    tokio::spawn(async move {
        use metrics::*;
        loop {
            if let Some(node) = vpn::VPN_NODE.get() {
                let statuses = node.collect_status();
                let mut total_active = 0usize;
                for st in &statuses {
                    total_active += st.active_sessions;
                    record_active_sessions_for(&st.protocol, st.active_sessions);
                    record_transfer_for(&st.protocol, "egress", st.egress_bytes);
                    record_transfer_for(&st.protocol, "ingress", st.ingress_bytes);
                }
                record_active_sessions(total_active);
            }
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    });

    // Optional metrics ingestion to external metrics service
    if let Ok(metrics_url) = std::env::var("METRICS_URL") {
        let server_id = std::env::var("SERVER_ID")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "vpn-node".to_string());
        let region = std::env::var("VPN_REGION").ok();

        let client = reqwest::Client::new();

        // System information snapshot used to derive CPU and memory usage.
        let mut sys = sysinfo::System::new_all();

        tokio::spawn(async move {
            loop {
                // Refresh basic system metrics
                sys.refresh_cpu();
                sys.refresh_memory();

                let cpu = sys.global_cpu_info().cpu_usage() as f64;
                let total_mem = sys.total_memory() as f64;
                let used_mem = sys.used_memory() as f64;
                let mem_ratio = if total_mem > 0.0 {
                    (used_mem / total_mem).clamp(0.0, 1.0)
                } else {
                    0.0
                };

                if let Some(node) = vpn::VPN_NODE.get() {
                    let statuses = node.collect_status();
                    let mut total_active = 0usize;
                    for st in &statuses {
                        total_active += st.active_sessions;
                    }

                    let body = serde_json::json!({
                        "serverId": server_id,
                        "activePeers": total_active,
                        "region": region,
                        "cpu": cpu,
                        "memory": mem_ratio,
                    });

                    if let Err(e) = client.post(&metrics_url).json(&body).send().await {
                        error!(error=?e, "metrics_publish_failed");
                    }
                }

                tokio::time::sleep(std::time::Duration::from_secs(15)).await;
            }
        });
    }

    tokio::select! {
        _ = signal::ctrl_c() => {
            info!(signal="ctrl_c");
        }
        r = admin_server => { if let Err(e)=r { error!("admin_error"=?e); } }
    }

    Ok(())
}

async fn run_admin(port: u16, log_buffer: std::sync::Arc<logging::LogBuffer>) {
    use axum::http::{header, StatusCode};
    use axum::response::IntoResponse;

    // Admin token for sensitive endpoints (logs, status, pubkey).
    // If not set, these endpoints return 403.
    let admin_token: Option<String> = std::env::var("ADMIN_API_TOKEN").ok()
        .filter(|t| !t.trim().is_empty());

    fn check_admin_auth(headers: &axum::http::HeaderMap, expected: &Option<String>) -> bool {
        match expected {
            None => false, // No token configured = sensitive endpoints disabled
            Some(token) => {
                if let Some(auth) = headers.get(header::AUTHORIZATION) {
                    if let Ok(val) = auth.to_str() {
                        if val.starts_with("Bearer ") {
                            return &val[7..] == token.as_str();
                        }
                    }
                }
                false
            }
        }
    }

    #[derive(serde::Serialize)]
    struct HealthCheck {
        status: &'static str,
        #[serde(skip_serializing_if = "Option::is_none")]
        active: Option<Vec<String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    }

    #[derive(serde::Serialize)]
    struct HealthResponse {
        status: &'static str,
        timestamp: String,
        service: &'static str,
        checks: std::collections::HashMap<String, HealthCheck>,
    }

    async fn health() -> impl IntoResponse {
        let mut checks = std::collections::HashMap::new();

        // VPN backends check
        let vpn_check = if let Some(node) = crate::vpn::VPN_NODE.get() {
            let statuses = node.collect_status();
            let active_protocols: Vec<String> = statuses
                .iter()
                .filter(|s| s.running)
                .map(|s| s.protocol.clone())
                .collect();

            if active_protocols.is_empty() {
                HealthCheck {
                    status: "error",
                    active: Some(vec![]),
                    error: Some("No VPN backends running".to_string()),
                }
            } else {
                HealthCheck {
                    status: "ok",
                    active: Some(active_protocols),
                    error: None,
                }
            }
        } else {
            HealthCheck {
                status: "error",
                active: None,
                error: Some("VPN node not initialized".to_string()),
            }
        };
        checks.insert("vpnBackends".to_string(), vpn_check);

        // System resources check (basic sanity)
        let mut sys = sysinfo::System::new();
        sys.refresh_memory();
        let total_mem = sys.total_memory();
        let used_mem = sys.used_memory();
        let mem_ratio = if total_mem > 0 {
            (used_mem as f64 / total_mem as f64).clamp(0.0, 1.0)
        } else {
            0.0
        };

        // Consider system unhealthy if memory usage exceeds 95%
        let system_check = if mem_ratio > 0.95 {
            HealthCheck {
                status: "error",
                active: None,
                error: Some(format!("Memory usage critical: {:.1}%", mem_ratio * 100.0)),
            }
        } else {
            HealthCheck {
                status: "ok",
                active: None,
                error: None,
            }
        };
        checks.insert("system".to_string(), system_check);

        // Determine overall status
        let has_error = checks.values().any(|c| c.status == "error");
        let overall_status = if has_error { "unhealthy" } else { "healthy" };

        let response = HealthResponse {
            status: overall_status,
            timestamp: chrono::Utc::now().to_rfc3339(),
            service: "vpn-server",
            checks,
        };

        let status_code = if has_error {
            StatusCode::SERVICE_UNAVAILABLE
        } else {
            StatusCode::OK
        };

        (status_code, axum::Json(response))
    }

    async fn metrics() -> (
        [(axum::http::header::HeaderName, axum::http::HeaderValue); 1],
        Vec<u8>,
    ) {
        let buffer = crate::metrics::encode_prometheus();
        (
            [(
                axum::http::header::CONTENT_TYPE,
                axum::http::HeaderValue::from_static("text/plain; version=0.0.4"),
            )],
            buffer,
        )
    }
    // status, pubkey, logs endpoints below require ADMIN_API_TOKEN auth

    #[derive(Clone)]
    struct AdminState {
        log_buffer: std::sync::Arc<logging::LogBuffer>,
        admin_token: Option<String>,
    }

    async fn logs_authed(
        axum::extract::State(state): axum::extract::State<AdminState>,
        headers: axum::http::HeaderMap,
    ) -> impl IntoResponse {
        if !check_admin_auth(&headers, &state.admin_token) {
            return (StatusCode::FORBIDDEN, "Admin token required".to_string());
        }
        (StatusCode::OK, state.log_buffer.snapshot().join("\n"))
    }

    async fn status_authed(
        axum::extract::State(state): axum::extract::State<AdminState>,
        headers: axum::http::HeaderMap,
    ) -> impl IntoResponse {
        if !check_admin_auth(&headers, &state.admin_token) {
            return (StatusCode::FORBIDDEN, axum::Json(Vec::new()));
        }
        let statuses = crate::vpn::VPN_NODE
            .get()
            .map(|n| n.collect_status())
            .unwrap_or_default();
        (StatusCode::OK, axum::Json(statuses))
    }

    async fn pubkey() -> axum::Json<Option<String>> {
        let pk = crate::vpn::VPN_NODE.get().and_then(|n| n.get_public_key());
        axum::Json(pk)
    }

    let admin_state = AdminState {
        log_buffer: log_buffer.clone(),
        admin_token: admin_token.clone(),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics))
        .route("/status", get(status_authed))
        .route("/pubkey", get(pubkey))
        .route("/logs", get(logs_authed))
        .with_state(admin_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    axum::serve(TcpListener::bind(addr).await.unwrap(), app)
        .with_graceful_shutdown(async {
            signal::ctrl_c().await.ok();
        })
        .await
        .ok();
}
