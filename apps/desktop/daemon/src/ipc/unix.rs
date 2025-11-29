//! Unix Domain Socket IPC server implementation.

use crate::state::DaemonState;
use anyhow::Result;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};
use vpnvpn_shared::ipc::{DaemonRequest, DaemonResponse, JsonRpcRequest, JsonRpcResponse};

const SOCKET_PATH: &str = "/var/run/vpnvpn-daemon.sock";

/// Run the Unix Domain Socket server.
pub async fn run_server(state: Arc<RwLock<DaemonState>>) -> Result<()> {
    // Remove existing socket file
    let _ = std::fs::remove_file(SOCKET_PATH);

    // Create parent directory if needed
    if let Some(parent) = std::path::Path::new(SOCKET_PATH).parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Bind to socket
    let listener = UnixListener::bind(SOCKET_PATH)?;

    // Set socket permissions (only owner can access)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(0o700);
        std::fs::set_permissions(SOCKET_PATH, permissions)?;
    }

    info!("IPC server listening on {}", SOCKET_PATH);

    loop {
        match listener.accept().await {
            Ok((stream, _addr)) => {
                let state = Arc::clone(&state);
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream, state).await {
                        error!("Connection error: {}", e);
                    }
                });
            }
            Err(e) => {
                error!("Accept error: {}", e);
            }
        }
    }
}

async fn handle_connection(
    stream: tokio::net::UnixStream,
    state: Arc<RwLock<DaemonState>>,
) -> Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let mut line = String::new();

    // Optionally verify peer credentials
    #[cfg(unix)]
    {
        // Could use SO_PEERCRED here to verify the connecting process
        debug!("New connection established");
    }

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
                // Parse the inner request
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

fn parse_request(rpc: &JsonRpcRequest) -> Result<DaemonRequest> {
    match rpc.method.as_str() {
        "ping" => Ok(DaemonRequest::Ping),
        "get_status" => Ok(DaemonRequest::GetStatus),
        "get_connection_status" => Ok(DaemonRequest::GetConnectionStatus),
        "get_settings" => Ok(DaemonRequest::GetSettings),
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

