use super::{BackendStatus, VpnBackend, VpnProtocol};
use anyhow::{anyhow, Context, Result};
use std::fs;
use std::path::Path;
use std::process::Command;
use tracing::info;

const SWANCTL_DIR: &str = "/etc/swanctl";
const SWANCTL_CONF: &str = "/etc/swanctl/swanctl.conf";
const SWANCTL_SECRETS: &str = "/etc/swanctl/psks.secrets";

pub struct IpsecBackend {
    _ike_port_main: u16,
    _ike_port_nat: u16,
}

impl IpsecBackend {
    pub fn new() -> Result<Self> {
        Ok(Self {
            _ike_port_main: 500,
            _ike_port_nat: 4500,
        })
    }

    fn ensure_config(&self) -> Result<()> {
        fs::create_dir_all(SWANCTL_DIR).context("create /etc/swanctl")?;
        if !Path::new(SWANCTL_CONF).exists() {
            let conf = r#"connections {
  ikev2-psk {
    version = 2
    local_addrs = 0.0.0.0
    proposals = aes256-sha256-modp2048
    # Enable NAT-T
    encap = yes
    # Allow any remote for demo purposes
    send_cert = never
    rekey_time = 20m
    children {
      net {
        local_ts = 0.0.0.0/0
        esp_proposals = aes256-sha256
        start_action = trap
        close_action = none
      }
    }
  }
}
"#;
            fs::write(SWANCTL_CONF, conf).context("write swanctl.conf")?;
        }
        if !Path::new(SWANCTL_SECRETS).exists() {
            let psk = std::env::var("IPSEC_PSK").unwrap_or_else(|_| "vpnvpnpsk".into());
            let secrets = format!(
                r#"secrets {{
  ike-psk {{
    id = 0.0.0.0
    secret = "{psk}"
  }}
}}
"#
            );
            fs::write(SWANCTL_SECRETS, secrets).context("write psks.secrets")?;
        }
        Ok(())
    }

    fn run_cmd(cmd: &str, args: &[&str]) -> Result<()> {
        let status = Command::new(cmd).args(args).status()?;
        if !status.success() {
            return Err(anyhow!("command failed: {cmd} {}", args.join(" ")));
        }
        Ok(())
    }

    fn parse_status() -> BackendStatus {
        let mut active = 0usize;
        // We only report active counts due to limited bytes visibility here
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
        self.ensure_config()?;
        // Start strongSwan
        let _ = Self::run_cmd("ipsec", &["start"]);
        // load config
        let _ = Self::run_cmd("swanctl", &["--load-all"]);
        info!("ipsec_started");
        Ok(())
    }

    fn stop(&self) -> Result<()> {
        let _ = Self::run_cmd("ipsec", &["stop"]);
        Ok(())
    }

    fn status(&self) -> Result<BackendStatus> {
        Ok(Self::parse_status())
    }
}
