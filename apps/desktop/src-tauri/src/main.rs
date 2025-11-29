#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod daemon_client;
mod tray;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[cfg(any(windows, target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;

#[derive(Serialize)]
struct Health {
    ok: bool,
}

#[tauri::command]
fn health_check() -> Health {
    Health { ok: true }
}

/// Get a unique machine identifier for this device.
/// This is used to identify devices across reconnections to avoid creating
/// duplicate device entries.
#[tauri::command]
fn get_machine_id() -> String {
    // Try to get machine ID from the machine-uid crate
    // Falls back to hostname if that fails
    match machine_uid::get() {
        Ok(id) => id,
        Err(_) => {
            // Fallback: use hostname + username hash
            let hostname = std::env::var("HOSTNAME")
                .or_else(|_| std::env::var("COMPUTERNAME"))
                .unwrap_or_else(|_| "unknown-host".to_string());
            let username = std::env::var("USER")
                .or_else(|_| std::env::var("USERNAME"))
                .unwrap_or_else(|_| "unknown-user".to_string());
            format!("{}@{}", username, hostname)
        }
    }
}

/// Status of VPN tool availability on the system (legacy format for frontend compatibility).
#[derive(Serialize, Clone)]
struct VpnToolsStatus {
    wireguard_available: bool,
    wireguard_path: Option<String>,
    openvpn_available: bool,
    openvpn_path: Option<String>,
    ikev2_available: bool,
    ikev2_path: Option<String>,
}

/// Detect VPN tools - delegates to daemon if available, otherwise uses fallback detection.
#[tauri::command]
fn detect_vpn_tools() -> VpnToolsStatus {
    eprintln!("[tauri] detect_vpn_tools called");
    
    // Try to get tools from daemon first
    if daemon_client::is_daemon_available() {
        eprintln!("[tauri] Daemon available, getting tools from daemon");
        
        match daemon_client::get_vpn_tools() {
            Ok(tools) => {
                eprintln!("[tauri] Got tools from daemon: {:?}", tools);
                return VpnToolsStatus {
                    wireguard_available: tools.wireguard.available,
                    wireguard_path: tools.wireguard.path,
                    openvpn_available: tools.openvpn.available,
                    openvpn_path: tools.openvpn.path,
                    ikev2_available: tools.ikev2.available,
                    ikev2_path: tools.ikev2.path,
                };
            }
            Err(e) => {
                eprintln!("[tauri] Failed to get tools from daemon: {}, using fallback", e);
            }
        }
    } else {
        eprintln!("[tauri] Daemon not available, using fallback detection");
    }
    
    // Fallback: basic detection when daemon is not available
    detect_vpn_tools_fallback()
}

/// Fallback VPN tool detection when daemon is not running.
/// This is a simplified version that doesn't support custom paths.
fn detect_vpn_tools_fallback() -> VpnToolsStatus {
    VpnToolsStatus {
        wireguard_available: find_command_basic("wg-quick").is_some(),
        wireguard_path: find_command_basic("wg-quick"),
        openvpn_available: find_command_basic("openvpn").is_some(),
        openvpn_path: find_command_basic("openvpn"),
        ikev2_available: find_command_basic_ikev2(),
        ikev2_path: get_ikev2_path_basic(),
    }
}

/// Basic command detection for fallback mode.
fn find_command_basic(cmd: &str) -> Option<String> {
    // Check common paths
    let common_paths = [
        format!("/opt/homebrew/bin/{}", cmd),
        format!("/opt/homebrew/sbin/{}", cmd),
        format!("/usr/local/bin/{}", cmd),
        format!("/usr/local/sbin/{}", cmd),
        format!("/usr/bin/{}", cmd),
        format!("/usr/sbin/{}", cmd),
        format!("/bin/{}", cmd),
        format!("/sbin/{}", cmd),
    ];
    
    for path in common_paths {
        if std::path::Path::new(&path).exists() {
            return Some(path);
        }
    }
    
    // Try which command
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(output) = std::process::Command::new("which").arg(cmd).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("where").arg(cmd).output() {
            if output.status.success() {
                if let Some(path) = String::from_utf8_lossy(&output.stdout).lines().next() {
                    let path = path.trim().to_string();
                    if !path.is_empty() {
                        return Some(path);
                    }
                }
            }
        }
    }
    
    None
}

/// Check IKEv2 tool availability (platform-specific).
fn find_command_basic_ikev2() -> bool {
    #[cfg(target_os = "macos")]
    {
        std::path::Path::new("/usr/sbin/networksetup").exists()
    }
    #[cfg(target_os = "linux")]
    {
        find_command_basic("ipsec").is_some() || find_command_basic("nmcli").is_some()
    }
    #[cfg(target_os = "windows")]
    {
        std::path::Path::new(r"C:\Windows\System32\rasdial.exe").exists()
    }
}

/// Get IKEv2 tool path (platform-specific).
fn get_ikev2_path_basic() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        Some("/usr/sbin/networksetup".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        find_command_basic("ipsec").or_else(|| find_command_basic("nmcli"))
    }
    #[cfg(target_os = "windows")]
    {
        Some(r"C:\Windows\System32\rasdial.exe".to_string())
    }
}

/// Refresh VPN tools detection (triggers daemon to re-detect).
#[tauri::command]
fn refresh_vpn_tools() -> Result<VpnToolsStatus, String> {
    eprintln!("[tauri] refresh_vpn_tools called");
    
    if !daemon_client::is_daemon_available() {
        return Err("Daemon not available. Start the daemon to refresh tools.".to_string());
    }
    
    let tools = daemon_client::refresh_vpn_tools()?;
    
    Ok(VpnToolsStatus {
        wireguard_available: tools.wireguard.available,
        wireguard_path: tools.wireguard.path,
        openvpn_available: tools.openvpn.available,
        openvpn_path: tools.openvpn.path,
        ikev2_available: tools.ikev2.available,
        ikev2_path: tools.ikev2.path,
    })
}

/// Update VPN binary paths in daemon settings.
#[tauri::command]
fn update_vpn_binary_paths(
    wg_quick_path: Option<String>,
    wireguard_cli_path: Option<String>,
    openvpn_path: Option<String>,
    ikev2_path: Option<String>,
) -> Result<VpnToolsStatus, String> {
    eprintln!("[tauri] update_vpn_binary_paths called");
    eprintln!("[tauri] wg_quick_path: {:?}", wg_quick_path);
    eprintln!("[tauri] openvpn_path: {:?}", openvpn_path);
    
    if !daemon_client::is_daemon_available() {
        return Err("Daemon not available. Start the daemon to update binary paths.".to_string());
    }
    
    let paths = daemon_client::VpnBinaryPaths {
        wg_quick_path,
        wireguard_cli_path,
        openvpn_path,
        ikev2_path,
    };
    
    let tools = daemon_client::update_binary_paths(paths)?;
    
    Ok(VpnToolsStatus {
        wireguard_available: tools.wireguard.available,
        wireguard_path: tools.wireguard.path,
        openvpn_available: tools.openvpn.available,
        openvpn_path: tools.openvpn.path,
        ikev2_available: tools.ikev2.available,
        ikev2_path: tools.ikev2.path,
    })
}

/// Get detailed VPN tools info from daemon (includes version, custom paths, errors).
#[tauri::command]
fn get_vpn_tools_detailed() -> Result<daemon_client::VpnToolsStatus, String> {
    eprintln!("[tauri] get_vpn_tools_detailed called");
    
    if !daemon_client::is_daemon_available() {
        return Err("Daemon not available".to_string());
    }
    
    daemon_client::get_vpn_tools()
}

#[derive(Serialize, Deserialize, Clone)]
struct DesktopSettings {
    preferred_protocol: String,
    auto_connect: bool,
    wg_quick_path: Option<String>,
    openvpn_path: Option<String>,
    wireguard_cli_path: Option<String>,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            preferred_protocol: "wireguard".into(),
            auto_connect: false,
            wg_quick_path: None,
            openvpn_path: None,
            wireguard_cli_path: None,
        }
    }
}

fn config_path() -> Result<PathBuf, String> {
    use std::fs;

    let base = if cfg!(target_os = "windows") {
        std::env::var("APPDATA")
            .map(PathBuf::from)
            .map_err(|e| format!("APPDATA not set: {e}"))?
    } else if cfg!(target_os = "macos") {
        let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
        PathBuf::from(home).join("Library/Application Support")
    } else {
        let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
        PathBuf::from(home).join(".config")
    };

    let dir = base.join("vpnvpn-desktop");
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create config dir {dir:?}: {e}"))?;
    Ok(dir.join("settings.json"))
}

fn load_settings() -> Result<DesktopSettings, String> {
    use std::fs;

    let path = config_path()?;
    if !path.exists() {
        return Ok(DesktopSettings::default());
    }
    let data = fs::read_to_string(&path).map_err(|e| format!("failed to read settings: {e}"))?;
    let parsed: DesktopSettings =
        serde_json::from_str(&data).map_err(|e| format!("failed to parse settings: {e}"))?;
    Ok(parsed)
}

fn save_settings(settings: &DesktopSettings) -> Result<(), String> {
    use std::fs;

    let path = config_path()?;
    let data = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("failed to serialise settings: {e}"))?;
    fs::write(&path, data).map_err(|e| format!("failed to write settings: {e}"))?;
    Ok(())
}

#[tauri::command]
fn get_desktop_settings() -> Result<DesktopSettings, String> {
    load_settings()
}

#[derive(Deserialize)]
struct DesktopSettingsUpdate {
    preferred_protocol: Option<String>,
    auto_connect: Option<bool>,
    wg_quick_path: Option<String>,
    openvpn_path: Option<String>,
    wireguard_cli_path: Option<String>,
}

/// Convert empty string to None for path settings
fn normalize_path(path: Option<String>) -> Option<String> {
    path.filter(|p| !p.trim().is_empty())
}

#[tauri::command]
fn update_desktop_settings(update: DesktopSettingsUpdate) -> Result<DesktopSettings, String> {
    let mut current = load_settings()?;

    if let Some(p) = update.preferred_protocol {
        current.preferred_protocol = p;
    }
    if let Some(ac) = update.auto_connect {
        current.auto_connect = ac;
    }
    if update.wg_quick_path.is_some() {
        current.wg_quick_path = normalize_path(update.wg_quick_path);
    }
    if update.openvpn_path.is_some() {
        current.openvpn_path = normalize_path(update.openvpn_path);
    }
    if update.wireguard_cli_path.is_some() {
        current.wireguard_cli_path = normalize_path(update.wireguard_cli_path);
    }

    save_settings(&current)?;
    Ok(current)
}

// Legacy VPN functions - kept for reference but no longer used.
// All VPN operations now go through the daemon for security and kill-switch support.

#[allow(dead_code)]
fn write_temp(filename: &str, contents: &str) -> Result<PathBuf, String> {
    use std::fs;

    let mut path: PathBuf = std::env::temp_dir();
    path.push(filename);

    fs::write(&path, contents).map_err(|e| format!("failed to write config: {e}"))?;
    Ok(path)
}

#[allow(dead_code)]
fn apply_wireguard(config: &str) -> Result<(), String> {
    let settings = load_settings().unwrap_or_default();
    let bin = settings.wg_quick_path.unwrap_or_else(|| "wg-quick".into());

    let path = write_temp("vpnvpn-wg.conf", config)?;

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        run_command(&bin, &["up", path.to_string_lossy().as_ref()])?;
    }

    #[cfg(target_os = "windows")]
    {
        let wireguard_cli = settings
            .wireguard_cli_path
            .unwrap_or_else(|| "wireguard.exe".into());
        run_command(
            &wireguard_cli,
            &["/installtunnelservice", path.to_string_lossy().as_ref()],
        )?;
    }

    Ok(())
}

#[allow(dead_code)]
fn disconnect_wireguard_internal() -> Result<(), String> {
    let settings = load_settings().unwrap_or_default();
    let bin = settings.wg_quick_path.unwrap_or_else(|| "wg-quick".into());

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        let mut path: PathBuf = std::env::temp_dir();
        path.push("vpnvpn-wg.conf");
        let _ = run_command(&bin, &["down", path.to_string_lossy().as_ref()]);
    }

    #[cfg(target_os = "windows")]
    {
        let wireguard_cli = settings
            .wireguard_cli_path
            .unwrap_or_else(|| "wireguard.exe".into());
        let _ = run_command(
            &wireguard_cli,
            &["/uninstalltunnelservice", "vpnvpn-desktop"],
        );
    }

    Ok(())
}

#[allow(dead_code)]
fn apply_openvpn(config: &str) -> Result<(), String> {
    let settings = load_settings().unwrap_or_default();
    let openvpn_bin = if cfg!(target_os = "windows") {
        settings
            .openvpn_path
            .unwrap_or_else(|| "openvpn.exe".into())
    } else {
        settings.openvpn_path.unwrap_or_else(|| "openvpn".into())
    };

    let path = write_temp("vpnvpn-ovpn.conf", config)?;

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        run_command(
            &openvpn_bin,
            &["--config", path.to_string_lossy().as_ref(), "--daemon"],
        )?;
    }

    #[cfg(target_os = "windows")]
    {
        run_command(&openvpn_bin, &["--config", path.to_string_lossy().as_ref()])?;
    }

    Ok(())
}

#[allow(dead_code)]
fn disconnect_openvpn() -> Result<(), String> {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        let _ = run_command("pkill", &["openvpn"]);
    }

    #[cfg(target_os = "windows")]
    {
        let _ = run_command("taskkill", &["/IM", "openvpn.exe", "/F"]);
    }

    Ok(())
}

#[allow(dead_code)]
fn apply_ikev2(config: &str) -> Result<(), String> {
    let path = write_temp("vpnvpn-ikev2.conf", config)?;

    #[cfg(target_os = "macos")]
    {
        // Open the config in the default handler so macOS can offer to import it
        // into the system VPN settings (Network preferences / System Settings).
        let _ = run_command("open", &[path.to_string_lossy().as_ref()]);
    }

    #[cfg(target_os = "linux")]
    {
        // Let the desktop environment decide how to handle the config (often a
        // network manager / connection editor).
        let _ = run_command("xdg-open", &[path.to_string_lossy().as_ref()]);
    }

    #[cfg(target_os = "windows")]
    {
        // There is no single standard CLI for importing IKEv2 profiles; opening
        // the file helps the user inspect/import it manually.
        let _ = run_command("notepad.exe", &[path.to_string_lossy().as_ref()]);
    }

    Ok(())
}

#[allow(dead_code)]
fn disconnect_ikev2() -> Result<(), String> {
    Ok(())
}

/// Apply VPN configuration - requires daemon to be running.
/// The daemon handles all VPN operations for security and kill-switch support.
#[tauri::command]
fn apply_vpn_config(protocol: String, config: String) -> Result<(), String> {
    eprintln!("[apply_vpn_config] Called with protocol: {}", protocol);
    eprintln!("[apply_vpn_config] Config:\n{}", config);
    
    // Parse the config string to extract VPN parameters
    let vpn_config = parse_vpn_config(&protocol, &config)?;
    
    eprintln!("[apply_vpn_config] Parsed config: endpoint={}:{}", 
        vpn_config.server_endpoint, vpn_config.server_port);
    
    // Connect via daemon
    daemon_client::connect_vpn(vpn_config)?;
    
    eprintln!("[apply_vpn_config] Connection request sent successfully");
    Ok(())
}

/// Parse VPN config string into daemon VpnConfig struct.
fn parse_vpn_config(protocol: &str, config: &str) -> Result<daemon_client::VpnConfig, String> {
    match protocol {
        "wireguard" => parse_wireguard_config(config),
        "openvpn" => Ok(daemon_client::VpnConfig {
            protocol: "openvpn".to_string(),
            server_id: String::new(),
            server_region: String::new(),
            server_endpoint: String::new(),
            server_port: 1194,
            wg_private_key: None,
            wg_public_key: None,
            wg_server_public_key: None,
            wg_preshared_key: None,
            assigned_ip: None,
            ovpn_config: Some(config.to_string()),
            ikev2_identity: None,
            ikev2_remote_id: None,
            dns_servers: vec!["1.1.1.1".to_string()],
        }),
        "ikev2" => parse_ikev2_config(config),
        other => Err(format!("unsupported protocol: {other}")),
    }
}

/// Parse WireGuard config into VpnConfig.
fn parse_wireguard_config(config: &str) -> Result<daemon_client::VpnConfig, String> {
    let mut private_key = None;
    let mut address = None;
    let mut dns = vec![];
    let mut public_key = None;
    let mut endpoint = None;
    let mut preshared_key = None;

    for line in config.lines() {
        let line = line.trim();
        if line.starts_with("PrivateKey") {
            private_key = line.split('=').nth(1).map(|s| s.trim().to_string());
        } else if line.starts_with("Address") {
            address = line.split('=').nth(1).map(|s| s.trim().split('/').next().unwrap_or("").to_string());
        } else if line.starts_with("DNS") {
            dns = line.split('=')
                .nth(1)
                .map(|s| s.split(',').map(|d| d.trim().to_string()).collect())
                .unwrap_or_default();
        } else if line.starts_with("PublicKey") {
            public_key = line.split('=').nth(1).map(|s| s.trim().to_string());
        } else if line.starts_with("PresharedKey") {
            preshared_key = line.split('=').nth(1).map(|s| s.trim().to_string());
        } else if line.starts_with("Endpoint") {
            endpoint = line.split('=').nth(1).map(|s| s.trim().to_string());
        }
    }

    let (server_endpoint, server_port) = endpoint
        .as_ref()
        .and_then(|e| {
            let parts: Vec<&str> = e.rsplitn(2, ':').collect();
            if parts.len() == 2 {
                Some((parts[1].to_string(), parts[0].parse().unwrap_or(51820)))
            } else {
                None
            }
        })
        .unwrap_or_else(|| (String::new(), 51820));

    Ok(daemon_client::VpnConfig {
        protocol: "wireguard".to_string(),
        server_id: String::new(),
        server_region: String::new(),
        server_endpoint,
        server_port,
        wg_private_key: private_key,
        wg_public_key: None,
        wg_server_public_key: public_key,
        wg_preshared_key: preshared_key,
        assigned_ip: address,
        ovpn_config: None,
        ikev2_identity: None,
        ikev2_remote_id: None,
        dns_servers: if dns.is_empty() { vec!["1.1.1.1".to_string()] } else { dns },
    })
}

/// Parse IKEv2 config into VpnConfig.
fn parse_ikev2_config(config: &str) -> Result<daemon_client::VpnConfig, String> {
    // IKEv2 config is typically just server info
    // Format: server=endpoint;identity=...;remote_id=...
    let mut server_endpoint = String::new();
    let mut identity = None;
    let mut remote_id = None;

    for part in config.split(';') {
        let kv: Vec<&str> = part.splitn(2, '=').collect();
        if kv.len() == 2 {
            match kv[0].trim() {
                "server" | "endpoint" => server_endpoint = kv[1].trim().to_string(),
                "identity" => identity = Some(kv[1].trim().to_string()),
                "remote_id" => remote_id = Some(kv[1].trim().to_string()),
                _ => {}
            }
        }
    }

    Ok(daemon_client::VpnConfig {
        protocol: "ikev2".to_string(),
        server_id: String::new(),
        server_region: String::new(),
        server_endpoint,
        server_port: 500,
        wg_private_key: None,
        wg_public_key: None,
        wg_server_public_key: None,
        wg_preshared_key: None,
        assigned_ip: None,
        ovpn_config: None,
        ikev2_identity: identity,
        ikev2_remote_id: remote_id,
        dns_servers: vec!["1.1.1.1".to_string()],
    })
}

/// Status of VPN connection
#[derive(Serialize, Clone)]
struct VpnConnectionStatus {
    is_connected: bool,
    protocol: Option<String>,
    interface_name: Option<String>,
}

/// Check if WireGuard interface is active
fn check_wireguard_status() -> Option<String> {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        // Check if the wg interface exists by running `wg show`
        let output = std::process::Command::new("wg")
            .arg("show")
            .arg("interfaces")
            .output()
            .ok()?;

        if output.status.success() {
            let interfaces = String::from_utf8_lossy(&output.stdout);
            let iface = interfaces.trim();
            if !iface.is_empty() {
                return Some(iface.to_string());
            }
        }
        None
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, check via wireguard.exe /dumplog or service status
        let output = std::process::Command::new("sc")
            .args(["query", "WireGuardTunnel$vpnvpn-wg"])
            .output()
            .ok()?;

        if output.status.success() {
            let out = String::from_utf8_lossy(&output.stdout);
            if out.contains("RUNNING") {
                return Some("vpnvpn-wg".to_string());
            }
        }
        None
    }
}

/// Check if OpenVPN process is running
fn check_openvpn_status() -> bool {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        let output = std::process::Command::new("pgrep")
            .arg("openvpn")
            .output()
            .ok();

        matches!(output, Some(o) if o.status.success())
    }

    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq openvpn.exe"])
            .output()
            .ok();

        if let Some(o) = output {
            let out = String::from_utf8_lossy(&o.stdout);
            return out.contains("openvpn.exe");
        }
        false
    }
}

/// Check VPN connection status via daemon.
#[tauri::command]
fn check_vpn_status() -> VpnConnectionStatus {
    // Try to get status from daemon
    match daemon_client::get_connection_status() {
        Ok(status) => VpnConnectionStatus {
            is_connected: status.state == "connected",
            protocol: status.protocol,
            interface_name: status.interface_name,
        },
        Err(_) => {
            // Daemon not available, check legacy way as fallback
            check_vpn_status_legacy()
        }
    }
}

/// Legacy VPN status check (fallback when daemon not running).
fn check_vpn_status_legacy() -> VpnConnectionStatus {
    // Check WireGuard first
    if let Some(iface) = check_wireguard_status() {
        return VpnConnectionStatus {
            is_connected: true,
            protocol: Some("wireguard".to_string()),
            interface_name: Some(iface),
        };
    }

    // Check OpenVPN
    if check_openvpn_status() {
        return VpnConnectionStatus {
            is_connected: true,
            protocol: Some("openvpn".to_string()),
            interface_name: None,
        };
    }

    // Not connected
    VpnConnectionStatus {
        is_connected: false,
        protocol: None,
        interface_name: None,
    }
}

/// Disconnect VPN via daemon (required).
#[tauri::command]
fn disconnect_vpn(_protocol: Option<String>) -> Result<(), String> {
    // All disconnections go through daemon (protocol is ignored, daemon knows the active connection)
    daemon_client::disconnect_vpn()
}

// Backwards-compatible wrappers used by older frontends.
#[tauri::command]
fn apply_wireguard_config(config: String) -> Result<(), String> {
    apply_vpn_config("wireguard".into(), config)
}

#[tauri::command]
fn disconnect_wireguard() -> Result<(), String> {
    disconnect_vpn(Some("wireguard".into()))
}

#[allow(dead_code)]
fn run_command(program: &str, args: &[&str]) -> Result<(), String> {
    let status = std::process::Command::new(program)
        .args(args)
        .status()
        .map_err(|e| format!("failed to run {program}: {e}"))?;

    if !status.success() {
        return Err(format!("{program} exited with status {status}"));
    }

    Ok(())
}

// ============ Daemon-related commands ============

/// Check if daemon is available.
#[tauri::command]
fn is_daemon_available() -> bool {
    daemon_client::is_daemon_available()
}

/// Get daemon status.
#[tauri::command]
fn get_daemon_status() -> Result<daemon_client::DaemonStatus, String> {
    eprintln!("[get_daemon_status] Called");
    
    if !daemon_client::is_daemon_available() {
        eprintln!("[get_daemon_status] Daemon not available, returning default status");
        return Ok(daemon_client::DaemonStatus::default());
    }
    
    eprintln!("[get_daemon_status] Daemon available, getting status");
    let result = daemon_client::get_status();
    eprintln!("[get_daemon_status] Result: {:?}", result);
    result
}

/// Get daemon logs (macOS only).
#[tauri::command]
fn get_daemon_logs() -> Result<String, String> {
    eprintln!("[get_daemon_logs] Called");
    
    #[cfg(target_os = "macos")]
    {
        let mut logs = String::new();
        
        // Read stdout log
        if let Ok(stdout) = std::fs::read_to_string("/var/log/vpnvpn-daemon.log") {
            logs.push_str("=== STDOUT LOG ===\n");
            // Get last 100 lines
            let lines: Vec<&str> = stdout.lines().collect();
            let start = if lines.len() > 100 { lines.len() - 100 } else { 0 };
            for line in &lines[start..] {
                logs.push_str(line);
                logs.push('\n');
            }
        } else {
            logs.push_str("=== STDOUT LOG ===\n(not found)\n");
        }
        
        // Read stderr log
        if let Ok(stderr) = std::fs::read_to_string("/var/log/vpnvpn-daemon.error.log") {
            logs.push_str("\n=== STDERR LOG ===\n");
            let lines: Vec<&str> = stderr.lines().collect();
            let start = if lines.len() > 100 { lines.len() - 100 } else { 0 };
            for line in &lines[start..] {
                logs.push_str(line);
                logs.push('\n');
            }
        } else {
            logs.push_str("\n=== STDERR LOG ===\n(not found)\n");
        }
        
        // Get launchctl info
        if let Ok(output) = std::process::Command::new("launchctl")
            .args(["list", "com.vpnvpn.daemon"])
            .output()
        {
            logs.push_str("\n=== LAUNCHCTL STATUS ===\n");
            logs.push_str(&String::from_utf8_lossy(&output.stdout));
            if !output.stderr.is_empty() {
                logs.push_str(&String::from_utf8_lossy(&output.stderr));
            }
        }
        
        Ok(logs)
    }
    
    #[cfg(target_os = "linux")]
    {
        let output = std::process::Command::new("journalctl")
            .args(["-u", "vpnvpn-daemon", "-n", "100", "--no-pager"])
            .output()
            .map_err(|e| format!("Failed to get logs: {}", e))?;
        
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
    
    #[cfg(target_os = "windows")]
    {
        Ok("Windows log viewing not yet implemented".to_string())
    }
}

/// Enable kill switch via daemon.
#[tauri::command]
fn enable_kill_switch(allow_lan: bool) -> Result<(), String> {
    daemon_client::enable_kill_switch(allow_lan)
}

/// Disable kill switch via daemon.
#[tauri::command]
fn disable_kill_switch() -> Result<(), String> {
    daemon_client::disable_kill_switch()
}

/// Restart daemon service.
#[tauri::command]
fn restart_daemon() -> Result<(), String> {
    daemon_client::restart_daemon()
}

/// Get the sidecar binary name with target triple suffix.
fn sidecar_binary_name() -> String {
    let target = std::env::consts::ARCH;
    let os = std::env::consts::OS;
    
    let triple = match (os, target) {
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        ("windows", "aarch64") => "aarch64-pc-windows-msvc",
        _ => "unknown",
    };
    
    let ext = if os == "windows" { ".exe" } else { "" };
    format!("vpnvpn-daemon-{}{}", triple, ext)
}

/// Find the daemon binary from multiple possible locations.
/// In production builds, it's bundled as a Tauri sidecar.
/// In development, we look for it in the cargo build output.
fn find_daemon_binary() -> Result<PathBuf, String> {
    let app_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {e}"))?;

    // List of possible daemon binary locations (in order of priority)
    let mut candidates: Vec<PathBuf> = Vec::new();
    
    // Get sidecar name for current platform
    let sidecar_name = sidecar_binary_name();

    #[cfg(target_os = "macos")]
    {
        // Production: Tauri sidecar in Contents/MacOS/
        if let Some(exe_dir) = app_path.parent() {
            candidates.push(exe_dir.join(&sidecar_name));
            candidates.push(exe_dir.join("vpnvpn-daemon"));
        }
        // Production: bundled in app Contents/Library/LaunchServices/
        if let Some(bundle_path) = app_path.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
            candidates.push(bundle_path.join("Contents/Library/LaunchServices/com.vpnvpn.daemon"));
            candidates.push(bundle_path.join("Contents/Resources/vpnvpn-daemon"));
            candidates.push(bundle_path.join(format!("Contents/MacOS/{}", sidecar_name)));
        }
        // Development: cargo build output (release)
        if let Some(workspace_root) = find_workspace_root(&app_path) {
            candidates.push(workspace_root.join("apps/desktop/daemon/target/release/vpnvpn-daemon"));
            candidates.push(workspace_root.join("apps/desktop/daemon/target/debug/vpnvpn-daemon"));
            candidates.push(workspace_root.join("target/release/vpnvpn-daemon"));
            candidates.push(workspace_root.join("target/debug/vpnvpn-daemon"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Production: Tauri sidecar adjacent to executable
        if let Some(exe_dir) = app_path.parent() {
            candidates.push(exe_dir.join(&sidecar_name));
            candidates.push(exe_dir.join("vpnvpn-daemon"));
        }
        // Development: cargo build output
        if let Some(workspace_root) = find_workspace_root(&app_path) {
            candidates.push(workspace_root.join("apps/desktop/daemon/target/release/vpnvpn-daemon"));
            candidates.push(workspace_root.join("apps/desktop/daemon/target/debug/vpnvpn-daemon"));
            candidates.push(workspace_root.join("target/release/vpnvpn-daemon"));
            candidates.push(workspace_root.join("target/debug/vpnvpn-daemon"));
        }
        // System paths (for AppImage or installed app)
        candidates.push(PathBuf::from("/usr/lib/vpnvpn/vpnvpn-daemon"));
        candidates.push(PathBuf::from("/opt/vpnvpn/vpnvpn-daemon"));
    }

    #[cfg(target_os = "windows")]
    {
        // Production: Tauri sidecar adjacent to executable
        if let Some(exe_dir) = app_path.parent() {
            candidates.push(exe_dir.join(&sidecar_name));
            candidates.push(exe_dir.join("vpnvpn-daemon.exe"));
        }
        // Development: cargo build output
        if let Some(workspace_root) = find_workspace_root(&app_path) {
            candidates.push(workspace_root.join(r"apps\desktop\daemon\target\release\vpnvpn-daemon.exe"));
            candidates.push(workspace_root.join(r"apps\desktop\daemon\target\debug\vpnvpn-daemon.exe"));
            candidates.push(workspace_root.join(r"target\release\vpnvpn-daemon.exe"));
            candidates.push(workspace_root.join(r"target\debug\vpnvpn-daemon.exe"));
        }
    }

    // Find the first existing candidate
    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    // Return helpful error with searched paths
    let searched = candidates
        .iter()
        .map(|p| format!("  - {}", p.display()))
        .collect::<Vec<_>>()
        .join("\n");
    
    Err(format!(
        "Daemon binary not found. Searched locations:\n{}\n\nHint: In development, build the daemon first with:\n  cd apps/desktop/daemon && cargo build --release",
        searched
    ))
}

/// Try to find the workspace root by looking for Cargo.toml or package.json
fn find_workspace_root(start_path: &PathBuf) -> Option<PathBuf> {
    let mut current = start_path.clone();
    
    // Go up the directory tree looking for workspace markers
    for _ in 0..10 {
        if let Some(parent) = current.parent() {
            // Check for monorepo markers
            if parent.join("turbo.json").exists() 
                || parent.join("package.json").exists() && parent.join("apps").exists()
                || parent.join("Cargo.toml").exists() && parent.join("apps").exists()
            {
                return Some(parent.to_path_buf());
            }
            current = parent.to_path_buf();
        } else {
            break;
        }
    }
    None
}

/// Install the daemon service.
#[tauri::command]
fn install_daemon() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        install_daemon_macos()
    }

    #[cfg(target_os = "linux")]
    {
        install_daemon_linux()
    }

    #[cfg(target_os = "windows")]
    {
        install_daemon_windows()
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("Platform not supported".to_string())
    }
}

#[cfg(target_os = "macos")]
fn install_daemon_macos() -> Result<(), String> {
    eprintln!("[install_daemon_macos] Starting daemon installation...");
    
    let daemon_src = find_daemon_binary()?;
    eprintln!("[install_daemon_macos] Found daemon binary at: {}", daemon_src.display());

    // Use osascript for privilege elevation
    let script = format!(
        r#"do shell script "
            echo '[install] Creating directories...' >&2 &&
            mkdir -p /Library/PrivilegedHelperTools &&
            echo '[install] Copying daemon binary...' >&2 &&
            cp '{}' /Library/PrivilegedHelperTools/com.vpnvpn.daemon &&
            chmod 755 /Library/PrivilegedHelperTools/com.vpnvpn.daemon &&
            chown root:wheel /Library/PrivilegedHelperTools/com.vpnvpn.daemon &&
            echo '[install] Creating LaunchDaemon plist...' >&2 &&
            cat > /Library/LaunchDaemons/com.vpnvpn.daemon.plist << 'PLIST'
<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
    <key>Label</key>
    <string>com.vpnvpn.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Library/PrivilegedHelperTools/com.vpnvpn.daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>StandardOutPath</key>
    <string>/var/log/vpnvpn-daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/vpnvpn-daemon.error.log</string>
</dict>
</plist>
PLIST
            chmod 644 /Library/LaunchDaemons/com.vpnvpn.daemon.plist &&
            echo '[install] Unloading any existing daemon...' >&2 &&
            launchctl unload /Library/LaunchDaemons/com.vpnvpn.daemon.plist 2>/dev/null || true &&
            echo '[install] Loading daemon...' >&2 &&
            launchctl load /Library/LaunchDaemons/com.vpnvpn.daemon.plist &&
            echo '[install] Checking daemon status...' >&2 &&
            sleep 1 &&
            launchctl list | grep com.vpnvpn.daemon &&
            echo '[install] Installation complete!' >&2
        " with administrator privileges"#,
        daemon_src.display()
    );

    eprintln!("[install_daemon_macos] Running osascript for privilege elevation...");
    
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to run osascript: {e}"))?;

    eprintln!("[install_daemon_macos] osascript exit code: {:?}", output.status.code());
    if !output.stdout.is_empty() {
        eprintln!("[install_daemon_macos] stdout: {}", String::from_utf8_lossy(&output.stdout));
    }
    if !output.stderr.is_empty() {
        eprintln!("[install_daemon_macos] stderr: {}", String::from_utf8_lossy(&output.stderr));
    }

    if !output.status.success() {
        return Err(format!(
            "Installation cancelled or failed. Exit code: {:?}\nstderr: {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Verify the daemon is running
    eprintln!("[install_daemon_macos] Verifying daemon is running...");
    std::thread::sleep(std::time::Duration::from_secs(2));
    
    let check = std::process::Command::new("launchctl")
        .args(["list", "com.vpnvpn.daemon"])
        .output();
    
    match check {
        Ok(out) => {
            eprintln!("[install_daemon_macos] launchctl list output: {}", String::from_utf8_lossy(&out.stdout));
            if out.status.success() {
                eprintln!("[install_daemon_macos] Daemon appears to be loaded");
            } else {
                eprintln!("[install_daemon_macos] WARNING: Daemon may not be loaded: {}", String::from_utf8_lossy(&out.stderr));
            }
        }
        Err(e) => {
            eprintln!("[install_daemon_macos] WARNING: Could not check daemon status: {e}");
        }
    }
    
    // Check if socket exists
    let socket_path = "/var/run/vpnvpn-daemon.sock";
    for i in 0..5 {
        if std::path::Path::new(socket_path).exists() {
            eprintln!("[install_daemon_macos] Socket file found at {}", socket_path);
            break;
        }
        eprintln!("[install_daemon_macos] Waiting for socket file... attempt {}/5", i + 1);
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    
    if !std::path::Path::new(socket_path).exists() {
        eprintln!("[install_daemon_macos] WARNING: Socket file not found at {}. Check /var/log/vpnvpn-daemon.error.log for errors.", socket_path);
    }

    eprintln!("[install_daemon_macos] Installation completed successfully");
    Ok(())
}

#[cfg(target_os = "linux")]
fn install_daemon_linux() -> Result<(), String> {
    let daemon_src = find_daemon_binary()?;

    let script = format!(
        r#"pkexec sh -c '
            cp "{}" /usr/local/bin/vpnvpn-daemon &&
            chmod 755 /usr/local/bin/vpnvpn-daemon &&
            chown root:root /usr/local/bin/vpnvpn-daemon &&
            cat > /etc/systemd/system/vpnvpn-daemon.service << EOF
[Unit]
Description=vpnVPN Daemon
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/vpnvpn-daemon
Restart=always
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW

[Install]
WantedBy=multi-user.target
EOF
            systemctl daemon-reload &&
            systemctl enable vpnvpn-daemon &&
            systemctl start vpnvpn-daemon
        '"#,
        daemon_src.display()
    );

    let status = std::process::Command::new("sh")
        .arg("-c")
        .arg(&script)
        .status()
        .map_err(|e| format!("Failed to run install script: {e}"))?;

    if !status.success() {
        return Err("Installation failed".to_string());
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn install_daemon_windows() -> Result<(), String> {
    let daemon_src = find_daemon_binary()?;

    let install_dir = r"C:\Program Files\vpnVPN";
    let daemon_dst = format!(r"{}\vpnvpn-daemon.exe", install_dir);

    // PowerShell script for elevated installation
    let ps_script = format!(
        r#"
        $ErrorActionPreference = "Stop"
        New-Item -ItemType Directory -Force -Path "{install_dir}" | Out-Null
        Copy-Item -Path "{src}" -Destination "{dst}" -Force
        if (Get-Service -Name "vpnvpn-daemon" -ErrorAction SilentlyContinue) {{
            Stop-Service -Name "vpnvpn-daemon" -Force -ErrorAction SilentlyContinue
            sc.exe delete vpnvpn-daemon
            Start-Sleep -Seconds 2
        }}
        New-Service -Name "vpnvpn-daemon" -BinaryPathName "{dst}" -DisplayName "vpnVPN Daemon" -StartupType Automatic
        Start-Service -Name "vpnvpn-daemon"
        "#,
        install_dir = install_dir,
        src = daemon_src.display(),
        dst = daemon_dst
    );

    // Run PowerShell elevated
    let status = std::process::Command::new("powershell")
        .args(["-Command", "Start-Process", "powershell", "-Verb", "RunAs", "-ArgumentList", &format!("'-Command {}'", ps_script.replace("'", "''"))])
        .status()
        .map_err(|e| format!("Failed to run PowerShell: {e}"))?;

    if !status.success() {
        return Err("Installation failed".to_string());
    }

    Ok(())
}

/// Uninstall the daemon service.
#[tauri::command]
fn uninstall_daemon() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"do shell script "
            launchctl unload /Library/LaunchDaemons/com.vpnvpn.daemon.plist 2>/dev/null || true &&
            rm -f /Library/LaunchDaemons/com.vpnvpn.daemon.plist &&
            rm -f /Library/PrivilegedHelperTools/com.vpnvpn.daemon &&
            rm -f /var/run/vpnvpn-daemon.sock
        " with administrator privileges"#;

        let status = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .status()
            .map_err(|e| format!("Failed to run osascript: {e}"))?;

        if !status.success() {
            return Err("Uninstallation cancelled or failed".to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        let script = r#"pkexec sh -c '
            systemctl stop vpnvpn-daemon 2>/dev/null || true &&
            systemctl disable vpnvpn-daemon 2>/dev/null || true &&
            rm -f /etc/systemd/system/vpnvpn-daemon.service &&
            systemctl daemon-reload &&
            rm -f /usr/local/bin/vpnvpn-daemon &&
            rm -f /var/run/vpnvpn-daemon.sock
        '"#;

        let status = std::process::Command::new("sh")
            .arg("-c")
            .arg(script)
            .status()
            .map_err(|e| format!("Failed to run uninstall script: {e}"))?;

        if !status.success() {
            return Err("Uninstallation failed".to_string());
        }
    }

    #[cfg(target_os = "windows")]
    {
        let ps_script = r#"
            Stop-Service -Name "vpnvpn-daemon" -Force -ErrorAction SilentlyContinue
            sc.exe delete vpnvpn-daemon
            Remove-Item -Path "C:\Program Files\vpnVPN" -Recurse -Force -ErrorAction SilentlyContinue
        "#;

        let status = std::process::Command::new("powershell")
            .args(["-Command", "Start-Process", "powershell", "-Verb", "RunAs", "-ArgumentList", &format!("'-Command {}'", ps_script.replace("'", "''"))])
            .status()
            .map_err(|e| format!("Failed to run PowerShell: {e}"))?;

        if !status.success() {
            return Err("Uninstallation failed".to_string());
        }
    }

    Ok(())
}

/// Update daemon in development mode - builds and reinstalls.
#[tauri::command]
async fn update_daemon_dev() -> Result<(), String> {
    // Find the daemon source directory
    let daemon_dir = find_daemon_source_dir()?;
    
    // Build the daemon
    let build_output = std::process::Command::new("cargo")
        .arg("build")
        .arg("--release")
        .current_dir(&daemon_dir)
        .output()
        .map_err(|e| format!("Failed to run cargo build: {e}"))?;
    
    if !build_output.status.success() {
        let stderr = String::from_utf8_lossy(&build_output.stderr);
        return Err(format!("Daemon build failed:\n{stderr}"));
    }
    
    // Reinstall the daemon
    install_daemon()
}

/// Find the daemon source directory for development builds.
fn find_daemon_source_dir() -> Result<PathBuf, String> {
    // Try to find daemon dir relative to the src-tauri directory
    let possible_paths = [
        // From src-tauri directory
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../daemon"),
        // Absolute path from workspace root
        PathBuf::from("/Users/xnetcat/Projects/xnetcat/vpnVPN/apps/desktop/daemon"),
    ];
    
    for path in &possible_paths {
        if path.exists() && path.join("Cargo.toml").exists() {
            return Ok(path.canonicalize().unwrap_or_else(|_| path.clone()));
        }
    }
    
    Err("Daemon source directory not found. This feature is only available in development.".to_string())
}

/// Check if running in development mode.
#[tauri::command]
fn is_development() -> bool {
    cfg!(debug_assertions)
}

/// Load onboarding state from config.
#[tauri::command]
fn get_onboarding_state() -> Result<OnboardingState, String> {
    load_onboarding_state()
}

/// Save onboarding state to config.
#[tauri::command]
fn save_onboarding_state(state: OnboardingState) -> Result<(), String> {
    save_onboarding_state_internal(&state)
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct OnboardingState {
    completed: bool,
    current_step: String,
    selected_protocol: Option<String>,
    kill_switch_enabled: bool,
    allow_lan: bool,
    daemon_installed: bool,
}

fn onboarding_config_path() -> Result<PathBuf, String> {
    config_path().map(|p| p.with_file_name("onboarding.json"))
}

fn load_onboarding_state() -> Result<OnboardingState, String> {
    let path = onboarding_config_path()?;
    if !path.exists() {
        return Ok(OnboardingState::default());
    }
    let data = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read onboarding state: {e}"))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse onboarding state: {e}"))
}

fn save_onboarding_state_internal(state: &OnboardingState) -> Result<(), String> {
    let path = onboarding_config_path()?;
    let data = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize onboarding state: {e}"))?;
    std::fs::write(&path, data)
        .map_err(|e| format!("Failed to write onboarding state: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;

    fn init_temp_home() {
        let base = env::temp_dir().join("vpnvpn-desktop-test");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        #[cfg(target_os = "windows")]
        env::set_var("APPDATA", &base);

        #[cfg(not(target_os = "windows"))]
        env::set_var("HOME", &base);
    }

    #[test]
    fn settings_round_trip() {
        init_temp_home();

        let mut settings = DesktopSettings::default();
        settings.preferred_protocol = "openvpn".into();
        settings.auto_connect = true;
        settings.wg_quick_path = Some("wg-custom".into());

        save_settings(&settings).expect("save_settings should succeed");
        let loaded = load_settings().expect("load_settings should succeed");

        assert_eq!(loaded.preferred_protocol, "openvpn");
        assert!(loaded.auto_connect);
        assert_eq!(loaded.wg_quick_path.as_deref(), Some("wg-custom"));
    }

    #[test]
    fn get_desktop_settings_uses_default_when_missing_file() {
        init_temp_home();
        let settings = get_desktop_settings().expect("get_desktop_settings should succeed");
        assert_eq!(settings.preferred_protocol, "wireguard");
    }
}

/// Update tray state from frontend
#[tauri::command]
fn update_tray_state(
    app: tauri::AppHandle,
    connected: bool,
    kill_switch_enabled: bool,
    auto_start_enabled: bool,
    server_name: Option<String>,
) -> Result<(), String> {
    let state = tray::TrayState {
        connected,
        kill_switch_enabled,
        auto_start_enabled,
        server_name,
    };
    tray::update_tray_state(&app, &state)
}

#[cfg(not(test))]
fn main() {
    tauri::Builder::default()
        // Deep link plugin registers the `vpnvpn://` scheme on all desktop OSes.
        .plugin(tauri_plugin_deep_link::init())
        // Shell plugin for opening URLs in browser
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Create system tray
            match tray::create_tray(app.handle()) {
                Ok(_tray) => {
                    println!("System tray created successfully");
                }
                Err(e) => {
                    eprintln!("Failed to create system tray: {}", e);
                }
            }

            // On Linux and Windows, ensure the statically configured schemes are
            // registered for the current executable (handy in dev and portable builds).
            #[cfg(any(windows, target_os = "linux"))]
            {
                app.deep_link().register_all()?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            health_check,
            get_machine_id,
            detect_vpn_tools,
            refresh_vpn_tools,
            update_vpn_binary_paths,
            get_vpn_tools_detailed,
            check_vpn_status,
            get_desktop_settings,
            update_desktop_settings,
            apply_vpn_config,
            disconnect_vpn,
            apply_wireguard_config,
            disconnect_wireguard,
            // Daemon commands
            is_daemon_available,
            get_daemon_status,
            get_daemon_logs,
            enable_kill_switch,
            disable_kill_switch,
            restart_daemon,
            install_daemon,
            uninstall_daemon,
            update_daemon_dev,
            is_development,
            get_onboarding_state,
            save_onboarding_state,
            // Tray commands
            update_tray_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running vpnVPN desktop application");
}
