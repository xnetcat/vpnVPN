//! Client for communicating with the vpnVPN daemon.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(unix)]
use std::os::unix::net::UnixStream;

static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

const SOCKET_PATH: &str = "/var/run/vpnvpn-daemon.sock";

#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    params: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: u64,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

/// Daemon status response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonStatus {
    pub running: bool,
    pub version: String,
    pub uptime_secs: u64,
    pub has_network_permission: bool,
    pub has_firewall_permission: bool,
    pub kill_switch_active: bool,
}

impl Default for DaemonStatus {
    fn default() -> Self {
        Self {
            running: false,
            version: "0.0.0".to_string(),
            uptime_secs: 0,
            has_network_permission: false,
            has_firewall_permission: false,
            kill_switch_active: false,
        }
    }
}

/// Check if daemon is available.
pub fn is_daemon_available() -> bool {
    #[cfg(unix)]
    {
        std::path::Path::new(SOCKET_PATH).exists()
    }

    #[cfg(windows)]
    {
        // Try to connect to named pipe
        false // TODO: Implement Windows named pipe check
    }
}

/// Send a request to the daemon.
#[cfg(unix)]
fn send_request(method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    // Connect to socket
    let mut stream =
        UnixStream::connect(SOCKET_PATH).map_err(|e| format!("Failed to connect to daemon: {}", e))?;

    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(10)))
        .ok();
    stream
        .set_write_timeout(Some(std::time::Duration::from_secs(5)))
        .ok();

    // Build request
    let request = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: REQUEST_ID.fetch_add(1, Ordering::SeqCst),
        method: method.to_string(),
        params,
    };

    // Send request
    let request_json =
        serde_json::to_string(&request).map_err(|e| format!("Failed to serialize request: {}", e))?;

    stream
        .write_all(request_json.as_bytes())
        .map_err(|e| format!("Failed to send request: {}", e))?;
    stream
        .write_all(b"\n")
        .map_err(|e| format!("Failed to send newline: {}", e))?;
    stream.flush().map_err(|e| format!("Failed to flush: {}", e))?;

    // Read response
    let mut reader = BufReader::new(stream);
    let mut response_line = String::new();
    reader
        .read_line(&mut response_line)
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Parse response
    let response: JsonRpcResponse = serde_json::from_str(&response_line)
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if let Some(error) = response.error {
        return Err(format!("Daemon error ({}): {}", error.code, error.message));
    }

    response.result.ok_or_else(|| "Empty response".to_string())
}

#[cfg(windows)]
fn send_request(_method: &str, _params: serde_json::Value) -> Result<serde_json::Value, String> {
    // TODO: Implement Windows named pipe client
    Err("Windows daemon client not yet implemented".to_string())
}

/// Ping the daemon.
#[allow(dead_code)]
pub fn ping() -> Result<(), String> {
    let result = send_request("ping", serde_json::Value::Null)?;
    if result.get("type").and_then(|v| v.as_str()) == Some("pong") {
        Ok(())
    } else {
        Err("Unexpected response".to_string())
    }
}

/// Get daemon status.
pub fn get_status() -> Result<DaemonStatus, String> {
    let result = send_request("get_status", serde_json::Value::Null)?;

    // Extract nested status from response
    if let Some(status_obj) = result.get("Status") {
        serde_json::from_value(status_obj.clone())
            .map_err(|e| format!("Failed to parse status: {}", e))
    } else {
        // Try parsing the whole result
        serde_json::from_value(result).map_err(|e| format!("Failed to parse status: {}", e))
    }
}

/// Enable kill switch.
pub fn enable_kill_switch(allow_lan: bool) -> Result<(), String> {
    let params = serde_json::json!({
        "type": "enable_kill_switch",
        "allow_lan": allow_lan
    });

    let result = send_request("enable_kill_switch", params)?;

    if result.get("type").and_then(|v| v.as_str()) == Some("ok") {
        Ok(())
    } else if let Some(error) = result.get("Error") {
        let msg = error
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown error");
        Err(msg.to_string())
    } else {
        Ok(())
    }
}

/// Disable kill switch.
pub fn disable_kill_switch() -> Result<(), String> {
    let result = send_request("disable_kill_switch", serde_json::Value::Null)?;

    if result.get("type").and_then(|v| v.as_str()) == Some("ok") {
        Ok(())
    } else {
        Ok(()) // Assume success if no error
    }
}

/// Request daemon restart.
pub fn restart_daemon() -> Result<(), String> {
    send_request("restart_service", serde_json::Value::Null)?;
    Ok(())
}

/// VPN connection configuration sent to daemon.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VpnConfig {
    pub protocol: String,
    pub server_id: String,
    pub server_region: String,
    pub server_endpoint: String,
    pub server_port: u16,
    // WireGuard-specific
    pub wg_private_key: Option<String>,
    pub wg_public_key: Option<String>,
    pub wg_server_public_key: Option<String>,
    pub wg_preshared_key: Option<String>,
    pub assigned_ip: Option<String>,
    // OpenVPN-specific
    pub ovpn_config: Option<String>,
    // IKEv2-specific
    pub ikev2_identity: Option<String>,
    pub ikev2_remote_id: Option<String>,
    // DNS
    pub dns_servers: Vec<String>,
}

/// Connection status from daemon.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConnectionStatus {
    pub state: String,
    pub protocol: Option<String>,
    pub server_id: Option<String>,
    pub server_region: Option<String>,
    pub interface_name: Option<String>,
    pub assigned_ip: Option<String>,
    pub bytes_sent: Option<u64>,
    pub bytes_received: Option<u64>,
}

/// Connect to VPN via daemon.
pub fn connect_vpn(config: VpnConfig) -> Result<ConnectionStatus, String> {
    ensure_daemon_running()?;
    
    let params = serde_json::json!({
        "type": "connect",
        "config": config
    });

    let result = send_request("connect", params)?;

    // Parse connection status from response
    if let Some(status) = result.get("ConnectionStatus") {
        return serde_json::from_value(status.clone())
            .map_err(|e| format!("Failed to parse connection status: {}", e));
    }
    
    if let Some(error) = result.get("Error") {
        let msg = error
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Connection failed");
        return Err(msg.to_string());
    }

    // Return default connected status
    Ok(ConnectionStatus {
        state: "connected".to_string(),
        protocol: Some(config.protocol),
        ..Default::default()
    })
}

/// Disconnect VPN via daemon.
pub fn disconnect_vpn() -> Result<(), String> {
    ensure_daemon_running()?;
    
    let result = send_request("disconnect", serde_json::Value::Null)?;

    if let Some(error) = result.get("Error") {
        let msg = error
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Disconnect failed");
        return Err(msg.to_string());
    }

    Ok(())
}

/// Get current VPN connection status from daemon.
pub fn get_connection_status() -> Result<ConnectionStatus, String> {
    ensure_daemon_running()?;
    
    let result = send_request("get_connection_status", serde_json::Value::Null)?;

    // Parse connection status from response
    if let Some(status) = result.get("ConnectionStatus") {
        return serde_json::from_value(status.clone())
            .map_err(|e| format!("Failed to parse connection status: {}", e));
    }

    // Try parsing the whole result
    serde_json::from_value(result).map_err(|e| format!("Failed to parse connection status: {}", e))
}

/// Ensure daemon is running, return helpful error if not.
fn ensure_daemon_running() -> Result<(), String> {
    if !is_daemon_available() {
        return Err(
            "VPN daemon is not running. Please install the VPN service from Settings > Service, or complete the onboarding setup.".to_string()
        );
    }
    Ok(())
}

