use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

use crate::vpn::PeerSpec;

pub struct ControlPlaneClient {
    client: Client,
    base_url: String,
    auth_token: String,
}

#[derive(Debug, Serialize)]
struct RegisterRequest {
    id: String,
    #[serde(rename = "publicKey")]
    public_key: String,
    #[serde(rename = "listenPort")]
    listen_port: u16,
    // Optional metadata about the node (region/country, etc.)
    metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct PeersResponse {
    peers: Vec<PeerSpec>,
}

impl ControlPlaneClient {
    pub fn new(base_url: String, auth_token: String) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            auth_token,
        }
    }

    pub async fn register(&self, public_key: &str, listen_port: u16) -> Result<()> {
        let url = format!("{}/server/register", self.base_url);

        // Prefer explicit SERVER_ID, fall back to container/host name, then a static default.
        let id = std::env::var("SERVER_ID")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "vpn-node".to_string());

        // Optional metadata: region / country from env if available.
        let mut meta = serde_json::Map::new();
        if let Ok(region) = std::env::var("VPN_REGION") {
            meta.insert("region".to_string(), serde_json::Value::String(region));
        }
        if let Ok(country) = std::env::var("VPN_COUNTRY") {
            meta.insert("country".to_string(), serde_json::Value::String(country));
        }

        let req = RegisterRequest {
            id,
            public_key: public_key.to_string(),
            listen_port,
            metadata: if meta.is_empty() {
                None
            } else {
                Some(serde_json::Value::Object(meta))
            },
        };

        info!(%url, ?req, "registering_with_control_plane");

        let resp = self
            .client
            .post(&url)
            .bearer_auth(&self.auth_token)
            .json(&req)
            .send()
            .await
            .context("failed to send register request")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("register request failed: {} - {}", status, text);
        }

        info!("successfully_registered");
        Ok(())
    }

    pub async fn fetch_peers(&self) -> Result<Vec<PeerSpec>> {
        let url = format!("{}/server/peers", self.base_url);
        debug!(%url, "fetching_peers");

        let resp = self
            .client
            .get(&url)
            .bearer_auth(&self.auth_token)
            .send()
            .await
            .context("failed to send fetch peers request")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("fetch peers request failed: {} - {}", status, text);
        }

        let payload: PeersResponse = resp
            .json()
            .await
            .context("failed to parse peers response")?;
        Ok(payload.peers)
    }
}

#[cfg(test)]
mod tests;
