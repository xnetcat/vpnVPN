//! Named Pipe IPC server implementation for Windows.

#![cfg(windows)]

use crate::state::DaemonState;
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};
use vpnvpn_shared::ipc::{DaemonRequest, DaemonResponse, JsonRpcRequest, JsonRpcResponse};

const PIPE_NAME: &str = r"\\.\pipe\vpnvpn-daemon";

/// Run the Named Pipe server on Windows.
pub async fn run_server(state: Arc<RwLock<DaemonState>>) -> Result<()> {
    info!("Starting Named Pipe server at {}", PIPE_NAME);

    // Windows named pipe server implementation
    // Using tokio's Windows-specific async pipe support

    loop {
        // Create a new pipe instance
        let pipe = create_pipe_instance()?;

        // Wait for a client to connect
        let connected_pipe = match pipe.connect().await {
            Ok(p) => p,
            Err(e) => {
                error!("Pipe connect error: {}", e);
                continue;
            }
        };

        let state = Arc::clone(&state);
        tokio::spawn(async move {
            if let Err(e) = handle_connection(connected_pipe, state).await {
                error!("Connection error: {}", e);
            }
        });
    }
}

#[cfg(windows)]
fn create_pipe_instance() -> Result<tokio::net::windows::named_pipe::NamedPipeServer> {
    use tokio::net::windows::named_pipe::ServerOptions;

    let pipe = ServerOptions::new()
        .first_pipe_instance(false)
        .create(PIPE_NAME)?;

    Ok(pipe)
}

#[cfg(windows)]
async fn handle_connection(
    pipe: tokio::net::windows::named_pipe::NamedPipeServer,
    state: Arc<RwLock<DaemonState>>,
) -> Result<()> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    let (reader, mut writer) = tokio::io::split(pipe);
    let mut reader = BufReader::new(reader);
    let mut line = String::new();

    debug!("New pipe connection established");

    loop {
        line.clear();
        let bytes_read = reader.read_line(&mut line).await?;

        if bytes_read == 0 {
            debug!("Client disconnected");
            break;
        }

        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        debug!("Received: {}", line);

        // Parse JSON-RPC request
        let response = match serde_json::from_str::<JsonRpcRequest>(line) {
            Ok(rpc_request) => {
                let request = parse_request(&rpc_request);

                let daemon_response = match request {
                    Ok(req) => super::handler::handle_request(Arc::clone(&state), req).await,
                    Err(e) => {
                        warn!("Invalid request: {}", e);
                        DaemonResponse::error(-32600, format!("Invalid request: {}", e))
                    }
                };

                JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: rpc_request.id,
                    result: match &daemon_response {
                        DaemonResponse::Error(_) => None,
                        _ => Some(serde_json::to_value(&daemon_response).unwrap()),
                    },
                    error: match daemon_response {
                        DaemonResponse::Error(e) => Some(e.into()),
                        _ => None,
                    },
                }
            }
            Err(e) => {
                warn!("Failed to parse request: {}", e);
                JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: 0,
                    result: None,
                    error: Some(vpnvpn_shared::ipc::JsonRpcError {
                        code: -32700,
                        message: format!("Parse error: {}", e),
                        data: None,
                    }),
                }
            }
        };

        // Send response
        let response_json = serde_json::to_string(&response)?;
        debug!("Sending: {}", response_json);
        writer.write_all(response_json.as_bytes()).await?;
        writer.write_all(b"\n").await?;
        writer.flush().await?;
    }

    Ok(())
}

#[cfg(windows)]
fn parse_request(rpc: &JsonRpcRequest) -> Result<DaemonRequest> {
    // Same parsing logic as Unix
    match rpc.method.as_str() {
        "ping" => Ok(DaemonRequest::Ping),
        "get_status" => Ok(DaemonRequest::GetStatus),
        "get_connection_status" => Ok(DaemonRequest::GetConnectionStatus),
        "get_settings" => Ok(DaemonRequest::GetSettings),
        "get_vpn_tools" => Ok(DaemonRequest::GetVpnTools),
        "refresh_vpn_tools" => Ok(DaemonRequest::RefreshVpnTools),
        "disconnect" => Ok(DaemonRequest::Disconnect),
        "disable_kill_switch" => Ok(DaemonRequest::DisableKillSwitch),
        "install_service" => Ok(DaemonRequest::InstallService),
        "uninstall_service" => Ok(DaemonRequest::UninstallService),
        "restart_service" => Ok(DaemonRequest::RestartService),

        "connect" => {
            let req: DaemonRequest = serde_json::from_value(rpc.params.clone())?;
            Ok(req)
        }
        "update_settings" => {
            let req: DaemonRequest = serde_json::from_value(rpc.params.clone())?;
            Ok(req)
        }
        "enable_kill_switch" => {
            let req: DaemonRequest = serde_json::from_value(rpc.params.clone())?;
            Ok(req)
        }
        "update_binary_paths" => {
            let req: DaemonRequest = serde_json::from_value(rpc.params.clone())?;
            Ok(req)
        }
        "store_credential" => {
            let req: DaemonRequest = serde_json::from_value(rpc.params.clone())?;
            Ok(req)
        }
        "get_credential" => {
            let req: DaemonRequest = serde_json::from_value(rpc.params.clone())?;
            Ok(req)
        }
        "delete_credential" => {
            let req: DaemonRequest = serde_json::from_value(rpc.params.clone())?;
            Ok(req)
        }
        "prepare_update" => {
            let req: DaemonRequest = serde_json::from_value(rpc.params.clone())?;
            Ok(req)
        }
        "authenticate" => {
            let req: DaemonRequest = serde_json::from_value(rpc.params.clone())?;
            Ok(req)
        }

        _ => Err(anyhow::anyhow!("Unknown method: {}", rpc.method)),
    }
}

// Stub for non-Windows platforms
#[cfg(not(windows))]
pub async fn run_server(_state: Arc<RwLock<DaemonState>>) -> Result<()> {
    Err(anyhow::anyhow!("Windows named pipes not available on this platform"))
}

