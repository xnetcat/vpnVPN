//! Daemon state management.

use anyhow::Result;
use std::time::Instant;
use vpnvpn_shared::{
    config::{DaemonSettings, DaemonStatus, PlatformInfo, VpnToolsStatus},
    protocol::{ConnectionState, ConnectionStatus},
};

/// Daemon state.
pub struct DaemonState {
    /// When the daemon started.
    pub started_at: Instant,

    /// Current daemon settings.
    pub settings: DaemonSettings,

    /// Current connection status.
    pub connection: ConnectionStatus,

    /// Whether kill-switch is active.
    pub kill_switch_active: bool,

    /// Authenticated client sessions.
    pub sessions: Vec<ClientSession>,

    /// Cached VPN tools status.
    pub vpn_tools: VpnToolsStatus,
}

/// An authenticated client session.
pub struct ClientSession {
    pub token: String,
    pub created_at: Instant,
    pub client_pid: u32,
}

impl DaemonState {
    pub fn new(settings: DaemonSettings) -> Self {
        // Detect VPN tools on startup
        let vpn_tools = crate::tools::detect_vpn_tools(&settings.binary_paths);

        Self {
            started_at: Instant::now(),
            settings,
            connection: ConnectionStatus::default(),
            kill_switch_active: false,
            sessions: Vec::new(),
            vpn_tools,
        }
    }

    /// Get daemon status.
    pub fn status(&self) -> DaemonStatus {
        DaemonStatus {
            running: true,
            version: crate::VERSION.to_string(),
            uptime_secs: self.started_at.elapsed().as_secs(),
            has_network_permission: true, // TODO: Check actual permissions
            has_firewall_permission: true, // TODO: Check actual permissions
            connection: self.connection.clone(),
            kill_switch_active: self.kill_switch_active,
            platform_info: self.platform_info(),
            vpn_tools: self.vpn_tools.clone(),
        }
    }

    /// Refresh VPN tools detection.
    pub fn refresh_vpn_tools(&mut self) {
        self.vpn_tools = crate::tools::refresh_vpn_tools(&self.settings.binary_paths);
    }

    /// Update binary paths and refresh detection.
    pub fn update_binary_paths(&mut self, paths: vpnvpn_shared::config::VpnBinaryPaths) {
        self.settings.binary_paths = paths;
        self.refresh_vpn_tools();
    }

    /// Get platform-specific info.
    fn platform_info(&self) -> PlatformInfo {
        PlatformInfo {
            os: std::env::consts::OS.to_string(),
            os_version: os_version(),
            service_type: service_type(),
            daemon_path: daemon_path(),
            service_config_path: service_config_path(),
        }
    }

    /// Cleanup on shutdown.
    pub async fn cleanup(&mut self) -> Result<()> {
        // Disconnect VPN if connected
        if self.connection.state == ConnectionState::Connected {
            tracing::info!("Disconnecting VPN before shutdown...");
            // VPN disconnect will be handled by vpn module
        }

        // Disable kill-switch if active
        if self.kill_switch_active {
            tracing::info!("Disabling kill-switch before shutdown...");
            #[cfg(target_os = "macos")]
            crate::firewall::macos::disable_kill_switch()?;

            #[cfg(target_os = "windows")]
            crate::firewall::windows::disable_kill_switch()?;

            #[cfg(target_os = "linux")]
            crate::firewall::linux::disable_kill_switch()?;

            self.kill_switch_active = false;
        }

        Ok(())
    }

    /// Add a new authenticated session.
    pub fn add_session(&mut self, token: String, client_pid: u32) {
        // Remove old sessions for same PID
        self.sessions.retain(|s| s.client_pid != client_pid);

        self.sessions.push(ClientSession {
            token,
            created_at: Instant::now(),
            client_pid,
        });
    }

    /// Validate a session token.
    pub fn validate_session(&self, token: &str) -> bool {
        self.sessions.iter().any(|s| s.token == token)
    }
}

fn os_version() -> String {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    }

    #[cfg(target_os = "linux")]
    {
        std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|s| {
                s.lines()
                    .find(|l| l.starts_with("VERSION_ID="))
                    .map(|l| l.trim_start_matches("VERSION_ID=").trim_matches('"').to_string())
            })
            .unwrap_or_else(|| "unknown".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        "windows".to_string() // TODO: Get actual version
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        "unknown".to_string()
    }
}

fn service_type() -> String {
    #[cfg(target_os = "macos")]
    {
        "launchd".to_string()
    }

    #[cfg(target_os = "linux")]
    {
        "systemd".to_string()
    }

    #[cfg(target_os = "windows")]
    {
        "windows_service".to_string()
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        "unknown".to_string()
    }
}

fn daemon_path() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        Some("/Library/PrivilegedHelperTools/com.vpnvpn.daemon".to_string())
    }

    #[cfg(target_os = "linux")]
    {
        Some("/usr/local/bin/vpnvpn-daemon".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        Some(r"C:\Program Files\vpnVPN\vpnvpn-daemon.exe".to_string())
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

fn service_config_path() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        Some("/Library/LaunchDaemons/com.vpnvpn.daemon.plist".to_string())
    }

    #[cfg(target_os = "linux")]
    {
        Some("/etc/systemd/system/vpnvpn-daemon.service".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        None // Windows services don't have a config file path
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

