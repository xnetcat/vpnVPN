use super::{BackendStatus, VpnBackend, VpnProtocol};
use crate::pki::{PKI_DIR, CA_PEM, SERVER_PEM, SERVER_KEY, TLS_CRYPT_KEY};
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

        // Use shared PKI certificates instead of self-generating
        let pki_ca = Path::new(PKI_DIR).join(CA_PEM);
        let pki_cert = Path::new(PKI_DIR).join(SERVER_PEM);
        let pki_key = Path::new(PKI_DIR).join(SERVER_KEY);

        let ovpn_ca = format!("{}/ca.pem", OVPN_DIR);
        let ovpn_cert = format!("{}/server.pem", OVPN_DIR);
        let ovpn_key = format!("{}/server.key", OVPN_DIR);

        if pki_ca.exists() {
            fs::copy(&pki_ca, &ovpn_ca).context("copy CA cert to openvpn dir")?;
        }
        if pki_cert.exists() {
            fs::copy(&pki_cert, &ovpn_cert).context("copy server cert to openvpn dir")?;
        }
        if pki_key.exists() {
            fs::copy(&pki_key, &ovpn_key).context("copy server key to openvpn dir")?;
        }

        // Set up tls-crypt if key exists
        let tls_crypt_src = Path::new(PKI_DIR).join(TLS_CRYPT_KEY);
        let tls_crypt_line = if tls_crypt_src.exists() {
            let dest = format!("{}/tls-crypt.key", OVPN_DIR);
            fs::copy(&tls_crypt_src, &dest).context("copy tls-crypt key")?;
            format!("tls-crypt {}\n", dest)
        } else {
            String::new()
        };

        let conf = format!(
            "port {port}\nproto udp\ndev tun1\nuser nobody\ngroup nogroup\n\
            persist-key\npersist-tun\n\
            topology subnet\nserver 10.9.0.0 255.255.255.0\n\
            keepalive 10 60\n\
            dh none\n\
            tls-server\nca {ov}/ca.pem\ncert {ov}/server.pem\nkey {ov}/server.key\n\
            {tls_crypt}\
            verify-client-cert none\n\
            username-as-common-name\n\
            script-security 2\n\
            auth-user-pass-verify {auth_script} via-env\n\
            status {status_path} 5\nstatus-version 3\n\
            management 127.0.0.1 {mgmt}\nverb 3\n",
            port = self.listen_port,
            ov = OVPN_DIR,
            tls_crypt = tls_crypt_line,
            auth_script = OVPN_AUTH_SCRIPT,
            status_path = OVPN_STATUS,
            mgmt = OVPN_MGMT_PORT,
        );
        fs::write(OVPN_CONF, conf).context("write openvpn server.conf")?;

        Ok(())
    }

    fn ensure_auth_script(&self) -> Result<()> {
        // Use SHA-256 hashed credential verification instead of plaintext
        let script = r#"#!/bin/sh
[ ! -f /etc/openvpn/secrets.txt ] && exit 1
HASH=$(printf '%s' "$password" | sha256sum | cut -d' ' -f1)
grep -F -x "$username $HASH" /etc/openvpn/secrets.txt >/dev/null
exit $?
"#;
        fs::write(OVPN_AUTH_SCRIPT, script).context("write verify.sh")?;

        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(OVPN_AUTH_SCRIPT)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(OVPN_AUTH_SCRIPT, perms)?;

        if !Path::new(OVPN_SECRETS).exists() {
            fs::write(OVPN_SECRETS, "").context("create empty secrets.txt")?;
        }

        Ok(())
    }

    fn hash_password(password: &str) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn parse_status() -> BackendStatus {
        let mut active = 0usize;
        let mut rx_total: u64 = 0;
        let mut tx_total: u64 = 0;
        if let Ok(text) = fs::read_to_string(OVPN_STATUS) {
            for line in text.lines() {
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
                let hashed = Self::hash_password(pw);
                content.push_str(&format!("{} {}\n", u, hashed));
            }
        }

        fs::write(OVPN_SECRETS, content).context("write secrets.txt")?;
        info!(peer_count = peers.len(), "updated_openvpn_secrets");
        Ok(())
    }
}
