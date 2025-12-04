//! WireGuard VPN backend.

use anyhow::Result;
use tracing::{debug, error, info, warn};
use vpnvpn_shared::config::VpnBinaryPaths;
use vpnvpn_shared::protocol::{ConnectionState, ConnectionStatus, Protocol, VpnConfig};

const INTERFACE_NAME: &str = "vpnvpn-wg0";

/// Get wg-quick path using the tools detection module.
fn get_wg_quick_path() -> Result<String> {
    // Use default paths - in production, the daemon state holds the actual paths
    let default_paths = VpnBinaryPaths::default();

    if let Some(path) = crate::tools::get_wireguard_path(&default_paths) {
        info!("Using wg-quick at: {:?}", path);
        return Ok(path.to_string_lossy().to_string());
    }

    // Fallback: try common paths
    let paths = [
        "/opt/homebrew/bin/wg-quick", // macOS ARM Homebrew
        "/usr/local/bin/wg-quick",    // macOS Intel Homebrew / Linux
        "/usr/bin/wg-quick",          // Linux system
        "/bin/wg-quick",              // Linux system
    ];

    for path in &paths {
        if std::path::Path::new(path).exists() {
            info!("Found wg-quick at: {}", path);
            return Ok(path.to_string());
        }
    }

    warn!("wg-quick not found. Install WireGuard or set a custom path.");
    Err(anyhow::anyhow!(
        "wg-quick not found. Install WireGuard:\n  - macOS: brew install wireguard-tools\n  - Linux: sudo apt install wireguard-tools"
    ))
}

/// Find wg binary in common locations.
fn find_wg() -> Result<String> {
    let paths = [
        "/opt/homebrew/bin/wg", // macOS ARM Homebrew
        "/usr/local/bin/wg",    // macOS Intel Homebrew / Linux
        "/usr/bin/wg",          // Linux system
        "/bin/wg",              // Linux system
    ];

    for path in &paths {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    // Fall back to PATH lookup
    Ok("wg".to_string())
}

/// Connect to WireGuard VPN.
pub async fn connect(config: &VpnConfig) -> Result<ConnectionStatus> {
    info!("Connecting via WireGuard to {}", config.server_endpoint);

    // Build WireGuard config file
    let wg_config = build_config(config)?;

    // Write config to persistent location
    let config_path = get_config_path()?;
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&config_path, &wg_config)?;

    // Set restrictive file permissions (read/write for owner only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&config_path)?.permissions();
        perms.set_mode(0o600); // rw------- (owner read/write only)
        std::fs::set_permissions(&config_path, perms)?;
    }

    debug!("WireGuard config written to {:?}", config_path);

    // Apply configuration using platform-specific method
    #[cfg(target_os = "macos")]
    apply_macos(&config_path).await?;

    #[cfg(target_os = "linux")]
    apply_linux(&config_path).await?;

    #[cfg(target_os = "windows")]
    apply_windows(&config_path).await?;

    // Wait for interface to come up and initial handshake
    // Note: Peer may not be synced to VPN node yet (syncs every 10 seconds)
    // So we check status but don't fail immediately if not connected
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // Verify connection - retry a few times as peer sync may be delayed
    let mut status = check_status().await?;
    let mut retries = 0;
    const MAX_RETRIES: u32 = 3;

    while status.state != ConnectionState::Connected && retries < MAX_RETRIES {
        retries += 1;
        info!(
            "WireGuard not connected yet (attempt {}/{}), waiting for peer sync...",
            retries, MAX_RETRIES
        );
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        status = check_status().await?;
    }

    if status.state == ConnectionState::Connected {
        info!("WireGuard connection established");
    } else {
        warn!(
            "WireGuard connection not established after {} attempts. ",
            MAX_RETRIES + 1
        );
        warn!(
            "This may be normal if the peer hasn't synced to the VPN node yet (syncs every 10 seconds). ",
        );
        warn!("Connection may establish automatically once peer is synced.");
    }

    Ok(status)
}

/// Disconnect from WireGuard VPN.
pub async fn disconnect() -> Result<()> {
    info!("Disconnecting WireGuard");

    #[cfg(target_os = "macos")]
    disconnect_macos().await?;

    #[cfg(target_os = "linux")]
    disconnect_linux().await?;

    #[cfg(target_os = "windows")]
    disconnect_windows().await?;

    Ok(())
}

/// Check WireGuard connection status.
pub async fn check_status() -> Result<ConnectionStatus> {
    let wg = find_wg()?;

    // wg-quick creates interface based on config filename (without .conf)
    // Config is at: .../wireguard/vpnvpn-wg.conf, so interface is "vpnvpn-wg"
    // But we check for "vpnvpn-wg0" as fallback, or try to find any vpnvpn interface
    let config_path = get_config_path()?;
    let interface_name = config_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(INTERFACE_NAME);

    // Check if interface exists and has a handshake
    let output = tokio::process::Command::new(&wg)
        .args(["show", interface_name])
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);

            // Parse latest handshake and transfer stats
            let mut bytes_received = None;
            let mut bytes_sent = None;
            let mut has_handshake = false;

            for line in stdout.lines() {
                if line.contains("latest handshake:") {
                    has_handshake = true;
                }
                if line.contains("transfer:") {
                    // Parse "transfer: X received, Y sent"
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 4 {
                        bytes_received = parse_bytes(parts.get(1).unwrap_or(&"0"));
                        bytes_sent = parse_bytes(parts.get(3).unwrap_or(&"0"));
                    }
                }
            }

            Ok(ConnectionStatus {
                state: if has_handshake {
                    ConnectionState::Connected
                } else {
                    ConnectionState::Connecting
                },
                protocol: Some(Protocol::WireGuard),
                interface_name: Some(interface_name.to_string()),
                bytes_sent,
                bytes_received,
                ..Default::default()
            })
        }
        _ => Ok(ConnectionStatus {
            state: ConnectionState::Disconnected,
            protocol: Some(Protocol::WireGuard),
            ..Default::default()
        }),
    }
}

/// Normalize a WireGuard key to ensure it has proper base64 padding.
/// WireGuard keys must be exactly 32 bytes when decoded, which means
/// they should be 44 characters in base64 (with padding).
fn normalize_wg_key(key: &str) -> String {
    let trimmed = key.trim();
    // Base64 encode 32 bytes = 44 chars with padding
    // If key is 43 chars, it's missing padding
    if trimmed.len() == 43 {
        format!("{}=", trimmed)
    } else if trimmed.len() == 42 {
        format!("{}==", trimmed)
    } else {
        trimmed.to_string()
    }
}

fn build_config(config: &VpnConfig) -> Result<String> {
    // Normalize keys to ensure proper base64 padding for WireGuard
    let private_key = config
        .wg_private_key
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("WireGuard private key not provided"))?;
    let private_key = normalize_wg_key(private_key);

    let server_public_key = config
        .wg_server_public_key
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("WireGuard server public key not provided"))?;
    let server_public_key = normalize_wg_key(server_public_key);

    let assigned_ip = config
        .assigned_ip
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Assigned IP not provided"))?;

    // Ensure assigned_ip has /32 suffix if not already present
    // Server returns IP with /32, but handle both cases
    let assigned_ip = if assigned_ip.contains('/') {
        assigned_ip.clone()
    } else {
        format!("{}/32", assigned_ip)
    };

    let dns = if config.dns_servers.is_empty() {
        "1.1.1.1, 1.0.0.1".to_string()
    } else {
        config.dns_servers.join(", ")
    };

    let endpoint = format!("{}:{}", config.server_endpoint, config.server_port);

    let mut wg_config = format!(
        r#"[Interface]
PrivateKey = {}
Address = {}
DNS = {}

[Peer]
PublicKey = {}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = {}
PersistentKeepalive = 25
"#,
        private_key, assigned_ip, dns, server_public_key, endpoint
    );

    // Add preshared key if provided
    if let Some(psk) = &config.wg_preshared_key {
        wg_config.push_str(&format!("PresharedKey = {}\n", psk.trim()));
    }

    Ok(wg_config)
}

fn get_config_path() -> Result<std::path::PathBuf> {
    let profiles_dir = vpnvpn_shared::config::profiles_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not determine config directory"))?;

    Ok(profiles_dir.join("wireguard").join("vpnvpn-wg.conf"))
}

#[cfg(target_os = "macos")]
async fn apply_macos(config_path: &std::path::Path) -> Result<()> {
    // Check if running as root
    if !nix::unistd::geteuid().is_root() {
        return Err(anyhow::anyhow!(
            "VPN operations require root privileges. Run the daemon with: sudo bun run dev:daemon:watch"
        ));
    }

    let wg_quick = get_wg_quick_path()?;
    info!("Using wg-quick at: {}", wg_quick);

    // Use wg-quick to bring up the interface
    let output = tokio::process::Command::new(&wg_quick)
        .args(["up", config_path.to_str().unwrap()])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        error!("wg-quick up failed. stderr: {}, stdout: {}", stderr, stdout);

        // Provide helpful error messages
        if stderr.contains("sudo") || stderr.contains("password") {
            return Err(anyhow::anyhow!(
                "VPN requires root privileges. Run daemon with: sudo bun run dev:daemon:watch"
            ));
        }

        return Err(anyhow::anyhow!("wg-quick up failed: {}", stderr));
    }

    info!("wg-quick up succeeded");
    Ok(())
}

#[cfg(target_os = "macos")]
async fn disconnect_macos() -> Result<()> {
    let wg_quick = get_wg_quick_path()?;
    let config_path = get_config_path()?;

    info!(
        "Disconnecting WireGuard with: {} down {:?}",
        wg_quick, config_path
    );

    let _ = tokio::process::Command::new(&wg_quick)
        .args(["down", config_path.to_str().unwrap()])
        .output()
        .await;

    Ok(())
}

#[cfg(target_os = "linux")]
async fn apply_linux(config_path: &std::path::Path) -> Result<()> {
    // Check if running as root
    if !nix::unistd::geteuid().is_root() {
        return Err(anyhow::anyhow!(
            "VPN operations require root privileges. Run the daemon with: sudo bun run dev:daemon:watch"
        ));
    }

    let wg_quick = find_wg_quick()?;
    info!("Using wg-quick at: {}", wg_quick);

    let output = tokio::process::Command::new(&wg_quick)
        .args(["up", config_path.to_str().unwrap()])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        error!("wg-quick up failed. stderr: {}, stdout: {}", stderr, stdout);

        // Provide helpful error messages
        if stderr.contains("sudo") || stderr.contains("permission") {
            return Err(anyhow::anyhow!(
                "VPN requires root privileges. Run daemon with: sudo bun run dev:daemon:watch"
            ));
        }

        return Err(anyhow::anyhow!("wg-quick up failed: {}", stderr));
    }

    info!("wg-quick up succeeded");
    Ok(())
}

#[cfg(target_os = "linux")]
async fn disconnect_linux() -> Result<()> {
    let wg_quick = find_wg_quick()?;
    let config_path = get_config_path()?;

    info!(
        "Disconnecting WireGuard with: {} down {:?}",
        wg_quick, config_path
    );

    let _ = tokio::process::Command::new(&wg_quick)
        .args(["down", config_path.to_str().unwrap()])
        .output()
        .await;

    Ok(())
}

#[cfg(target_os = "windows")]
async fn apply_windows(config_path: &std::path::Path) -> Result<()> {
    // On Windows, use wireguard.exe to install tunnel service
    let output = tokio::process::Command::new("wireguard.exe")
        .args(["/installtunnelservice", config_path.to_str().unwrap()])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("wireguard install failed: {}", stderr));
    }

    Ok(())
}

#[cfg(target_os = "windows")]
async fn disconnect_windows() -> Result<()> {
    let _ = tokio::process::Command::new("wireguard.exe")
        .args(["/uninstalltunnelservice", INTERFACE_NAME])
        .output()
        .await;

    Ok(())
}

fn parse_bytes(s: &str) -> Option<u64> {
    // Parse human-readable byte strings like "1.2 GiB" or "500 MiB"
    let s = s.trim();

    // Try parsing as plain number first
    if let Ok(n) = s.parse::<u64>() {
        return Some(n);
    }

    // Parse with suffix
    let (num_str, suffix) = s.split_at(s.len().saturating_sub(3));
    let num: f64 = num_str.trim().parse().ok()?;

    let multiplier = match suffix.to_lowercase().as_str() {
        "kib" | "kb" => 1024.0,
        "mib" | "mb" => 1024.0 * 1024.0,
        "gib" | "gb" => 1024.0 * 1024.0 * 1024.0,
        "tib" | "tb" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => 1.0,
    };

    Some((num * multiplier) as u64)
}
