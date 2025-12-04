//! vpnVPN Daemon - Privileged VPN management service.
//!
//! This daemon runs with elevated privileges and manages:
//! - VPN connections (WireGuard, OpenVPN, IKEv2)
//! - Kill-switch and firewall rules
//! - Credential storage
//! - Network routing
//!
//! # Development Mode
//!
//! Run with `--dev` flag to use a user-accessible socket path:
//! ```bash
//! sudo cargo run -- --dev
//! ```
//!
//! For hot reload during development:
//! ```bash
//! sudo cargo watch -x 'run -- --dev'
//! ```

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod connectivity;
mod credentials;
mod firewall;
mod ipc;
mod platform;
mod state;
mod tools;
mod update;
mod vpn;

use anyhow::Result;
use clap::Parser;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

use state::DaemonState;

/// Daemon version.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Command-line arguments for the daemon.
#[derive(Parser, Debug)]
#[command(name = "vpnvpn-daemon")]
#[command(about = "vpnVPN privileged daemon for VPN management")]
#[command(version = VERSION)]
pub struct Args {
    /// Run in development mode with user-accessible socket
    #[arg(long, short)]
    pub dev: bool,

    /// Custom socket path (overrides default)
    #[arg(long)]
    pub socket: Option<String>,

    /// Log level (trace, debug, info, warn, error)
    #[arg(long, default_value = "info")]
    pub log_level: String,
}

/// Global config set from CLI args
pub static DEV_MODE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Get the socket path based on mode
pub fn get_socket_path() -> String {
    if DEV_MODE.load(std::sync::atomic::Ordering::Relaxed) {
        // Dev mode: use /tmp for easy access without root
        "/tmp/vpnvpn-daemon.sock".to_string()
    } else {
        // Production: use /var/run (requires root)
        "/var/run/vpnvpn-daemon.sock".to_string()
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // Set dev mode flag
    DEV_MODE.store(args.dev, std::sync::atomic::Ordering::Relaxed);

    // Initialize logging with specified level
    init_logging(&args.log_level);

    if args.dev {
        warn!("===========================================");
        warn!("  RUNNING IN DEVELOPMENT MODE");
        warn!("  Socket: {}", get_socket_path());
        warn!("  Hot reload: sudo cargo watch -x 'run -- --dev'");
        warn!("===========================================");
    }

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

    // Start internet connectivity monitoring task
    let monitor_state = Arc::clone(&state);
    tokio::spawn(async move {
        monitor_connectivity(monitor_state).await;
    });

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

fn init_logging(level: &str) {
    use tracing_subscriber::{fmt, prelude::*, EnvFilter};

    // Use RUST_LOG env var if set, otherwise use CLI argument
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(level));

    tracing_subscriber::registry()
        .with(
            fmt::layer()
                .with_target(true)
                .with_thread_ids(true)
                .with_ansi(true),
        ) // Enable colors in terminal
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

/// Monitor internet connectivity and auto-disconnect VPN if internet is lost.
async fn monitor_connectivity(state: Arc<RwLock<DaemonState>>) {
    use tokio::time::{interval, Duration};
    use vpnvpn_shared::protocol::ConnectionState;

    info!("Internet connectivity monitor started (checking every 5 seconds)");

    let mut interval = interval(Duration::from_secs(5));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        interval.tick().await;

        // Check if VPN is actually connected by checking both daemon state and actual interface
        let (is_connected_daemon, protocol, interface_name) = {
            let state = state.read().await;
            (
                state.connection.state == ConnectionState::Connected,
                state.connection.protocol,
                state.connection.interface_name.clone(),
            )
        };

        // Also check actual VPN interface status (in case daemon state is stale)
        let is_connected_actual = if let Some(protocol) = protocol {
            match protocol {
                vpnvpn_shared::Protocol::WireGuard => {
                    // Check if WireGuard interface exists and is up
                    if let Ok(status) = crate::vpn::wireguard::check_status().await {
                        status.state == ConnectionState::Connected
                    } else {
                        false
                    }
                }
                vpnvpn_shared::Protocol::OpenVPN => {
                    // Check if OpenVPN process is running
                    if let Ok(status) = crate::vpn::openvpn::check_status().await {
                        status.state == ConnectionState::Connected
                    } else {
                        false
                    }
                }
                vpnvpn_shared::Protocol::IKEv2 => {
                    // For IKEv2, rely on daemon state only
                    is_connected_daemon
                }
            }
        } else {
            false
        };

        // VPN is considered connected if either daemon says so OR interface is actually up
        let is_connected = is_connected_daemon || is_connected_actual;

        if !is_connected {
            // VPN not connected, skip check
            continue;
        }

        // VPN is connected, check internet connectivity
        let has_internet = connectivity::check_internet_connectivity().await;

        if !has_internet {
            // VPN connected but internet lost - auto-disconnect
            warn!(
                "VPN connected (interface: {:?}) but internet connection lost - auto-disconnecting",
                interface_name
            );

            if let Err(e) = crate::ipc::handler::auto_disconnect_vpn(state.clone()).await {
                error!("Failed to auto-disconnect VPN: {}", e);
            }
        }
    }
}
