#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;

#[derive(Serialize)]
struct Health {
    ok: bool,
}

#[tauri::command]
fn health_check() -> Health {
    Health { ok: true }
}

#[tauri::command]
fn apply_wireguard_config(config: String) -> Result<(), String> {
    use std::fs;
    use std::path::PathBuf;

    let mut path: PathBuf = std::env::temp_dir();
    path.push("vpnvpn-wg.conf");

    fs::write(&path, config).map_err(|e| format!("failed to write config: {e}"))?;

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        run_command("wg-quick", &["up", path.to_string_lossy().as_ref()])?;
    }

    #[cfg(target_os = "windows")]
    {
        // Requires official WireGuard for Windows CLI (wireguard.exe) on PATH.
        // The service name is derived from the `Name` field in the config.
        run_command(
            "wireguard.exe",
            &["/installtunnelservice", path.to_string_lossy().as_ref()],
        )?;
    }

    Ok(())
}

#[tauri::command]
fn disconnect_wireguard() -> Result<(), String> {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        use std::path::PathBuf;
        let mut path: PathBuf = std::env::temp_dir();
        path.push("vpnvpn-wg.conf");
        // Best-effort tear-down; ignore errors if interface is already down.
        let _ = run_command("wg-quick", &["down", path.to_string_lossy().as_ref()]);
    }

    #[cfg(target_os = "windows")]
    {
        // Best-effort: service name must match the `Name` in the config.
        let _ = run_command("wireguard.exe", &["/uninstalltunnelservice", "vpnvpn-desktop"]);
    }

    Ok(())
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            health_check,
            apply_wireguard_config,
            disconnect_wireguard
        ])
        .run(tauri::generate_context!())
        .expect("error while running vpnVPN desktop application");
}


