use std::time::Duration;

use config::ConfigError;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub admin: AdminConfig,
    pub telemetry: TelemetryConfig,
    pub scaling: ScalingConfig,
    pub storage: StorageConfig,
    pub security: SecurityConfig,
}

impl AppConfig {
    pub fn load() -> Result<Self, ConfigError> {
        let mut builder = config::Config::builder()
            .set_default("server.interface_name", "wg0")?
            .set_default("server.listen_port", 51820)?
            .set_default("server.ip_command", "/sbin/ip")?
            .set_default("server.wg_command", "/usr/bin/wg")?
            .set_default("server.allowed_ips", vec!["0.0.0.0/0", "::/0"])?
            .set_default("server.peer_config_base_path", "/var/lib/vpnvpn/peers")?
            .set_default("server.state_sync_interval_secs", 10)?
            .set_default("admin.bind_address", "0.0.0.0")?
            .set_default("admin.port", 8080)?
            .set_default("admin.jwt_issuer", "vpnvpn")?
            .set_default("admin.jwt_audience", "vpnvpn-admin")?
            .set_default("telemetry.enable_cloudwatch", true)?
            .set_default("telemetry.publish_interval_secs", 60)?
            .set_default("telemetry.metrics_namespace", "vpnVPN")?
            .set_default("scaling.enabled", true)?
            .set_default("scaling.auto_scaling_group", "")?
            .set_default("scaling.target_sessions_per_instance", 150)?
            .set_default("scaling.min_desired", 1)?
            .set_default("scaling.max_desired", 10)?
            .set_default("scaling.poll_interval_secs", 30)?
            .set_default("storage.db_path", "/var/lib/vpnvpn/state")?
            .set_default("storage.flush_interval_secs", 30)?
            .set_default("security.api_token", "")?;

        if let Ok(path) = std::env::var("VPNVPN_CONFIG_FILE") {
            builder = builder.add_source(config::File::with_name(&path));
        }

        builder = builder.add_source(
            config::Environment::with_prefix("VPNVPN")
                .separator("__")
                .try_parsing(true),
        );

        builder.build()?.try_deserialize()
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub interface_name: String,
    pub private_key: String,
    pub listen_port: u16,
    pub allowed_ips: Vec<String>,
    pub ip_command: String,
    pub wg_command: String,
    pub peer_config_base_path: String,
    pub state_sync_interval_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AdminConfig {
    pub bind_address: String,
    pub port: u16,
    pub jwt_issuer: String,
    pub jwt_audience: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TelemetryConfig {
    pub enable_cloudwatch: bool,
    pub publish_interval_secs: u64,
    pub metrics_namespace: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ScalingConfig {
    pub enabled: bool,
    pub auto_scaling_group: String,
    pub target_sessions_per_instance: u32,
    pub min_desired: i32,
    pub max_desired: i32,
    pub poll_interval_secs: u64,
}

impl ScalingConfig {
    pub fn poll_interval(&self) -> Duration {
        Duration::from_secs(self.poll_interval_secs.max(5))
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct StorageConfig {
    pub db_path: String,
    pub flush_interval_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SecurityConfig {
    /// Bearer token required for privileged admin operations.
    pub api_token: String,
}

