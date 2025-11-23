#[cfg(test)]
mod tests {
    use crate::vpn::{BackendStatus, PeerSpec, VpnProtocol};

    #[test]
    fn test_vpn_protocol_as_str() {
        assert_eq!(VpnProtocol::WireGuard.as_str(), "wireguard");
        assert_eq!(VpnProtocol::OpenVpn.as_str(), "openvpn");
        assert_eq!(VpnProtocol::IkeV2.as_str(), "ikev2");
    }

    #[test]
    fn test_backend_status_default() {
        let status = BackendStatus::default();
        assert_eq!(status.active_sessions, 0);
        assert_eq!(status.egress_bytes, 0);
        assert_eq!(status.ingress_bytes, 0);
        assert!(!status.running);
    }

    #[test]
    fn test_peer_spec_serialization() {
        let peer = PeerSpec {
            public_key: Some("test-key".to_string()),
            preshared_key: None,
            allowed_ips: vec!["10.8.0.10/32".to_string()],
            endpoint: Some("1.2.3.4:51820".to_string()),
        };

        let json = serde_json::to_string(&peer).unwrap();
        assert!(json.contains("test-key"));
        assert!(json.contains("10.8.0.10/32"));
    }

    #[test]
    fn test_peer_spec_deserialization() {
        let json = r#"{
            "public_key": "test-key",
            "preshared_key": null,
            "allowed_ips": ["10.8.0.10/32"],
            "endpoint": "1.2.3.4:51820"
        }"#;

        let peer: PeerSpec = serde_json::from_str(json).unwrap();
        assert_eq!(peer.public_key, Some("test-key".to_string()));
        assert_eq!(peer.allowed_ips.len(), 1);
        assert_eq!(peer.allowed_ips[0], "10.8.0.10/32");
    }
}
