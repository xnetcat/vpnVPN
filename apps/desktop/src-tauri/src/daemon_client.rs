//! Client for communicating with the vpnVPN daemon.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(unix)]
use std::os::unix::net::UnixStream;

static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

/// Production socket path (requires root daemon)
const SOCKET_PATH: &str = "/var/run/vpnvpn-daemon.sock";

/// Development socket path (user-accessible, for hot reload)
const DEV_SOCKET_PATH: &str = "/tmp/vpnvpn-daemon.sock";

fn allow_dev_socket() -> bool {
    cfg!(debug_assertions)
        || matches!(
            std::env::var("APP_CHANNEL")
                .ok()
                .as_deref()
                .map(|s| s.to_lowercase()),
            Some(ref v) if v == "devel" || v == "dev" || v == "development"
        )
}

/// Get the active socket path, preferring dev socket if available.
/// This allows hot reload development without touching the production daemon.
fn get_socket_path() -> &'static str {
    // In dev, prefer the /tmp socket if it exists
    if allow_dev_socket() && std::path::Path::new(DEV_SOCKET_PATH).exists() {
        eprintln!("[daemon_client] Using dev socket: {}", DEV_SOCKET_PATH);
        return DEV_SOCKET_PATH;
    }

    // Fall back to production socket
    SOCKET_PATH
}

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

/// Check if daemon is available (checks dev socket first, then production).
pub fn is_daemon_available() -> bool {
    eprintln!("[daemon_client] Checking if daemon is available...");

    #[cfg(unix)]
    {
        // Check dev socket first
        if allow_dev_socket() && std::path::Path::new(DEV_SOCKET_PATH).exists() {
            eprintln!(
                "[daemon_client] Dev socket {} exists, trying to connect...",
                DEV_SOCKET_PATH
            );
            if let Ok(_) = UnixStream::connect(DEV_SOCKET_PATH) {
                eprintln!("[daemon_client] Successfully connected to dev socket");
                return true;
            }
        }

        // Check production socket
        let socket_exists = std::path::Path::new(SOCKET_PATH).exists();
        eprintln!(
            "[daemon_client] Production socket {} exists: {}",
            SOCKET_PATH, socket_exists
        );

        if socket_exists {
            match UnixStream::connect(SOCKET_PATH) {
                Ok(_) => {
                    eprintln!("[daemon_client] Successfully connected to production socket");
                    true
                }
                Err(e) => {
                    eprintln!(
                        "[daemon_client] Failed to connect to production socket: {}",
                        e
                    );
                    false
                }
            }
        } else {
            false
        }
    }

    #[cfg(windows)]
    {
        // Try to connect to named pipe
        eprintln!("[daemon_client] Windows daemon check not yet implemented");
        false // TODO: Implement Windows named pipe check
    }
}

/// Send a request to the daemon.
#[cfg(unix)]
fn send_request(method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    eprintln!("[daemon_client] send_request: method={}", method);

    let socket_path = get_socket_path();

    // Connect to socket
    eprintln!("[daemon_client] Connecting to socket: {}", socket_path);
    let mut stream = UnixStream::connect(socket_path).map_err(|e| {
        eprintln!("[daemon_client] Failed to connect: {}", e);
        format!("Failed to connect to daemon: {}", e)
    })?;
    eprintln!("[daemon_client] Connected to socket");

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
    let request_json = serde_json::to_string(&request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    eprintln!("[daemon_client] Sending request: {}", request_json);

    stream
        .write_all(request_json.as_bytes())
        .map_err(|e| format!("Failed to send request: {}", e))?;
    stream
        .write_all(b"\n")
        .map_err(|e| format!("Failed to send newline: {}", e))?;
    stream
        .flush()
        .map_err(|e| format!("Failed to flush: {}", e))?;

    eprintln!("[daemon_client] Request sent, waiting for response...");

    // Read response
    let mut reader = BufReader::new(stream);
    let mut response_line = String::new();
    reader.read_line(&mut response_line).map_err(|e| {
        eprintln!("[daemon_client] Failed to read response: {}", e);
        format!("Failed to read response: {}", e)
    })?;

    eprintln!(
        "[daemon_client] Received response: {}",
        response_line.trim()
    );

    // Parse response
    let response: JsonRpcResponse = serde_json::from_str(&response_line).map_err(|e| {
        eprintln!("[daemon_client] Failed to parse response: {}", e);
        format!("Failed to parse response: {}", e)
    })?;

    if let Some(error) = response.error {
        eprintln!(
            "[daemon_client] Daemon returned error: {} - {}",
            error.code, error.message
        );
        return Err(format!("Daemon error ({}): {}", error.code, error.message));
    }

    eprintln!("[daemon_client] Request successful");
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
    eprintln!("[daemon_client] Getting daemon status...");

    let result = send_request("get_status", serde_json::Value::Null)?;

    eprintln!("[daemon_client] Raw status result: {:?}", result);

    // Extract nested status from response
    if let Some(status_obj) = result.get("Status") {
        eprintln!("[daemon_client] Found Status object: {:?}", status_obj);
        serde_json::from_value(status_obj.clone()).map_err(|e| {
            eprintln!("[daemon_client] Failed to parse Status: {}", e);
            format!("Failed to parse status: {}", e)
        })
    } else {
        // Try parsing the whole result
        eprintln!("[daemon_client] No Status object, trying to parse whole result");
        serde_json::from_value(result.clone()).map_err(|e| {
            eprintln!(
                "[daemon_client] Failed to parse result as DaemonStatus: {}",
                e
            );
            format!("Failed to parse status: {}", e)
        })
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
    eprintln!("[daemon_client] connect_vpn called");
    eprintln!(
        "[daemon_client] Config: protocol={}, endpoint={}:{}",
        config.protocol, config.server_endpoint, config.server_port
    );
    eprintln!(
        "[daemon_client] Config: assigned_ip={:?}, wg_private_key={}",
        config.assigned_ip,
        config
            .wg_private_key
            .as_ref()
            .map(|_| "[REDACTED]")
            .unwrap_or("None")
    );
    eprintln!(
        "[daemon_client] Config: wg_server_public_key={:?}",
        config.wg_server_public_key
    );

    ensure_daemon_running()?;

    let params = serde_json::json!({
        "type": "connect",
        "config": config
    });

    eprintln!("[daemon_client] Sending connect request to daemon...");
    let result = send_request("connect", params)?;
    eprintln!("[daemon_client] Connect response: {:?}", result);

    // Parse connection status from response
    if let Some(status) = result.get("ConnectionStatus") {
        eprintln!("[daemon_client] Got ConnectionStatus from response");
        return serde_json::from_value(status.clone())
            .map_err(|e| format!("Failed to parse connection status: {}", e));
    }

    if let Some(error) = result.get("Error") {
        let msg = error
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Connection failed");
        eprintln!("[daemon_client] Connect error: {}", msg);
        return Err(msg.to_string());
    }

    eprintln!("[daemon_client] Connect succeeded (no explicit status)");
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

// ============ VPN Tools ============

/// VPN tool information from daemon.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VpnToolInfo {
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub custom_path: Option<String>,
    pub error: Option<String>,
}

/// VPN tools status from daemon.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VpnToolsStatus {
    pub wireguard: VpnToolInfo,
    pub openvpn: VpnToolInfo,
    pub ikev2: VpnToolInfo,
}

/// Custom binary paths configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VpnBinaryPaths {
    pub wg_quick_path: Option<String>,
    pub wireguard_cli_path: Option<String>,
    pub openvpn_path: Option<String>,
    pub ikev2_path: Option<String>,
}

/// Get VPN tools status from daemon.
pub fn get_vpn_tools() -> Result<VpnToolsStatus, String> {
    eprintln!("[daemon_client] Getting VPN tools status...");

    let result = send_request("get_vpn_tools", serde_json::Value::Null)?;

    eprintln!("[daemon_client] Raw VPN tools result: {:?}", result);

    // Extract VpnTools from response
    if let Some(tools_obj) = result.get("VpnTools") {
        eprintln!("[daemon_client] Found VpnTools object: {:?}", tools_obj);
        serde_json::from_value(tools_obj.clone()).map_err(|e| {
            eprintln!("[daemon_client] Failed to parse VpnTools: {}", e);
            format!("Failed to parse VPN tools: {}", e)
        })
    } else {
        // Try parsing the whole result
        eprintln!("[daemon_client] No VpnTools object, trying to parse whole result");
        serde_json::from_value(result.clone()).map_err(|e| {
            eprintln!(
                "[daemon_client] Failed to parse result as VpnToolsStatus: {}",
                e
            );
            format!("Failed to parse VPN tools: {}", e)
        })
    }
}

/// Refresh VPN tools detection in daemon.
pub fn refresh_vpn_tools() -> Result<VpnToolsStatus, String> {
    eprintln!("[daemon_client] Refreshing VPN tools...");

    let result = send_request("refresh_vpn_tools", serde_json::Value::Null)?;

    // Extract VpnTools from response
    if let Some(tools_obj) = result.get("VpnTools") {
        serde_json::from_value(tools_obj.clone())
            .map_err(|e| format!("Failed to parse VPN tools: {}", e))
    } else {
        serde_json::from_value(result).map_err(|e| format!("Failed to parse VPN tools: {}", e))
    }
}

/// Update VPN binary paths in daemon settings.
pub fn update_binary_paths(paths: VpnBinaryPaths) -> Result<VpnToolsStatus, String> {
    eprintln!("[daemon_client] Updating VPN binary paths...");
    eprintln!("[daemon_client] Paths: {:?}", paths);

    let params = serde_json::json!({
        "type": "update_binary_paths",
        "paths": paths
    });

    let result = send_request("update_binary_paths", params)?;

    eprintln!("[daemon_client] Update binary paths result: {:?}", result);

    // Extract VpnTools from response
    if let Some(tools_obj) = result.get("VpnTools") {
        serde_json::from_value(tools_obj.clone())
            .map_err(|e| format!("Failed to parse VPN tools: {}", e))
    } else {
        serde_json::from_value(result).map_err(|e| format!("Failed to parse VPN tools: {}", e))
    }
}

/// Get VPN tools from daemon status (includes vpn_tools field).
pub fn get_vpn_tools_from_status() -> Result<VpnToolsStatus, String> {
    eprintln!("[daemon_client] Getting VPN tools from daemon status...");

    let result = send_request("get_status", serde_json::Value::Null)?;

    // Extract vpn_tools from Status response
    if let Some(status_obj) = result.get("Status") {
        if let Some(tools_obj) = status_obj.get("vpn_tools") {
            return serde_json::from_value(tools_obj.clone())
                .map_err(|e| format!("Failed to parse VPN tools from status: {}", e));
        }
    }

    Err("VPN tools not found in daemon status".to_string())
}
