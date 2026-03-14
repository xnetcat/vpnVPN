use super::{BackendStatus, PeerSpec, VpnBackend, VpnProtocol};
use crate::net::os::get_network_manager;
use anyhow::{anyhow, Context, Result};
use std::fs;
use std::path::Path;
use std::process::Command;
use tracing::{debug, error, info, warn};

const WG_IFACE: &str = "wg0";
const WG_CONF: &str = "wg0.conf"; // Relative or absolute depends on OS config
const WG_KEY_PATH: &str = "server.key";

pub struct WireGuardBackend {
    listen_port: u16,
    config_dir: String,
}

impl WireGuardBackend {
    pub fn new(listen_port: u16) -> Result<Self> {
        info!(listen_port = listen_port, "wireguard_backend_initializing");
        let config_dir = if cfg!(target_os = "windows") {
            ".".to_string() // Current dir or specific AppData path
        } else {
            "/etc/wireguard".to_string()
        };
        info!(
            config_dir = config_dir.as_str(),
            "wireguard_config_directory"
        );
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
        debug!(
            config_dir = self.config_dir.as_str(),
            "ensuring_keys_and_config"
        );

        if !Path::new(&self.config_dir).exists() {
            info!(
                config_dir = self.config_dir.as_str(),
                "creating_config_directory"
            );
            fs::create_dir_all(&self.config_dir).context("create config dir")?;
        }

        let key_path = self.key_path();
        if !Path::new(&key_path).exists() {
            info!(
                key_path = key_path.as_str(),
                "generating_wireguard_private_key"
            );
            let output = Command::new("wg")
                .arg("genkey")
                .output()
                .context("wg genkey")?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                error!(stderr = stderr.as_ref(), "wg_genkey_failed");
                return Err(anyhow!("wg genkey failed: {}", stderr));
            }
            let key = String::from_utf8_lossy(&output.stdout).trim().to_string();
            fs::write(&key_path, format!("{}\n", key)).context("write wg private key")?;
            info!("wireguard_private_key_generated");
        } else {
            debug!(key_path = key_path.as_str(), "wireguard_key_exists");
        }

        let conf_path = self.conf_path();
        if !Path::new(&conf_path).exists() {
            info!(conf_path = conf_path.as_str(), "creating_wireguard_config");
            let privkey = fs::read_to_string(&key_path)
                .unwrap_or_default()
                .trim()
                .to_string();
            // Address is configured by the OS network manager; keep only keys/port in wg config.
            // Note: do not include wg-quick-only directives (like Address/SaveConfig) because we
            // manage the interface via `wg` and OS tooling.
            let conf = format!(
                "[Interface]\nPrivateKey = {privkey}\nListenPort = {port}\n",
                port = self.listen_port
            );
            fs::write(&conf_path, conf).context("write wg0.conf")?;
            info!("wireguard_config_created");
        } else {
            debug!(conf_path = conf_path.as_str(), "wireguard_config_exists");
        }
        Ok(())
    }

    fn parse_status() -> Result<BackendStatus> {
        debug!(interface = WG_IFACE, "parsing_wireguard_status");
        // 'wg show' output is relatively standard across platforms
        let output = Command::new("wg")
            .args(["show", WG_IFACE, "dump"])
            .output()?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            debug!(stderr = stderr.as_ref(), "wg_show_dump_failed");
            return Err(anyhow!("wg show dump failed: {}", stderr));
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
        debug!(
            active_sessions = active,
            rx_total = rx_total,
            tx_total = tx_total,
            "wireguard_status_parsed"
        );
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
        info!(
            interface = WG_IFACE,
            port = self.listen_port,
            "starting_wireguard_backend"
        );

        self.ensure_keys_and_config()?;

        let nm = get_network_manager();
        info!(
            interface = WG_IFACE,
            address = "10.8.0.1/24",
            "configuring_wireguard_interface"
        );

        // Ensure configuration is applied and interface is up
        nm.configure_wireguard(WG_IFACE, "10.8.0.1/24", self.listen_port, &self.conf_path())?;
        info!(interface = WG_IFACE, "wireguard_interface_configured");

        nm.bring_up_interface(WG_IFACE)?;
        info!(interface = WG_IFACE, "wireguard_interface_up");

        // Set MTU to 1420 for WireGuard overhead
        let _ = std::process::Command::new("ip")
            .args(["link", "set", "dev", WG_IFACE, "mtu", "1420"])
            .status();

        // Add IPv6 address alongside IPv4
        let _ = std::process::Command::new("ip")
            .args(["-6", "addr", "add", "fd42:42:42::1/64", "dev", WG_IFACE])
            .status();
        info!(interface = WG_IFACE, "wireguard_mtu_and_ipv6_configured");

        Ok(())
    }

    fn stop(&self) -> Result<()> {
        info!(interface = WG_IFACE, "stopping_wireguard_backend");
        let nm = get_network_manager();
        nm.teardown_interface(WG_IFACE)?;
        info!(interface = WG_IFACE, "wireguard_interface_down");
        Ok(())
    }

    fn status(&self) -> Result<BackendStatus> {
        Self::parse_status().or_else(|e| {
            debug!(error=?e, "wg_status_failed_returning_not_running");
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
            debug!(key_path = key_path.as_str(), "private_key_not_found");
            return None;
        }
        let privkey = match fs::read_to_string(&key_path) {
            Ok(k) => k.trim().to_string(),
            Err(e) => {
                warn!(error = ?e, "failed_to_read_private_key");
                return None;
            }
        };

        debug!("deriving_public_key_from_private_key");
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
            let pubkey = String::from_utf8_lossy(&output.stdout).trim().to_string();
            info!(public_key = pubkey.as_str(), "wireguard_public_key_derived");
            return Some(pubkey);
        }
        warn!("failed_to_derive_public_key");
        None
    }

    fn apply_peers(&self, peers: &[PeerSpec]) -> Result<()> {
        info!(peer_count = peers.len(), "applying_wireguard_peers");

        let privkey = fs::read_to_string(self.key_path())?.trim().to_string();

        let mut conf = format!(
            "[Interface]\nPrivateKey = {privkey}\nListenPort = {port}\n",
            port = self.listen_port
        );

        for (i, peer) in peers.iter().enumerate() {
            if let Some(pk) = &peer.public_key {
                debug!(
                    peer_index = i,
                    public_key_prefix = &pk[..8.min(pk.len())],
                    allowed_ips = ?peer.allowed_ips,
                    endpoint = peer.endpoint.as_deref(),
                    "adding_peer_to_config"
                );
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
                conf.push_str("PersistentKeepalive = 25\n");
            }
        }

        let conf_path = self.conf_path();
        let tmp_conf = format!("{}.new", conf_path);
        debug!(tmp_conf = tmp_conf.as_str(), "writing_temporary_config");
        fs::write(&tmp_conf, conf)?;

        let nm = get_network_manager();

        if cfg!(target_os = "windows") {
            // Windows: replace conf and restart service (heavy)
            info!("windows_mode_full_config_replace");
            fs::rename(&tmp_conf, &conf_path)?;
            nm.configure_wireguard(WG_IFACE, "10.8.0.1/24", self.listen_port, &conf_path)?;
        } else {
            // Linux/Mac: try syncconf
            debug!(interface = WG_IFACE, "attempting_wg_syncconf");
            let status = Command::new("wg")
                .args(["syncconf", WG_IFACE, &tmp_conf])
                .status();
            match status {
                Ok(s) if s.success() => {
                    info!("wg_syncconf_succeeded");
                    fs::rename(&tmp_conf, &conf_path)?;
                }
                Ok(s) => {
                    // Fallback
                    warn!(exit_code = ?s.code(), "wg_syncconf_failed_falling_back_to_full_reconfigure");
                    fs::rename(&tmp_conf, &conf_path)?;
                    nm.configure_wireguard(WG_IFACE, "10.8.0.1/24", self.listen_port, &conf_path)?;
                }
                Err(e) => {
                    error!(error = ?e, "wg_syncconf_error_falling_back_to_full_reconfigure");
                    fs::rename(&tmp_conf, &conf_path)?;
                    nm.configure_wireguard(WG_IFACE, "10.8.0.1/24", self.listen_port, &conf_path)?;
                }
            }
        }

        info!(peer_count = peers.len(), "wireguard_peers_applied");
        Ok(())
    }
}
