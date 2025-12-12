use super::{BackendStatus, VpnBackend, VpnProtocol};
use anyhow::{anyhow, Context, Result};
use std::fs;
use std::path::Path;
use std::process::Command;
use tracing::info;

const OVPN_DIR: &str = "/etc/openvpn";
const OVPN_CONF: &str = "/etc/openvpn/server.conf";
const OVPN_STATUS: &str = "/var/run/openvpn-status.log";
const OVPN_AUTH_SCRIPT: &str = "/etc/openvpn/verify.sh";
const OVPN_SECRETS: &str = "/etc/openvpn/secrets.txt";
const OVPN_MGMT_PORT: u16 = 7505;

pub struct OpenVpnBackend {
    listen_port: u16,
}

impl OpenVpnBackend {
    pub fn new() -> Result<Self> {
        let listen_port: u16 = std::env::var("OPENVPN_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(1194);
        Ok(Self { listen_port })
    }

    fn ensure_certs_and_conf(&self) -> Result<()> {
        fs::create_dir_all(OVPN_DIR).context("create /etc/openvpn")?;
        let key_path = format!("{}/server.key", OVPN_DIR);
        let crt_path = format!("{}/server.crt", OVPN_DIR);
        if !Path::new(&key_path).exists() || !Path::new(&crt_path).exists() {
            // Self-signed for development
            let subj = "/CN=vpnvpn-openvpn";
            let status = Command::new("openssl")
                .args([
                    "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "3650", "-nodes",
                    "-keyout", &key_path, "-out", &crt_path, "-subj", subj,
                ])
                .status()?;
            if !status.success() {
                return Err(anyhow!("openssl self-signed cert failed"));
            }
        }

            if !status.success() {
                return Err(anyhow!("openssl self-signed cert failed"));
            }
        }

        // Always overwrite config to ensure updates to auth script path
        let conf = format!(
            "port {port}\nproto udp\ndev tun1\nuser root\ngroup root\n\
persist-key\npersist-tun\n\
topology subnet\nserver 10.9.0.0 255.255.255.0\n\
keepalive 10 60\n\
dh none\n\
tls-server\nca {ov}/server.crt\ncert {ov}/server.crt\nkey {ov}/server.key\n\
verify-client-cert none\n\
username-as-common-name\n\
script-security 2\n\
auth-user-pass-verify {auth_script} via-env\n\
status {status_path} 5\nstatus-version 3\n\
management 127.0.0.1 {mgmt}\nverb 3\n",
            port = self.listen_port,
            ov = OVPN_DIR,
            auth_script = OVPN_AUTH_SCRIPT,
            status_path = OVPN_STATUS,
            mgmt = OVPN_MGMT_PORT,
        );
        fs::write(OVPN_CONF, conf).context("write openvpn server.conf")?;
        
        Ok(())
    }

    fn ensure_auth_script(&self) -> Result<()> {
        let script = r#"#!/bin/sh
[ ! -f /etc/openvpn/secrets.txt ] && exit 1
# Expect alphanumeric username/password (safe for grep)
grep -F -x "$username $password" /etc/openvpn/secrets.txt >/dev/null
exit $?
"#;
        fs::write(OVPN_AUTH_SCRIPT, script).context("write verify.sh")?;
        
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(OVPN_AUTH_SCRIPT)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(OVPN_AUTH_SCRIPT, perms)?;
        
        // Ensure secrets file exists (empty initially)
        if !Path::new(OVPN_SECRETS).exists() {
            fs::write(OVPN_SECRETS, "").context("create empty secrets.txt")?;
        }
        
        Ok(())
    }

    fn parse_status() -> BackendStatus {
        let mut active = 0usize;
        let mut rx_total: u64 = 0;
        let mut tx_total: u64 = 0;
        if let Ok(text) = fs::read_to_string(OVPN_STATUS) {
            for line in text.lines() {
                // CLIENT_LIST,CommonName,RealAddress,BytesReceived,BytesSent,ConnectedSince,ConnectedSinceTime,Username
                if line.starts_with("CLIENT_LIST,") {
                    let parts: Vec<&str> = line.split(',').collect();
                    if parts.len() >= 6 {
                        active += 1;
                        rx_total = rx_total.saturating_add(parts[3].parse::<u64>().unwrap_or(0));
                        tx_total = tx_total.saturating_add(parts[4].parse::<u64>().unwrap_or(0));
                    }
                }
            }
        }
        BackendStatus {
            protocol: "openvpn".into(),
            active_sessions: active,
            egress_bytes: tx_total,
            ingress_bytes: rx_total,
            running: true,
        }
    }
}

impl VpnBackend for OpenVpnBackend {
    fn protocol(&self) -> VpnProtocol {
        VpnProtocol::OpenVpn
    }

    fn start(&self) -> Result<()> {
        self.ensure_auth_script()?;
        self.ensure_certs_and_conf()?;
        // Run as daemonized process
        let status = Command::new("openvpn")
            .args(["--config", OVPN_CONF, "--daemon"])
            .status()?;
        if !status.success() {
            return Err(anyhow!("openvpn start failed"));
        }
        info!("openvpn_started");
        Ok(())
    }

    fn stop(&self) -> Result<()> {
        // Best effort: try management interface to signal exit
        // Fallback to killall openvpn
        let _ = Command::new("pkill").arg("openvpn").status();
        Ok(())
    }

    fn status(&self) -> Result<BackendStatus> {
        Ok(Self::parse_status())
    }

    fn apply_peers(&self, peers: &[super::PeerSpec]) -> Result<()> {
        let mut content = String::new();
        for p in peers {
            if let (Some(u), Some(pw)) = (&p.username, &p.password) {
                content.push_str(&format!("{} {}\n", u, pw));
            }
        }
        
        // Write atomically if possible, but straight write is fine for now
        fs::write(OVPN_SECRETS, content).context("write secrets.txt")?;
        info!(peer_count = peers.len(), "updated_openvpn_secrets");
        Ok(())
    }
}
