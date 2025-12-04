use anyhow::Result;
use once_cell::sync::OnceCell;
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

pub mod ipsec;
pub mod openvpn;
pub mod wireguard;

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
    fn public_key(&self) -> Option<String> {
        None
    }
}

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
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
    pub fn new(enabled: &[VpnProtocol], listen_port: u16) -> Result<Self> {
        info!(
            protocols = ?enabled.iter().map(|p| p.as_str()).collect::<Vec<_>>(),
            listen_port = listen_port,
            "vpn_node_initializing"
        );

        let mut backends: Vec<Arc<dyn VpnBackend>> = Vec::new();
        for proto in enabled {
            match proto {
                VpnProtocol::WireGuard => {
                    info!(
                        protocol = "wireguard",
                        port = listen_port,
                        "creating_wireguard_backend"
                    );
                    match wireguard::WireGuardBackend::new(listen_port) {
                        Ok(backend) => {
                            info!(
                                protocol = "wireguard",
                                "wireguard_backend_created_successfully"
                            );
                            backends.push(Arc::new(backend));
                        }
                        Err(e) => {
                            error!(protocol = "wireguard", error = ?e, "failed_to_create_wireguard_backend");
                            return Err(e);
                        }
                    }
                }
                VpnProtocol::OpenVpn => {
                    info!(protocol = "openvpn", "creating_openvpn_backend");
                    match openvpn::OpenVpnBackend::new() {
                        Ok(backend) => {
                            info!(protocol = "openvpn", "openvpn_backend_created_successfully");
                            backends.push(Arc::new(backend));
                        }
                        Err(e) => {
                            error!(protocol = "openvpn", error = ?e, "failed_to_create_openvpn_backend");
                            return Err(e);
                        }
                    }
                }
                VpnProtocol::IkeV2 => {
                    info!(protocol = "ikev2", "creating_ipsec_backend");
                    match ipsec::IpsecBackend::new() {
                        Ok(backend) => {
                            info!(protocol = "ikev2", "ipsec_backend_created_successfully");
                            backends.push(Arc::new(backend));
                        }
                        Err(e) => {
                            error!(protocol = "ikev2", error = ?e, "failed_to_create_ipsec_backend");
                            return Err(e);
                        }
                    }
                }
            }
        }

        info!(backend_count = backends.len(), "vpn_node_initialized");

        Ok(Self {
            backends,
            last_egress_by_proto: Arc::new(RwLock::new(Default::default())),
        })
    }

    pub fn start_all(&self) {
        info!(
            backend_count = self.backends.len(),
            "starting_all_vpn_backends"
        );
        for b in &self.backends {
            let protocol = b.protocol().as_str();
            info!(protocol = protocol, "starting_backend");
            match b.start() {
                Ok(_) => info!(protocol = protocol, "backend_started_successfully"),
                Err(e) => error!(protocol = protocol, error = ?e, "backend_start_failed"),
            }
        }
        info!("all_backends_start_attempted");
    }

    pub fn stop_all(&self) {
        info!(
            backend_count = self.backends.len(),
            "stopping_all_vpn_backends"
        );
        for b in &self.backends {
            let protocol = b.protocol().as_str();
            info!(protocol = protocol, "stopping_backend");
            match b.stop() {
                Ok(_) => info!(protocol = protocol, "backend_stopped_successfully"),
                Err(e) => error!(protocol = protocol, error = ?e, "backend_stop_failed"),
            }
        }
        info!("all_backends_stopped");
    }

    pub fn collect_status(&self) -> Vec<BackendStatus> {
        debug!(
            backend_count = self.backends.len(),
            "collecting_backend_status"
        );
        let statuses: Vec<BackendStatus> = self.backends
            .iter()
            .filter_map(|b| {
                match b.status() {
                    Ok(status) => {
                        debug!(
                            protocol = status.protocol.as_str(),
                            running = status.running,
                            active_sessions = status.active_sessions,
                            egress_bytes = status.egress_bytes,
                            ingress_bytes = status.ingress_bytes,
                            "backend_status"
                        );
                        Some(status)
                    }
                    Err(e) => {
                        warn!(protocol = b.protocol().as_str(), error = ?e, "failed_to_get_backend_status");
                        None
                    }
                }
            })
            .collect();
        debug!(status_count = statuses.len(), "status_collection_complete");
        statuses
    }

    pub fn apply_peers(&self, peers: &[PeerSpec]) -> Result<()> {
        info!(peer_count = peers.len(), "applying_peers_to_all_backends");
        for peer in peers {
            debug!(
                public_key = peer.public_key.as_deref().map(|k| &k[..8.min(k.len())]),
                allowed_ips = ?peer.allowed_ips,
                endpoint = peer.endpoint.as_deref(),
                "peer_spec"
            );
        }

        for b in &self.backends {
            let protocol = b.protocol().as_str();
            debug!(
                protocol = protocol,
                peer_count = peers.len(),
                "applying_peers_to_backend"
            );
            match b.apply_peers(peers) {
                Ok(_) => info!(protocol = protocol, "peers_applied_successfully"),
                Err(e) => {
                    error!(protocol = protocol, error = ?e, "failed_to_apply_peers");
                    return Err(e);
                }
            }
        }
        info!(peer_count = peers.len(), "all_peers_applied");
        Ok(())
    }

    pub fn get_public_key(&self) -> Option<String> {
        for b in &self.backends {
            if b.protocol() == VpnProtocol::WireGuard {
                let pk = b.public_key();
                if pk.is_some() {
                    debug!(protocol = "wireguard", "public_key_retrieved");
                }
                return pk;
            }
        }
        warn!("no_wireguard_backend_found_for_public_key");
        None
    }
}

pub static VPN_NODE: OnceCell<Arc<VpnNode>> = OnceCell::new();

#[cfg(test)]
mod tests;
