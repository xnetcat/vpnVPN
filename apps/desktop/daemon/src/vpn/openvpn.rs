//! OpenVPN backend.

use anyhow::Result;
use tracing::{debug, error, info};
use vpnvpn_shared::protocol::{ConnectionState, ConnectionStatus, Protocol, VpnConfig};

/// Connect using OpenVPN.
pub async fn connect(config: &VpnConfig) -> Result<ConnectionStatus> {
    info!("Connecting via OpenVPN to {}", config.server_endpoint);

    // Get OpenVPN config or generate one
    let ovpn_config = config
        .ovpn_config
        .clone()
        .unwrap_or_else(|| build_config(config));

    // Write config to persistent location
    let config_path = get_config_path()?;
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&config_path, &ovpn_config)?;

    debug!("OpenVPN config written to {:?}", config_path);

    // Start OpenVPN process
    #[cfg(unix)]
    start_openvpn_unix(&config_path).await?;

    #[cfg(windows)]
    start_openvpn_windows(&config_path).await?;

    // Wait for connection
    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

    // Check status
    let status = check_status().await?;

    if status.state == ConnectionState::Connected {
        info!("OpenVPN connection established");
    } else {
        error!("OpenVPN connection may not be fully established");
    }

    Ok(status)
}

/// Disconnect OpenVPN.
pub async fn disconnect() -> Result<()> {
    info!("Disconnecting OpenVPN");

    #[cfg(unix)]
    {
        // Kill openvpn process
        let _ = tokio::process::Command::new("pkill")
            .args(["-SIGTERM", "openvpn"])
            .output()
            .await;
    }

    #[cfg(windows)]
    {
        let _ = tokio::process::Command::new("taskkill")
            .args(["/IM", "openvpn.exe", "/F"])
            .output()
            .await;
    }

    Ok(())
}

/// Check OpenVPN connection status.
pub async fn check_status() -> Result<ConnectionStatus> {
    // Check if openvpn process is running
    #[cfg(unix)]
    let is_running = {
        let output = tokio::process::Command::new("pgrep")
            .arg("openvpn")
            .output()
            .await;
        matches!(output, Ok(o) if o.status.success())
    };

    #[cfg(windows)]
    let is_running = {
        let output = tokio::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq openvpn.exe"])
            .output()
            .await;
        matches!(output, Ok(o) if String::from_utf8_lossy(&o.stdout).contains("openvpn.exe"))
    };

    Ok(ConnectionStatus {
        state: if is_running {
            ConnectionState::Connected
        } else {
            ConnectionState::Disconnected
        },
        protocol: Some(Protocol::OpenVPN),
        interface_name: Some("tun0".to_string()),
        ..Default::default()
    })
}

fn build_config(config: &VpnConfig) -> String {
    let dns = if config.dns_servers.is_empty() {
        "1.1.1.1".to_string()
    } else {
        config.dns_servers.first().cloned().unwrap_or_default()
    };

    format!(
        r#"client
dev tun
proto udp
remote {} {}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
verb 3

# DNS
dhcp-option DNS {}

# Keep alive
keepalive 10 60

# Compression (disabled for security)
compress

# Server: {}
"#,
        config.server_endpoint, config.server_port, dns, config.server_region
    )
}

fn get_config_path() -> Result<std::path::PathBuf> {
    let profiles_dir = vpnvpn_shared::config::profiles_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not determine config directory"))?;

    Ok(profiles_dir.join("openvpn").join("vpnvpn-ovpn.conf"))
}

#[cfg(unix)]
async fn start_openvpn_unix(config_path: &std::path::Path) -> Result<()> {
    // Start openvpn as daemon
    let output = tokio::process::Command::new("openvpn")
        .args([
            "--config",
            config_path.to_str().unwrap(),
            "--daemon",
            "--log",
            "/var/log/vpnvpn-openvpn.log",
        ])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("openvpn start failed: {}", stderr));
    }

    Ok(())
}

#[cfg(windows)]
async fn start_openvpn_windows(config_path: &std::path::Path) -> Result<()> {
    // Start openvpn process (may need to be run as service)
    tokio::process::Command::new("openvpn.exe")
        .args(["--config", config_path.to_str().unwrap()])
        .spawn()?;

    Ok(())
}

