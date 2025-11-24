use super::{BackendStatus, PeerSpec, VpnBackend, VpnProtocol};
use crate::net::os::get_network_manager;
use anyhow::{anyhow, Context, Result};
use std::fs;
use std::path::Path;
use std::process::Command;
use tracing::warn;

const WG_IFACE: &str = "wg0";
const WG_CONF: &str = "wg0.conf"; // Relative or absolute depends on OS config
const WG_KEY_PATH: &str = "server.key";

pub struct WireGuardBackend {
    listen_port: u16,
    config_dir: String,
}

impl WireGuardBackend {
    pub fn new(listen_port: u16) -> Result<Self> {
        let config_dir = if cfg!(target_os = "windows") {
            ".".to_string() // Current dir or specific AppData path
        } else {
            "/etc/wireguard".to_string()
        };
        Ok(Self {
            listen_port,
            config_dir,
        })
    }

    fn key_path(&self) -> String {
        format!("{}/{}", self.config_dir, WG_KEY_PATH)
    }

    fn conf_path(&self) -> String {
        format!("{}/{}", self.config_dir, WG_CONF)
    }

    fn ensure_keys_and_config(&self) -> Result<()> {
        if !Path::new(&self.config_dir).exists() {
            fs::create_dir_all(&self.config_dir).context("create config dir")?;
        }

        let key_path = self.key_path();
        if !Path::new(&key_path).exists() {
            let output = Command::new("wg")
                .arg("genkey")
                .output()
                .context("wg genkey")?;
            if !output.status.success() {
                return Err(anyhow!("wg genkey failed"));
            }
            let key = String::from_utf8_lossy(&output.stdout).trim().to_string();
            fs::write(&key_path, format!("{}\n", key)).context("write wg private key")?;
        }

        let conf_path = self.conf_path();
        if !Path::new(&conf_path).exists() {
            let privkey = fs::read_to_string(&key_path)
                .unwrap_or_default()
                .trim()
                .to_string();
            // Address is configured by the OS network manager; keep only keys/port in wg config.
            // Note: do not include wg-quick-only directives (like Address/SaveConfig) because we
            // manage the interface via `wg` and OS tooling.
            let conf =
                format!("[Interface]\nPrivateKey = {privkey}\nListenPort = {port}\n", port = self.listen_port);
            fs::write(&conf_path, conf).context("write wg0.conf")?;
        }
        Ok(())
    }

    fn parse_status() -> Result<BackendStatus> {
        // 'wg show' output is relatively standard across platforms
        let output = Command::new("wg")
            .args(["show", WG_IFACE, "dump"])
            .output()?;
        if !output.status.success() {
            return Err(anyhow!("wg show dump failed"));
        }
        let text = String::from_utf8_lossy(&output.stdout);
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
    fn protocol(&self) -> VpnProtocol {
        VpnProtocol::WireGuard
    }

    fn start(&self) -> Result<()> {
        self.ensure_keys_and_config()?;
        let nm = get_network_manager();
        // Ensure configuration is applied and interface is up
        nm.configure_wireguard(WG_IFACE, "10.8.0.1/24", self.listen_port, &self.conf_path())?;
        nm.bring_up_interface(WG_IFACE)?;
        Ok(())
    }

    fn stop(&self) -> Result<()> {
        let nm = get_network_manager();
        nm.teardown_interface(WG_IFACE)
    }

    fn status(&self) -> Result<BackendStatus> {
        Self::parse_status().or_else(|e| {
            warn!(error=?e, "wg_status_failed");
            Ok(BackendStatus {
                protocol: "wireguard".into(),
                running: false,
                active_sessions: 0,
                egress_bytes: 0,
                ingress_bytes: 0,
            })
        })
    }

    fn public_key(&self) -> Option<String> {
        let key_path = self.key_path();
        if !Path::new(&key_path).exists() {
            return None;
        }
        let privkey = match fs::read_to_string(&key_path) {
            Ok(k) => k.trim().to_string(),
            Err(_) => return None,
        };

        let mut child = Command::new("wg")
            .arg("pubkey")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .ok()?;

        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            let _ = stdin.write_all(privkey.as_bytes());
        }

        let output = child.wait_with_output().ok()?;
        if output.status.success() {
            return Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }
        None
    }

    fn apply_peers(&self, peers: &[PeerSpec]) -> Result<()> {
        let privkey = fs::read_to_string(self.key_path())?.trim().to_string();

        let mut conf =
            format!("[Interface]\nPrivateKey = {privkey}\nListenPort = {port}\n", port = self.listen_port);

        for peer in peers {
            if let Some(pk) = &peer.public_key {
                conf.push_str(&format!("\n[Peer]\nPublicKey = {}\n", pk));
                if let Some(psk) = &peer.preshared_key {
                    conf.push_str(&format!("PresharedKey = {}\n", psk));
                }
                if !peer.allowed_ips.is_empty() {
                    conf.push_str(&format!("AllowedIPs = {}\n", peer.allowed_ips.join(",")));
                }
                if let Some(ep) = &peer.endpoint {
                    conf.push_str(&format!("Endpoint = {}\n", ep));
                }
            }
        }

        let conf_path = self.conf_path();
        let tmp_conf = format!("{}.new", conf_path);
        fs::write(&tmp_conf, conf)?;

        let nm = get_network_manager();

        if cfg!(target_os = "windows") {
            // Windows: replace conf and restart service (heavy)
            fs::rename(&tmp_conf, &conf_path)?;
            nm.configure_wireguard(WG_IFACE, "10.8.0.1/24", self.listen_port, &conf_path)?;
        } else {
            // Linux/Mac: try syncconf
            let status = Command::new("wg")
                .args(["syncconf", WG_IFACE, &tmp_conf])
                .status();
            match status {
                Ok(s) if s.success() => {
                    fs::rename(&tmp_conf, &conf_path)?;
                }
                _ => {
                    // Fallback
                    warn!("wg syncconf failed, falling back to full reconfigure");
                    fs::rename(&tmp_conf, &conf_path)?;
                    nm.configure_wireguard(WG_IFACE, "10.8.0.1/24", self.listen_port, &conf_path)?;
                }
            }
        }

        Ok(())
    }
}
