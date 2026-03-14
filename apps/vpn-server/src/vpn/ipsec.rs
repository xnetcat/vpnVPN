use super::{BackendStatus, PeerSpec, VpnBackend, VpnProtocol};
use anyhow::{Context, Result};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::process::Command;
use tracing::{info, warn};

const IPSEC_SECRETS: &str = "/etc/ipsec.secrets";

pub struct IpsecBackend;

impl IpsecBackend {
    pub fn new() -> Result<Self> {
        Ok(Self)
    }

    fn parse_status() -> BackendStatus {
        let mut active = 0usize;
        let mut rx_total: u64 = 0;
        let mut tx_total: u64 = 0;
        if let Ok(output) = Command::new("swanctl").arg("-l").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    if line.contains("ESTABLISHED") {
                        active += 1;
                    }
                    // Parse byte counts from lines like:
                    //   ... bytes_i (12345 ...) bytes_o (67890 ...) ...
                    let trimmed = line.trim();
                    if let Some(pos) = trimmed.find("bytes_i") {
                        let after = &trimmed[pos..];
                        if let Some(start) = after.find('(') {
                            let num_start = start + 1;
                            let rest = &after[num_start..];
                            let num_str: String =
                                rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                            if let Ok(val) = num_str.parse::<u64>() {
                                rx_total = rx_total.saturating_add(val);
                            }
                        }
                    }
                    if let Some(pos) = trimmed.find("bytes_o") {
                        let after = &trimmed[pos..];
                        if let Some(start) = after.find('(') {
                            let num_start = start + 1;
                            let rest = &after[num_start..];
                            let num_str: String =
                                rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                            if let Ok(val) = num_str.parse::<u64>() {
                                tx_total = tx_total.saturating_add(val);
                            }
                        }
                    }
                }
            }
        }
        BackendStatus {
            protocol: "ikev2".into(),
            active_sessions: active,
            egress_bytes: tx_total,
            ingress_bytes: rx_total,
            running: true,
        }
    }
}

impl VpnBackend for IpsecBackend {
    fn protocol(&self) -> VpnProtocol {
        VpnProtocol::IkeV2
    }

    fn start(&self) -> Result<()> {
        // IKEv2 is started in main via setup_ikev2; nothing to do here.
        info!("ipsec backend start (no-op; managed by setup_ikev2)");
        Ok(())
    }

    fn stop(&self) -> Result<()> {
        let _ = Command::new("ipsec").arg("stop").output();
        Ok(())
    }

    fn status(&self) -> Result<BackendStatus> {
        Ok(Self::parse_status())
    }

    fn apply_peers(&self, peers: &[PeerSpec]) -> Result<()> {
        // Preserve existing RSA key line from ipsec.secrets
        let existing = fs::read_to_string(IPSEC_SECRETS).unwrap_or_default();
        // Preserve existing private key line (RSA or ECDSA)
        let key_line = existing
            .lines()
            .find(|l| l.contains(": RSA") || l.contains(": ECDSA"))
            .unwrap_or("")
            .to_string();

        let mut secrets = String::new();
        if !key_line.is_empty() {
            secrets.push_str(&key_line);
            secrets.push('\n');
        }

        for p in peers {
            if let (Some(u), Some(pw)) = (&p.username, &p.password) {
                // Validate username/password don't contain config-breaking characters
                if u.contains('\n') || u.contains(':') || u.contains('"') {
                    warn!(username = u.as_str(), "skipping_peer_with_invalid_username_chars");
                    continue;
                }
                if pw.contains('\n') || pw.contains('"') {
                    warn!("skipping_peer_with_invalid_password_chars");
                    continue;
                }
                // EAP credentials for EAP-MSCHAPv2
                secrets.push_str(&format!("{u} : EAP \"{pw}\"\n"));
            }
        }

        fs::write(IPSEC_SECRETS, &secrets).context("write ipsec.secrets")?;

        // Restrict file permissions on secrets file
        let mut perms = fs::metadata(IPSEC_SECRETS)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(IPSEC_SECRETS, perms)?;

        // Reload strongSwan to pick up new credentials
        let _ = Command::new("swanctl").arg("--load-all").output();

        info!(peer_count = peers.len(), "updated_ipsec_peers");
        Ok(())
    }
}
