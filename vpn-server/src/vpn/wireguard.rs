use super::{BackendStatus, VpnBackend, VpnProtocol};
use anyhow::{anyhow, Context, Result};
use std::fs;
use std::path::Path;
use std::process::Command;
use tracing::{info, warn};

const WG_IFACE: &str = "wg0";
const WG_CONF: &str = "/etc/wireguard/wg0.conf";
const WG_KEY_PATH: &str = "/etc/wireguard/server.key";

pub struct WireGuardBackend {
    listen_port: u16,
}

impl WireGuardBackend {
    pub fn new() -> Result<Self> {
        let listen_port: u16 = std::env::var("LISTEN_UDP_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(51820);
        Ok(Self { listen_port })
    }

    fn ensure_keys_and_config(&self) -> Result<()> {
        if !Path::new("/etc/wireguard").exists() {
            fs::create_dir_all("/etc/wireguard").context("create /etc/wireguard")?;
        }

        if !Path::new(WG_KEY_PATH).exists() {
            let output = Command::new("wg").arg("genkey").output().context("wg genkey")?;
            if !output.status.success() { return Err(anyhow!("wg genkey failed")); }
            let key = String::from_utf8_lossy(&output.stdout).trim().to_string();
            fs::write(WG_KEY_PATH, format!("{}\n", key)).context("write wg private key")?;
        }

        if !Path::new(WG_CONF).exists() {
            let privkey = fs::read_to_string(WG_KEY_PATH).unwrap_or_default().trim().to_string();
            let conf = format!(
                "[Interface]\nPrivateKey = {privkey}\nAddress = 10.8.0.1/24\nListenPort = {port}\nSaveConfig = true\n",
                port = self.listen_port
            );
            fs::write(WG_CONF, conf).context("write wg0.conf")?;
        }
        Ok(())
    }

    fn iface_exists(&self) -> bool {
        let out = Command::new("ip").args(["link", "show", WG_IFACE]).output();
        out.map(|o| o.status.success()).unwrap_or(false)
    }

    fn run_cmd(cmd: &str, args: &[&str]) -> Result<()> {
        let status = Command::new(cmd).args(args).status().with_context(|| {
            format!("failed to spawn {cmd} {}", args.join(" "))
        })?;
        if !status.success() {
            return Err(anyhow!("command failed: {cmd} {}", args.join(" ")));
        }
        Ok(())
    }

    fn start_userspace(&self) -> Result<()> {
        // Start wireguard-go userspace device if not present
        if !self.iface_exists() {
            // Detach in background
            let child = Command::new("wireguard-go").arg(WG_IFACE).spawn();
            match child {
                Ok(_c) => info!("wireguard_go_started"),
                Err(e) => {
                    warn!(error=?e, "wireguard_go_spawn_failed");
                }
            }
        }
        // Configure IP and bring up
        Self::run_cmd("ip", &["address", "add", "10.8.0.1/24", "dev", WG_IFACE]).ok();
        Self::run_cmd("ip", &["link", "set", "up", "dev", WG_IFACE])?;
        // Apply configuration
        Self::run_cmd("wg", &["setconf", WG_IFACE, WG_CONF])?;
        Ok(())
    }

    fn parse_status() -> Result<BackendStatus> {
        let output = Command::new("wg").args(["show", WG_IFACE, "dump"]).output()?;
        if !output.status.success() {
            return Err(anyhow!("wg show dump failed"));
        }
        let text = String::from_utf8_lossy(&output.stdout);
        // dump format: interface: not included; peers lines: pubkey preshared endpoint allowed latest_handshake rx tx persistent_keepalive
        let mut active = 0usize;
        let mut rx_total: u64 = 0;
        let mut tx_total: u64 = 0;
        for line in text.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 9 {
                let latest_hs = parts[5];
                let rx = parts[6].parse::<u64>().unwrap_or(0);
                let tx = parts[7].parse::<u64>().unwrap_or(0);
                if latest_hs != "0" || rx > 0 || tx > 0 {
                    active += 1;
                }
                rx_total = rx_total.saturating_add(rx);
                tx_total = tx_total.saturating_add(tx);
            }
        }
        Ok(BackendStatus {
            protocol: "wireguard".into(),
            active_sessions: active,
            egress_bytes: tx_total,
            ingress_bytes: rx_total,
            running: true,
        })
    }
}

impl VpnBackend for WireGuardBackend {
    fn protocol(&self) -> VpnProtocol { VpnProtocol::WireGuard }

    fn start(&self) -> Result<()> {
        self.ensure_keys_and_config()?;
        self.start_userspace().context("start wireguard userspace")
    }

    fn stop(&self) -> Result<()> {
        // Best-effort: bring interface down and delete
        let _ = Self::run_cmd("ip", &["link", "set", "down", "dev", WG_IFACE]);
        let _ = Self::run_cmd("ip", &["link", "del", "dev", WG_IFACE]);
        Ok(())
    }

    fn status(&self) -> Result<BackendStatus> {
        Self::parse_status().or_else(|e| {
            warn!(error=?e, "wg_status_failed");
            Ok(BackendStatus { protocol: "wireguard".into(), running: false, active_sessions: 0, egress_bytes: 0, ingress_bytes: 0 })
        })
    }
}


