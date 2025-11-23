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
    public_key: String,
    listen_port: u16,
    // We might send IP if we know it, or let CP infer it.
    // For now, let's assume we just send key/port.
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
        let req = RegisterRequest {
            public_key: public_key.to_string(),
            listen_port,
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
