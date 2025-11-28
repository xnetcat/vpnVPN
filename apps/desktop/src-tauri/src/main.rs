#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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

/// Status of VPN tool availability on the system.
#[derive(Serialize, Clone)]
struct VpnToolsStatus {
    wireguard_available: bool,
    wireguard_path: Option<String>,
    openvpn_available: bool,
    openvpn_path: Option<String>,
    ikev2_available: bool,
    ikev2_path: Option<String>,
}

/// Check if a command exists and is executable.
fn command_exists(cmd: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        // On Windows, try `where` to find the command
        let output = std::process::Command::new("where").arg(cmd).output().ok()?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()?
                .trim()
                .to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
        None
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On Unix, use `which` to find the command
        let output = std::process::Command::new("which").arg(cmd).output().ok()?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
        None
    }
}

/// Check common installation paths for a command (useful when PATH is not set properly)
fn check_common_paths(cmd: &str) -> Option<String> {
    let common_paths = [
        // Homebrew on Apple Silicon
        format!("/opt/homebrew/bin/{}", cmd),
        // Homebrew on Intel Mac / Linux
        format!("/usr/local/bin/{}", cmd),
        // Standard Unix paths
        format!("/usr/bin/{}", cmd),
        format!("/bin/{}", cmd),
        // Additional Linux paths
        format!("/usr/sbin/{}", cmd),
        format!("/sbin/{}", cmd),
    ];

    common_paths
        .into_iter()
        .find(|path| std::path::Path::new(path).exists())
}

/// Find a command by checking PATH first, then common locations
fn find_command(cmd: &str) -> Option<String> {
    command_exists(cmd).or_else(|| check_common_paths(cmd))
}

/// Helper to get a non-empty custom path from settings
fn non_empty_path(path: Option<&str>) -> Option<&str> {
    path.filter(|p| !p.trim().is_empty())
}

#[tauri::command]
fn detect_vpn_tools() -> VpnToolsStatus {
    let settings = load_settings().unwrap_or_default();

    // Check WireGuard availability
    let (wireguard_available, wireguard_path) = {
        #[cfg(target_os = "windows")]
        {
            // On Windows, check for wireguard.exe CLI
            let custom_path = non_empty_path(settings.wireguard_cli_path.as_deref());
            if let Some(path) = custom_path {
                if std::path::Path::new(path).exists() {
                    (true, Some(path.to_string()))
                } else {
                    // Custom path invalid, fall back to auto-detection
                    let found = find_command("wireguard.exe").or_else(|| find_command("wireguard"));
                    (found.is_some(), found)
                }
            } else {
                let found = find_command("wireguard.exe").or_else(|| find_command("wireguard"));
                (found.is_some(), found)
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            // On Linux/macOS, check for wg-quick
            let custom_path = non_empty_path(settings.wg_quick_path.as_deref());
            if let Some(path) = custom_path {
                if std::path::Path::new(path).exists() || find_command(path).is_some() {
                    (true, Some(path.to_string()))
                } else {
                    // Custom path invalid, fall back to auto-detection
                    let found = find_command("wg-quick");
                    (found.is_some(), found)
                }
            } else {
                let found = find_command("wg-quick");
                (found.is_some(), found)
            }
        }
    };

    // Check OpenVPN availability
    let (openvpn_available, openvpn_path) = {
        let custom_path = non_empty_path(settings.openvpn_path.as_deref());
        if let Some(path) = custom_path {
            if std::path::Path::new(path).exists() || find_command(path).is_some() {
                (true, Some(path.to_string()))
            } else {
                // Custom path invalid, fall back to auto-detection
                #[cfg(target_os = "windows")]
                let found = find_command("openvpn.exe").or_else(|| find_command("openvpn"));
                #[cfg(not(target_os = "windows"))]
                let found = find_command("openvpn");
                (found.is_some(), found)
            }
        } else {
            #[cfg(target_os = "windows")]
            let found = find_command("openvpn.exe").or_else(|| find_command("openvpn"));
            #[cfg(not(target_os = "windows"))]
            let found = find_command("openvpn");
            (found.is_some(), found)
        }
    };

    // Check IKEv2/IPsec availability
    let (ikev2_available, ikev2_path) = {
        #[cfg(target_os = "macos")]
        {
            // macOS has built-in IKEv2 support via System Preferences / networksetup
            let found = find_command("networksetup");
            (found.is_some(), found)
        }
        #[cfg(target_os = "linux")]
        {
            // Linux typically uses strongSwan (ipsec command)
            let found = find_command("ipsec")
                .or_else(|| find_command("strongswan"))
                .or_else(|| find_command("nmcli"));
            (found.is_some(), found)
        }
        #[cfg(target_os = "windows")]
        {
            // Windows has built-in IKEv2 support via rasdial/PowerShell
            let found = find_command("rasdial");
            (found.is_some(), found)
        }
    };

    VpnToolsStatus {
        wireguard_available,
        wireguard_path,
        openvpn_available,
        openvpn_path,
        ikev2_available,
        ikev2_path,
    }
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

fn write_temp(filename: &str, contents: &str) -> Result<PathBuf, String> {
    use std::fs;

    let mut path: PathBuf = std::env::temp_dir();
    path.push(filename);

    fs::write(&path, contents).map_err(|e| format!("failed to write config: {e}"))?;
    Ok(path)
}

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

fn disconnect_ikev2() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn apply_vpn_config(protocol: String, config: String) -> Result<(), String> {
    match protocol.as_str() {
        "wireguard" => apply_wireguard(&config),
        "openvpn" => apply_openvpn(&config),
        "ikev2" => apply_ikev2(&config),
        other => Err(format!("unsupported protocol: {other}")),
    }
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

#[tauri::command]
fn check_vpn_status() -> VpnConnectionStatus {
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

#[tauri::command]
fn disconnect_vpn(protocol: Option<String>) -> Result<(), String> {
    match protocol.as_deref() {
        Some("wireguard") | None => disconnect_wireguard_internal(),
        Some("openvpn") => disconnect_openvpn(),
        Some("ikev2") => disconnect_ikev2(),
        Some(other) => Err(format!("unsupported protocol: {other}")),
    }
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

#[cfg(not(test))]
fn main() {
    tauri::Builder::default()
        // Deep link plugin registers the `vpnvpn://` scheme on all desktop OSes.
        .plugin(tauri_plugin_deep_link::init())
        // Shell plugin for opening URLs in browser
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            // On Linux and Windows, ensure the statically configured schemes are
            // registered for the current executable (handy in dev and portable builds).
            #[cfg(any(windows, target_os = "linux"))]
            {
                _app.deep_link().register_all()?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            health_check,
            get_machine_id,
            detect_vpn_tools,
            check_vpn_status,
            get_desktop_settings,
            update_desktop_settings,
            apply_vpn_config,
            disconnect_vpn,
            apply_wireguard_config,
            disconnect_wireguard
        ])
        .run(tauri::generate_context!())
        .expect("error while running vpnVPN desktop application");
}
