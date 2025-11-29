//! IKEv2/IPsec VPN backend.

use anyhow::Result;
use tracing::{debug, info, warn};
use vpnvpn_shared::config::VpnBinaryPaths;
use vpnvpn_shared::protocol::{ConnectionState, ConnectionStatus, Protocol, VpnConfig};

/// Get IKEv2 tool path based on platform.
fn get_ikev2_tool_path() -> Result<String> {
    let default_paths = VpnBinaryPaths::default();

    if let Some(path) = crate::tools::get_ikev2_path(&default_paths) {
        return Ok(path.to_string_lossy().to_string());
    }

    #[cfg(target_os = "macos")]
    {
        // networksetup is built-in on macOS
        if std::path::Path::new("/usr/sbin/networksetup").exists() {
            return Ok("/usr/sbin/networksetup".to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Try ipsec (strongSwan)
        for path in &["/usr/sbin/ipsec", "/usr/local/sbin/ipsec"] {
            if std::path::Path::new(path).exists() {
                return Ok(path.to_string());
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // rasdial is built-in on Windows
        return Ok("rasdial".to_string());
    }

    Err(anyhow::anyhow!(
        "IKEv2 tool not found. Install strongSwan (Linux) or use the built-in IKEv2 support."
    ))
}

/// Connect using IKEv2/IPsec.
pub async fn connect(config: &VpnConfig) -> Result<ConnectionStatus> {
    info!("Connecting via IKEv2 to {}", config.server_endpoint);

    // IKEv2 implementation varies significantly by platform
    #[cfg(target_os = "macos")]
    connect_macos(config).await?;

    #[cfg(target_os = "linux")]
    connect_linux(config).await?;

    #[cfg(target_os = "windows")]
    connect_windows(config).await?;

    // Wait for connection
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

    check_status().await
}

/// Disconnect IKEv2/IPsec.
pub async fn disconnect() -> Result<()> {
    info!("Disconnecting IKEv2");

    #[cfg(target_os = "macos")]
    disconnect_macos().await?;

    #[cfg(target_os = "linux")]
    disconnect_linux().await?;

    #[cfg(target_os = "windows")]
    disconnect_windows().await?;

    Ok(())
}

/// Check IKEv2 connection status.
pub async fn check_status() -> Result<ConnectionStatus> {
    #[cfg(target_os = "macos")]
    return check_status_macos().await;

    #[cfg(target_os = "linux")]
    return check_status_linux().await;

    #[cfg(target_os = "windows")]
    return check_status_windows().await;

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    Ok(ConnectionStatus {
        state: ConnectionState::Disconnected,
        protocol: Some(Protocol::IKEv2),
        ..Default::default()
    })
}

// ============ macOS Implementation ============

#[cfg(target_os = "macos")]
async fn connect_macos(config: &VpnConfig) -> Result<()> {
    // On macOS, we use networksetup to configure and connect IKEv2 VPN
    // First, create or update the VPN service

    let vpn_name = "vpnVPN-IKEv2";

    // Check if service exists
    let list_output = tokio::process::Command::new("networksetup")
        .args(["-listallnetworkservices"])
        .output()
        .await?;

    let services = String::from_utf8_lossy(&list_output.stdout);
    let service_exists = services.lines().any(|l| l.contains(vpn_name));

    if !service_exists {
        // Create the VPN service
        // Note: macOS doesn't have a straightforward CLI to create IKEv2 VPNs
        // Users typically need to import a profile or create via System Preferences
        warn!("IKEv2 VPN service does not exist. User needs to create it manually.");

        // Generate and save config for manual import
        let config_content = build_macos_mobileconfig(config);
        let config_path = get_config_path()?;
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&config_path, config_content)?;

        info!("IKEv2 config saved to {:?} for manual import", config_path);
    }

    // Try to connect
    let output = tokio::process::Command::new("networksetup")
        .args(["-connectpppoeservice", vpn_name])
        .output()
        .await?;

    if !output.status.success() {
        debug!("networksetup connect output: {:?}", output);
    }

    Ok(())
}

#[cfg(target_os = "macos")]
async fn disconnect_macos() -> Result<()> {
    let vpn_name = "vpnVPN-IKEv2";

    let _ = tokio::process::Command::new("networksetup")
        .args(["-disconnectpppoeservice", vpn_name])
        .output()
        .await;

    Ok(())
}

#[cfg(target_os = "macos")]
async fn check_status_macos() -> Result<ConnectionStatus> {
    let vpn_name = "vpnVPN-IKEv2";

    let output = tokio::process::Command::new("scutil")
        .args(["--nc", "status", vpn_name])
        .output()
        .await;

    let state = match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            if stdout.contains("Connected") {
                ConnectionState::Connected
            } else if stdout.contains("Connecting") {
                ConnectionState::Connecting
            } else {
                ConnectionState::Disconnected
            }
        }
        Err(_) => ConnectionState::Disconnected,
    };

    Ok(ConnectionStatus {
        state,
        protocol: Some(Protocol::IKEv2),
        ..Default::default()
    })
}

#[cfg(target_os = "macos")]
fn build_macos_mobileconfig(config: &VpnConfig) -> String {
    let identity = config
        .ikev2_identity
        .as_deref()
        .unwrap_or("vpnvpn-client");
    let remote_id = config.ikev2_remote_id.as_deref().unwrap_or(&config.server_endpoint);

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>IKEv2</key>
            <dict>
                <key>AuthenticationMethod</key>
                <string>SharedSecret</string>
                <key>LocalIdentifier</key>
                <string>{}</string>
                <key>RemoteAddress</key>
                <string>{}</string>
                <key>RemoteIdentifier</key>
                <string>{}</string>
                <key>UseConfigurationAttributeInternalIPSubnet</key>
                <integer>0</integer>
            </dict>
            <key>PayloadDisplayName</key>
            <string>vpnVPN IKEv2</string>
            <key>PayloadIdentifier</key>
            <string>com.vpnvpn.ikev2.vpn</string>
            <key>PayloadType</key>
            <string>com.apple.vpn.managed</string>
            <key>PayloadUUID</key>
            <string>A1B2C3D4-E5F6-7890-ABCD-EF1234567890</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>VPNType</key>
            <string>IKEv2</string>
        </dict>
    </array>
    <key>PayloadDisplayName</key>
    <string>vpnVPN IKEv2 Configuration</string>
    <key>PayloadIdentifier</key>
    <string>com.vpnvpn.ikev2</string>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>B2C3D4E5-F6A7-8901-BCDE-F12345678901</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>
"#,
        identity, config.server_endpoint, remote_id
    )
}

// ============ Linux Implementation ============

#[cfg(target_os = "linux")]
async fn connect_linux(config: &VpnConfig) -> Result<()> {
    // Use strongSwan (ipsec) on Linux
    let config_content = build_strongswan_config(config);

    // Write ipsec.conf
    let config_path = get_config_path()?;
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&config_path, &config_content)?;

    // Reload and connect
    let _ = tokio::process::Command::new("ipsec")
        .args(["reload"])
        .output()
        .await;

    let output = tokio::process::Command::new("ipsec")
        .args(["up", "vpnvpn"])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!("ipsec up warning: {}", stderr);
    }

    Ok(())
}

#[cfg(target_os = "linux")]
async fn disconnect_linux() -> Result<()> {
    let _ = tokio::process::Command::new("ipsec")
        .args(["down", "vpnvpn"])
        .output()
        .await;

    Ok(())
}

#[cfg(target_os = "linux")]
async fn check_status_linux() -> Result<ConnectionStatus> {
    let output = tokio::process::Command::new("ipsec")
        .args(["status", "vpnvpn"])
        .output()
        .await;

    let state = match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            if stdout.contains("ESTABLISHED") {
                ConnectionState::Connected
            } else if stdout.contains("CONNECTING") {
                ConnectionState::Connecting
            } else {
                ConnectionState::Disconnected
            }
        }
        Err(_) => ConnectionState::Disconnected,
    };

    Ok(ConnectionStatus {
        state,
        protocol: Some(Protocol::IKEv2),
        ..Default::default()
    })
}

#[cfg(target_os = "linux")]
fn build_strongswan_config(config: &VpnConfig) -> String {
    let identity = config.ikev2_identity.as_deref().unwrap_or("vpnvpn");

    format!(
        r#"# vpnVPN IKEv2 configuration
conn vpnvpn
    keyexchange=ikev2
    type=tunnel
    left=%any
    leftid={}
    leftauth=psk
    right={}
    rightid=%any
    rightauth=psk
    rightsubnet=0.0.0.0/0
    ike=aes256-sha256-modp2048!
    esp=aes256-sha256!
    auto=add
"#,
        identity, config.server_endpoint
    )
}

// ============ Windows Implementation ============

#[cfg(target_os = "windows")]
async fn connect_windows(config: &VpnConfig) -> Result<()> {
    let vpn_name = "vpnVPN-IKEv2";

    // Check if VPN connection exists
    let check = tokio::process::Command::new("rasdial")
        .output()
        .await?;

    let connections = String::from_utf8_lossy(&check.stdout);

    if !connections.contains(vpn_name) {
        // Create VPN connection using PowerShell
        let ps_script = format!(
            r#"
            Add-VpnConnection -Name "{}" -ServerAddress "{}" -TunnelType IKEv2 -AuthenticationMethod EAP -EncryptionLevel Required -Force
            "#,
            vpn_name, config.server_endpoint
        );

        let _ = tokio::process::Command::new("powershell")
            .args(["-Command", &ps_script])
            .output()
            .await;
    }

    // Connect
    let output = tokio::process::Command::new("rasdial")
        .args([vpn_name])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!("rasdial warning: {}", stderr);
    }

    Ok(())
}

#[cfg(target_os = "windows")]
async fn disconnect_windows() -> Result<()> {
    let vpn_name = "vpnVPN-IKEv2";

    let _ = tokio::process::Command::new("rasdial")
        .args([vpn_name, "/disconnect"])
        .output()
        .await;

    Ok(())
}

#[cfg(target_os = "windows")]
async fn check_status_windows() -> Result<ConnectionStatus> {
    let output = tokio::process::Command::new("rasdial")
        .output()
        .await;

    let state = match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            if stdout.contains("vpnVPN-IKEv2") {
                ConnectionState::Connected
            } else {
                ConnectionState::Disconnected
            }
        }
        Err(_) => ConnectionState::Disconnected,
    };

    Ok(ConnectionStatus {
        state,
        protocol: Some(Protocol::IKEv2),
        ..Default::default()
    })
}

fn get_config_path() -> Result<std::path::PathBuf> {
    let profiles_dir = vpnvpn_shared::config::profiles_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not determine config directory"))?;

    #[cfg(target_os = "macos")]
    return Ok(profiles_dir.join("ikev2").join("vpnvpn-ikev2.mobileconfig"));

    #[cfg(target_os = "linux")]
    return Ok(profiles_dir.join("ikev2").join("vpnvpn-ipsec.conf"));

    #[cfg(target_os = "windows")]
    return Ok(profiles_dir.join("ikev2").join("vpnvpn-ikev2.pbk"));

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    Ok(profiles_dir.join("ikev2").join("vpnvpn-ikev2.conf"))
}

