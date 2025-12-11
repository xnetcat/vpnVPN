use super::{BackendStatus, VpnBackend, VpnProtocol};
use anyhow::Result;
use std::process::Command;
use tracing::info;

pub struct IpsecBackend;

impl IpsecBackend {
    pub fn new() -> Result<Self> {
        Ok(Self)
    }

    fn parse_status() -> BackendStatus {
        let mut active = 0usize;
        if let Ok(output) = Command::new("swanctl").arg("-l").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    if line.contains("ESTABLISHED") || line.contains("INSTALLED") {
                        active += 1;
                    }
                }
            }
        }
        BackendStatus {
            protocol: "ikev2".into(),
            active_sessions: active,
            egress_bytes: 0,
            ingress_bytes: 0,
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
}
