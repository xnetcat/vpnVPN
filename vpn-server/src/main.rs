use axum::{routing::get, Router};
use std::{env, net::SocketAddr};
use tokio::net::TcpListener;
use tokio::signal;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

mod admin;
mod metrics;
mod vpn;

#[tokio::main]
async fn main() {
    let filter_layer = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new("info"))
        .unwrap();
    tracing_subscriber::fmt().with_env_filter(filter_layer).with_target(false).init();

    let admin_port: u16 = env::var("ADMIN_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8080);

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
    let node = vpn::VpnNode::new(&enabled).expect("vpn node init");
    node.start_all();
    let _ = vpn::VPN_NODE.set(std::sync::Arc::new(node));

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

    let admin_server = tokio::spawn(run_admin(admin_port));

    info!(admin_port, "server_started");

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


