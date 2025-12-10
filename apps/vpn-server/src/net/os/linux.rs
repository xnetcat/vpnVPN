use super::NetworkManager;
use anyhow::{anyhow, Context, Result};
use std::process::Command;
use tracing::info;

#[derive(Default)]
pub struct LinuxNetworkManager;

impl NetworkManager for LinuxNetworkManager {
    fn check_dependencies(&self) -> Result<()> {
        // Check for 'ip' command
        if Command::new("ip").arg("-V").output().is_err() {
            return Err(anyhow!("'ip' command not found (install iproute2)"));
        }
        // Check for 'wg' command
        if Command::new("wg").arg("version").output().is_err() {
            return Err(anyhow!("'wg' command not found (install wireguard-tools)"));
        }
        Ok(())
    }

    fn configure_wireguard(
        &self,
        iface: &str,
        ip_cidr: &str,
        _port: u16,
        conf_path: &str,
    ) -> Result<()> {
        // On Linux, we use a mix of manual interface creation (for userspace go) or kernel module.
        // We assume userspace or kernel module is loaded.

        // 1. Check if iface exists, if not start wireguard-go if available
        let iface_exists = Command::new("ip")
            .args(["link", "show", iface])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        if !iface_exists {
            // Try wireguard-go if not kernel managed
            if let Ok(_) = Command::new("wireguard-go").arg(iface).spawn() {
                info!("Started wireguard-go userspace backend");
            } else {
                // If wireguard-go fails, maybe kernel module create
                let _ = Command::new("ip")
                    .args(["link", "add", iface, "type", "wireguard"])
                    .output();
            }
        }

        // 2. Assign IP
        let _ = Command::new("ip")
            .args(["address", "add", ip_cidr, "dev", iface])
            .output();

        // 3. Apply config
        let status = Command::new("wg")
            .args(["setconf", iface, conf_path])
            .status()
            .context("wg setconf failed")?;

        if !status.success() {
            return Err(anyhow!("wg setconf failed"));
        }

        Ok(())
    }

    fn bring_up_interface(&self, iface: &str) -> Result<()> {
        let status = Command::new("ip")
            .args(["link", "set", "up", "dev", iface])
            .status()
            .context("ip link set up failed")?;

        if !status.success() {
            return Err(anyhow!("ip link set up failed"));
        }
        Ok(())
    }

    fn teardown_interface(&self, iface: &str) -> Result<()> {
        let _ = Command::new("ip")
            .args(["link", "set", "down", "dev", iface])
            .output();
        let _ = Command::new("ip")
            .args(["link", "del", "dev", iface])
            .output();
        Ok(())
    }
}
