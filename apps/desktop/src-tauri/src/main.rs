#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri_plugin_deep_link::DeepLinkExt;

#[derive(Serialize)]
struct Health {
    ok: bool,
}

#[tauri::command]
fn health_check() -> Health {
    Health { ok: true }
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
        current.wg_quick_path = update.wg_quick_path;
    }
    if update.openvpn_path.is_some() {
        current.openvpn_path = update.openvpn_path;
    }
    if update.wireguard_cli_path.is_some() {
        current.wireguard_cli_path = update.wireguard_cli_path;
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
    Err(format!(
        "IKEv2 auto-apply is not implemented; import config from {} using your OS VPN settings.",
        path.display()
    ))
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
        .setup(|app| {
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
