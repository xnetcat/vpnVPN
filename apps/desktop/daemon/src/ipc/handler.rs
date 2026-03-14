//! Request handler for IPC messages.

use crate::state::DaemonState;
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};
use vpnvpn_shared::{
    ipc::{DaemonRequest, DaemonResponse},
    ErrorCode,
};

/// Handle a daemon request.
pub async fn handle_request(
    state: Arc<RwLock<DaemonState>>,
    request: DaemonRequest,
) -> DaemonResponse {
    debug!("Handling request: {:?}", request);

    match request {
        DaemonRequest::Ping => DaemonResponse::Pong,

        DaemonRequest::GetStatus => {
            let state = state.read().await;
            DaemonResponse::Status(state.status())
        }

        DaemonRequest::GetConnectionStatus => {
            let state = state.read().await;
            DaemonResponse::ConnectionStatus(state.connection.clone())
        }

        DaemonRequest::GetSettings => {
            let state = state.read().await;
            DaemonResponse::Settings(state.settings.clone())
        }

        DaemonRequest::UpdateSettings { settings } => {
            let mut state = state.write().await;

            // Check if binary paths changed, so we need to refresh tools
            let paths_changed = state.settings.binary_paths != settings.binary_paths;

            state.settings = settings.clone();

            // Save settings to disk
            if let Some(path) = vpnvpn_shared::config::config_file("daemon.json") {
                if let Some(parent) = path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                match serde_json::to_string_pretty(&settings) {
                    Ok(json) => {
                        if let Err(e) = std::fs::write(&path, json) {
                            error!("Failed to save settings: {}", e);
                        }
                    }
                    Err(e) => error!("Failed to serialize settings: {}", e),
                }
            }

            // Refresh tools if paths changed
            if paths_changed {
                state.refresh_vpn_tools();
            }

            DaemonResponse::Ok
        }

        DaemonRequest::GetVpnTools => {
            let state = state.read().await;
            DaemonResponse::VpnTools(state.vpn_tools.clone())
        }

        DaemonRequest::RefreshVpnTools => {
            info!("Refresh VPN tools request");
            let mut state = state.write().await;
            state.refresh_vpn_tools();
            DaemonResponse::VpnTools(state.vpn_tools.clone())
        }

        DaemonRequest::UpdateBinaryPaths { paths } => {
            info!("Update binary paths request");
            debug!("  WG path: {:?}", paths.wg_quick_path);
            debug!("  OpenVPN path: {:?}", paths.openvpn_path);
            debug!("  IKEv2 path: {:?}", paths.ikev2_path);

            let mut state = state.write().await;
            state.update_binary_paths(paths);

            // Save settings to disk
            if let Some(path) = vpnvpn_shared::config::config_file("daemon.json") {
                if let Some(parent) = path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                match serde_json::to_string_pretty(&state.settings) {
                    Ok(json) => {
                        if let Err(e) = std::fs::write(&path, json) {
                            error!("Failed to save settings: {}", e);
                        }
                    }
                    Err(e) => error!("Failed to serialize settings: {}", e),
                }
            }

            DaemonResponse::VpnTools(state.vpn_tools.clone())
        }

        DaemonRequest::Connect { config } => {
            info!("Connect request received");
            info!("  Protocol: {:?}", config.protocol);
            info!(
                "  Endpoint: {}:{}",
                config.server_endpoint, config.server_port
            );
            info!("  Server ID: {}", config.server_id);
            info!("  Assigned IP: {:?}", config.assigned_ip);
            info!("  Has WG private key: {}", config.wg_private_key.is_some());
            info!(
                "  Has WG server public key: {}",
                config.wg_server_public_key.is_some()
            );
            info!("  DNS: {:?}", config.dns_servers);

            let binary_paths = {
                let state_read = state.read().await;
                state_read.settings.binary_paths.clone()
            };

            let result = match config.protocol {
                vpnvpn_shared::Protocol::WireGuard => crate::vpn::wireguard::connect(&config, &binary_paths).await,
                vpnvpn_shared::Protocol::OpenVPN => crate::vpn::openvpn::connect(&config, &binary_paths).await,
                vpnvpn_shared::Protocol::IKEv2 => crate::vpn::ikev2::connect(&config, &binary_paths).await,
            };

            match result {
                Ok(status) => {
                    let mut state = state.write().await;
                    state.connection = status.clone();

                    // Enable kill-switch if configured
                    if state.settings.kill_switch_enabled {
                        if let Some(iface) = &status.interface_name {
                            let allow_lan = state.settings.allow_lan;
                            if let Err(e) = enable_kill_switch(iface, allow_lan).await {
                                warn!("Failed to enable kill-switch: {}", e);
                            } else {
                                state.kill_switch_active = true;
                            }
                        }
                    }

                    DaemonResponse::ConnectionStatus(status)
                }
                Err(e) => {
                    error!("Connect failed: {}", e);
                    DaemonResponse::error(ErrorCode::ConnectionFailed as i32, e.to_string())
                }
            }
        }

        DaemonRequest::Disconnect => {
            info!("Disconnect request");

            let mut state = state.write().await;

            // Disable kill-switch first if active
            if state.kill_switch_active {
                if let Err(e) = disable_kill_switch().await {
                    warn!("Failed to disable kill-switch: {}", e);
                }
                state.kill_switch_active = false;
            }

            let binary_paths = state.settings.binary_paths.clone();

            // Disconnect based on current protocol
            let result = if let Some(protocol) = state.connection.protocol {
                match protocol {
                    vpnvpn_shared::Protocol::WireGuard => crate::vpn::wireguard::disconnect(&binary_paths).await,
                    vpnvpn_shared::Protocol::OpenVPN => crate::vpn::openvpn::disconnect().await,
                    vpnvpn_shared::Protocol::IKEv2 => crate::vpn::ikev2::disconnect().await,
                }
            } else {
                Ok(())
            };

            match result {
                Ok(()) => {
                    state.connection = vpnvpn_shared::ConnectionStatus::default();
                    DaemonResponse::Ok
                }
                Err(e) => {
                    error!("Disconnect failed: {}", e);
                    DaemonResponse::error(ErrorCode::ConnectionFailed as i32, e.to_string())
                }
            }
        }

        DaemonRequest::EnableKillSwitch { allow_lan } => {
            info!("Enable kill-switch request (allow_lan={})", allow_lan);

            let state_read = state.read().await;
            let interface = state_read.connection.interface_name.clone();
            drop(state_read);

            if let Some(iface) = interface {
                match enable_kill_switch(&iface, allow_lan).await {
                    Ok(()) => {
                        let mut state = state.write().await;
                        state.kill_switch_active = true;
                        DaemonResponse::Ok
                    }
                    Err(e) => {
                        error!("Enable kill-switch failed: {}", e);
                        DaemonResponse::error(
                            ErrorCode::KillSwitchEnableFailed as i32,
                            e.to_string(),
                        )
                    }
                }
            } else {
                DaemonResponse::error(
                    ErrorCode::NotConnected as i32,
                    "VPN not connected, cannot enable kill-switch",
                )
            }
        }

        DaemonRequest::DisableKillSwitch => {
            info!("Disable kill-switch request");

            match disable_kill_switch().await {
                Ok(()) => {
                    let mut state = state.write().await;
                    state.kill_switch_active = false;
                    DaemonResponse::Ok
                }
                Err(e) => {
                    error!("Disable kill-switch failed: {}", e);
                    DaemonResponse::error(ErrorCode::KillSwitchDisableFailed as i32, e.to_string())
                }
            }
        }

        DaemonRequest::StoreCredential { key, value } => {
            debug!("Store credential request for key: {}", key);

            match crate::credentials::store(&key, &value) {
                Ok(()) => DaemonResponse::Ok,
                Err(e) => {
                    error!("Store credential failed: {}", e);
                    DaemonResponse::error(ErrorCode::CredentialStoreFailed as i32, e.to_string())
                }
            }
        }

        DaemonRequest::GetCredential { key } => {
            debug!("Get credential request for key: {}", key);

            match crate::credentials::get(&key) {
                Ok(value) => DaemonResponse::Credential { value },
                Err(e) => {
                    error!("Get credential failed: {}", e);
                    DaemonResponse::error(ErrorCode::CredentialNotFound as i32, e.to_string())
                }
            }
        }

        DaemonRequest::DeleteCredential { key } => {
            debug!("Delete credential request for key: {}", key);

            match crate::credentials::delete(&key) {
                Ok(()) => DaemonResponse::Ok,
                Err(e) => {
                    error!("Delete credential failed: {}", e);
                    DaemonResponse::error(ErrorCode::CredentialDeleteFailed as i32, e.to_string())
                }
            }
        }

        DaemonRequest::InstallService => {
            info!("Install service request");
            // This is typically called from the GUI with elevated privileges
            // The daemon itself doesn't install - it's already running
            DaemonResponse::error(
                ErrorCode::NotImplemented as i32,
                "Service installation is handled by the GUI",
            )
        }

        DaemonRequest::UninstallService => {
            info!("Uninstall service request");
            DaemonResponse::error(
                ErrorCode::NotImplemented as i32,
                "Service uninstallation is handled by the GUI",
            )
        }

        DaemonRequest::RestartService => {
            info!("Restart service request");
            // Schedule a restart
            #[cfg(target_os = "macos")]
            {
                tokio::spawn(async {
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    let _ = std::process::Command::new("launchctl")
                        .args(["kickstart", "-k", "system/com.vpnvpn.daemon"])
                        .spawn();
                });
            }

            #[cfg(target_os = "linux")]
            {
                tokio::spawn(async {
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    let _ = std::process::Command::new("systemctl")
                        .args(["restart", "vpnvpn-daemon"])
                        .spawn();
                });
            }

            #[cfg(target_os = "windows")]
            {
                tokio::spawn(async {
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    let _ = std::process::Command::new("sc")
                        .args(["stop", "vpnvpn-daemon"])
                        .spawn();
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    let _ = std::process::Command::new("sc")
                        .args(["start", "vpnvpn-daemon"])
                        .spawn();
                });
            }

            DaemonResponse::Ok
        }

        DaemonRequest::PrepareUpdate { new_binary_path } => {
            info!("Prepare update request: {}", new_binary_path);

            // Validate the new binary exists
            if !std::path::Path::new(&new_binary_path).exists() {
                return DaemonResponse::error(
                    ErrorCode::InvalidConfig as i32,
                    "New binary not found",
                );
            }

            // TODO: Verify binary signature

            // Copy to staging location
            #[cfg(target_os = "macos")]
            let staging_path = "/Library/PrivilegedHelperTools/com.vpnvpn.daemon.new";
            #[cfg(target_os = "linux")]
            let staging_path = "/usr/local/bin/vpnvpn-daemon.new";
            #[cfg(target_os = "windows")]
            let staging_path = r"C:\Program Files\vpnVPN\vpnvpn-daemon.new.exe";
            #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
            let staging_path = "/tmp/vpnvpn-daemon.new";

            match std::fs::copy(&new_binary_path, staging_path) {
                Ok(_) => {
                    info!("Update staged at {}", staging_path);
                    DaemonResponse::UpdateReady
                }
                Err(e) => {
                    error!("Failed to stage update: {}", e);
                    DaemonResponse::error(ErrorCode::InternalError as i32, e.to_string())
                }
            }
        }

        DaemonRequest::Authenticate { nonce, .. } => {
            debug!("Authenticate request with nonce");

            // Simple nonce validation for now
            // TODO: Implement full code-signing verification
            if nonce.len() < 16 {
                return DaemonResponse::error(ErrorCode::InvalidNonce as i32, "Invalid nonce");
            }

            let token = super::server::generate_session_token();

            // Store session (we don't have PID here, use 0)
            {
                let mut state = state.write().await;
                state.add_session(token.clone(), 0);
            }

            DaemonResponse::Authenticated {
                session_token: token,
            }
        }
    }
}

async fn enable_kill_switch(interface: &str, allow_lan: bool) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        crate::firewall::macos::enable_kill_switch(interface, allow_lan)
    }

    #[cfg(target_os = "windows")]
    {
        crate::firewall::windows::enable_kill_switch(interface, allow_lan)
    }

    #[cfg(target_os = "linux")]
    {
        crate::firewall::linux::enable_kill_switch(interface, allow_lan)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err(anyhow::anyhow!("Platform not supported"))
    }
}

async fn disable_kill_switch() -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        crate::firewall::macos::disable_kill_switch()
    }

    #[cfg(target_os = "windows")]
    {
        crate::firewall::windows::disable_kill_switch()
    }

    #[cfg(target_os = "linux")]
    {
        crate::firewall::linux::disable_kill_switch()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err(anyhow::anyhow!("Platform not supported"))
    }
}

/// Auto-disconnect VPN when internet connection is lost.
/// This is called by the connectivity monitoring task.
pub async fn auto_disconnect_vpn(state: Arc<RwLock<DaemonState>>) -> Result<()> {
    let mut state_guard = state.write().await;

    // Check if VPN is actually connected
    if state_guard.connection.state != vpnvpn_shared::protocol::ConnectionState::Connected {
        debug!("VPN not connected, skipping auto-disconnect");
        return Ok(());
    }

    info!("Auto-disconnecting VPN due to lost internet connection");

    // Disable kill-switch first if active
    if state_guard.kill_switch_active {
        if let Err(e) = disable_kill_switch().await {
            warn!(
                "Failed to disable kill-switch during auto-disconnect: {}",
                e
            );
        }
        state_guard.kill_switch_active = false;
    }

    // Disconnect based on current protocol
    let protocol = state_guard.connection.protocol;
    let binary_paths = state_guard.settings.binary_paths.clone();
    drop(state_guard); // Release lock before async disconnect

    let result = if let Some(protocol) = protocol {
        match protocol {
            vpnvpn_shared::Protocol::WireGuard => crate::vpn::wireguard::disconnect(&binary_paths).await,
            vpnvpn_shared::Protocol::OpenVPN => crate::vpn::openvpn::disconnect().await,
            vpnvpn_shared::Protocol::IKEv2 => crate::vpn::ikev2::disconnect().await,
        }
    } else {
        Ok(())
    };

    // Update state after disconnect
    let mut state_guard = state.write().await;
    match result {
        Ok(()) => {
            state_guard.connection = vpnvpn_shared::ConnectionStatus::default();
            info!("VPN auto-disconnected successfully");
            Ok(())
        }
        Err(e) => {
            error!("Auto-disconnect failed: {}", e);
            // Still update state to disconnected to prevent retry loops
            state_guard.connection = vpnvpn_shared::ConnectionStatus::default();
            Err(e)
        }
    }
}
