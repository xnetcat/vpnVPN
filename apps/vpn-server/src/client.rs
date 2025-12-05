use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

use crate::vpn::PeerSpec;

pub struct ControlPlaneClient {
    client: Client,
    pub(crate) base_url: String,
    pub(crate) auth_token: String,
    pub(crate) server_id: String,
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
    pub fn new(base_url: String, auth_token: String, server_id: String) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            auth_token,
            server_id,
        }
    }

    pub async fn register(&self, public_key: &str, listen_port: u16) -> Result<()> {
        let url = format!("{}/server/register", self.base_url);

        // Optional metadata: region / country from env if available.
        let mut meta = serde_json::Map::new();
        if let Ok(region) = std::env::var("VPN_REGION") {
            meta.insert("region".to_string(), serde_json::Value::String(region));
        }
        if let Ok(country) = std::env::var("VPN_COUNTRY") {
            meta.insert("country".to_string(), serde_json::Value::String(country));
        }

        let req = RegisterRequest {
            id: self.server_id.clone(),
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
        let url = format!("{}/server/peers?id={}", self.base_url, self.server_id);
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

    /// Send heartbeat to control plane to stay marked as online
    /// This re-uses the /server/register endpoint which updates lastSeen
    pub async fn heartbeat(&self, public_key: &str, listen_port: u16, public_ip: Option<String>) -> Result<()> {
        let url = format!("{}/server/register", self.base_url);

        let mut meta = serde_json::Map::new();
        if let Ok(region) = std::env::var("VPN_REGION") {
            meta.insert("region".to_string(), serde_json::Value::String(region));
        }
        if let Ok(country) = std::env::var("VPN_COUNTRY") {
            meta.insert("country".to_string(), serde_json::Value::String(country));
        }
        if let Some(ip) = public_ip {
            meta.insert("publicIp".to_string(), serde_json::Value::String(ip));
        }

        let req = RegisterRequest {
            id: self.server_id.clone(),
            public_key: public_key.to_string(),
            listen_port,
            metadata: if meta.is_empty() {
                None
            } else {
                Some(serde_json::Value::Object(meta))
            },
        };

        debug!(%url, "sending_heartbeat");

        let resp = self
            .client
            .post(&url)
            .bearer_auth(&self.auth_token)
            .json(&req)
            .send()
            .await
            .context("failed to send heartbeat request")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("heartbeat request failed: {} - {}", status, text);
        }

        debug!("heartbeat_sent_successfully");
        Ok(())
    }

    /// Detect public IP address by querying external service
    pub async fn detect_public_ip(&self) -> Option<String> {
        // Try multiple services for reliability
        let services = vec![
            "https://api.ipify.org",
            "https://ifconfig.me/ip",
            "https://icanhazip.com",
        ];

        for service in services {
            if let Ok(resp) = self.client.get(service).send().await {
                if let Ok(ip) = resp.text().await {
                    let ip = ip.trim();
                    if !ip.is_empty() && ip.len() < 50 {
                        debug!(ip, "detected_public_ip");
                        return Some(ip.to_string());
                    }
                }
            }
        }

        None
    }

    /// Detect geolocation (country, region) from public IP
    pub async fn detect_geolocation(&self, ip: &str) -> Option<(String, String)> {
        #[derive(serde::Deserialize)]
        #[allow(dead_code)]
        struct GeoResponse {
            status: String,
            #[serde(rename = "countryCode")]
            country_code: Option<String>,
            #[serde(rename = "regionName")]
            region_name: Option<String>,
            city: Option<String>,
        }

        // Use ip-api.com (free, no rate limits for reasonable usage)
        let url = format!("http://ip-api.com/json/{}?fields=status,countryCode,regionName,city", ip);
        
        let timeout_duration = std::time::Duration::from_secs(5);
        let result = tokio::time::timeout(timeout_duration, async {
            self.client.get(&url).send().await
        }).await;

        match result {
            Ok(Ok(resp)) => {
                if let Ok(geo) = resp.json::<GeoResponse>().await {
                    if geo.status == "success" {
                        if let (Some(country), Some(region)) = (geo.country_code, geo.region_name) {
                            debug!(
                                country = country.as_str(),
                                region = region.as_str(),
                                "detected_geolocation"
                            );
                            return Some((country, region));
                        }
                    }
                }
            }
            Ok(Err(e)) => {
                debug!(error = ?e, "geolocation_api_request_failed");
            }
            Err(_) => {
                debug!("geolocation_api_timeout");
            }
        }

        None
    }
}

#[cfg(test)]
mod tests;
