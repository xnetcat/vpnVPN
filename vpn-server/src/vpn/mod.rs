use anyhow::Result;
use once_cell::sync::OnceCell;
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::RwLock;

pub mod wireguard;
pub mod openvpn;
pub mod ipsec;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum VpnProtocol {
    WireGuard,
    OpenVpn,
    IkeV2,
}

impl VpnProtocol {
    pub fn as_str(&self) -> &'static str {
        match self {
            VpnProtocol::WireGuard => "wireguard",
            VpnProtocol::OpenVpn => "openvpn",
            VpnProtocol::IkeV2 => "ikev2",
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct BackendStatus {
    pub protocol: String,
    pub active_sessions: usize,
    pub egress_bytes: u64,
    pub ingress_bytes: u64,
    pub running: bool,
}

pub trait VpnBackend: Send + Sync {
    fn protocol(&self) -> VpnProtocol;
    fn start(&self) -> Result<()>;
    fn stop(&self) -> Result<()>;
    fn status(&self) -> Result<BackendStatus>;
    fn apply_peers(&self, _peers: &[PeerSpec]) -> Result<()> {
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PeerSpec {
    pub public_key: Option<String>,
    pub preshared_key: Option<String>,
    pub allowed_ips: Vec<String>,
    pub endpoint: Option<String>,
}

pub struct VpnNode {
    backends: Vec<Arc<dyn VpnBackend>>, // wireguard/openvpn/ipsec
    last_egress_by_proto: Arc<RwLock<std::collections::HashMap<String, u64>>>,
}

impl VpnNode {
    pub fn new(enabled: &[VpnProtocol]) -> Result<Self> {
        let mut backends: Vec<Arc<dyn VpnBackend>> = Vec::new();
        for proto in enabled {
            match proto {
                VpnProtocol::WireGuard => {
                    backends.push(Arc::new(wireguard::WireGuardBackend::new()?));
                }
                VpnProtocol::OpenVpn => {
                    backends.push(Arc::new(openvpn::OpenVpnBackend::new()?));
                }
                VpnProtocol::IkeV2 => {
                    backends.push(Arc::new(ipsec::IpsecBackend::new()?));
                }
            }
        }
        Ok(Self {
            backends,
            last_egress_by_proto: Arc::new(RwLock::new(Default::default())),
        })
    }

    pub fn start_all(&self) {
        for b in &self.backends {
            let _ = b.start();
        }
    }

    pub fn stop_all(&self) {
        for b in &self.backends {
            let _ = b.stop();
        }
    }

    pub fn collect_status(&self) -> Vec<BackendStatus> {
        self.backends
            .iter()
            .filter_map(|b| b.status().ok())
            .collect()
    }
}

pub static VPN_NODE: OnceCell<Arc<VpnNode>> = OnceCell::new();


