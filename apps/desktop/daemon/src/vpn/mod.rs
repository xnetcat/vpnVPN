//! VPN backend implementations.

pub mod ikev2;
pub mod openvpn;
pub mod wireguard;

use anyhow::Result;
use vpnvpn_shared::protocol::{ConnectionStatus, VpnConfig};

/// Trait for VPN backends.
pub trait VpnBackend: Send + Sync {
    /// Connect to VPN server.
    fn connect(
        &self,
        config: &VpnConfig,
    ) -> impl std::future::Future<Output = Result<ConnectionStatus>> + Send;

    /// Disconnect from VPN server.
    fn disconnect(&self) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Get current connection status.
    fn status(&self) -> impl std::future::Future<Output = Result<ConnectionStatus>> + Send;
}
