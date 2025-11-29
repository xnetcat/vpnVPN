//! vpnVPN Daemon - Privileged VPN management service.
//!
//! This daemon runs with elevated privileges and manages:
//! - VPN connections (WireGuard, OpenVPN, IKEv2)
//! - Kill-switch and firewall rules
//! - Credential storage
//! - Network routing

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod credentials;
mod firewall;
mod ipc;
mod platform;
mod state;
mod update;
mod vpn;

use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};

use state::DaemonState;

/// Daemon version.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    init_logging();

    info!("vpnVPN Daemon v{} starting...", VERSION);

    // Platform-specific initialization
    #[cfg(target_os = "macos")]
    platform::macos::init()?;

    #[cfg(target_os = "windows")]
    platform::windows::init()?;

    #[cfg(target_os = "linux")]
    platform::linux::init()?;

    // Load configuration
    let config = vpnvpn_shared::config::config_file("daemon.json")
        .and_then(|path| {
            if path.exists() {
                std::fs::read_to_string(&path)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
            } else {
                None
            }
        })
        .unwrap_or_default();

    // Create daemon state
    let state = Arc::new(RwLock::new(DaemonState::new(config)));

    // Start IPC server
    let ipc_handle = {
        let state = Arc::clone(&state);
        tokio::spawn(async move {
            if let Err(e) = ipc::server::run(state).await {
                error!("IPC server error: {}", e);
            }
        })
    };

    // Set up signal handlers for graceful shutdown
    let shutdown_state = Arc::clone(&state);
    tokio::spawn(async move {
        if let Err(e) = wait_for_shutdown().await {
            error!("Shutdown signal error: {}", e);
        }

        info!("Shutdown signal received, cleaning up...");

        // Cleanup
        let mut state = shutdown_state.write().await;
        if let Err(e) = state.cleanup().await {
            error!("Cleanup error: {}", e);
        }
    });

    // Wait for IPC server to finish
    ipc_handle.await?;

    info!("vpnVPN Daemon stopped");
    Ok(())
}

fn init_logging() {
    use tracing_subscriber::{fmt, prelude::*, EnvFilter};

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(fmt::layer().with_target(true).with_thread_ids(true))
        .with(filter)
        .init();
}

async fn wait_for_shutdown() -> Result<()> {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};

        let mut sigterm = signal(SignalKind::terminate())?;
        let mut sigint = signal(SignalKind::interrupt())?;

        tokio::select! {
            _ = sigterm.recv() => {
                info!("Received SIGTERM");
            }
            _ = sigint.recv() => {
                info!("Received SIGINT");
            }
        }
    }

    #[cfg(windows)]
    {
        tokio::signal::ctrl_c().await?;
        info!("Received Ctrl+C");
    }

    Ok(())
}

