use axum::{routing::get, Router};
use std::{env, net::SocketAddr};
use tokio::net::TcpListener;
use tokio::signal;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

mod admin;
mod net;
mod metrics;

#[tokio::main]
async fn main() {
    let filter_layer = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new("info"))
        .unwrap();
    tracing_subscriber::fmt().with_env_filter(filter_layer).with_target(false).init();

    let udp_port: u16 = env::var("LISTEN_UDP_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(51820);
    let tcp_port: u16 = env::var("LISTEN_TCP_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(51820);
    let admin_port: u16 = env::var("ADMIN_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8080);

    metrics::cloudwatch::start_publisher_task().await;

    let admin_server = tokio::spawn(run_admin(admin_port));
    let udp_task = tokio::spawn(net::listener::run_udp(udp_port));
    let tcp_task = tokio::spawn(net::listener::run_tcp(tcp_port));

    info!("server_started", udp_port, tcp_port, admin_port);

    tokio::select! {
        _ = signal::ctrl_c() => {
            info!("signal","ctrl_c");
        }
        r = admin_server => { if let Err(e)=r { error!("admin_error"=?e); } }
        r = udp_task => { if let Err(e)=r { error!("udp_error"=?e); } }
        r = tcp_task => { if let Err(e)=r { error!("tcp_error"=?e); } }
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

    let app = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    axum::serve(TcpListener::bind(addr).await.unwrap(), app)
        .with_graceful_shutdown(async {
            signal::ctrl_c().await.ok();
        })
        .await
        .ok();
}


