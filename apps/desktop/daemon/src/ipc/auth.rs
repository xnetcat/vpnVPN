//! IPC authentication module.
//!
//! Provides authentication mechanisms for daemon-GUI communication:
//! - Code-signing verification (macOS/Windows)
//! - Peer credentials (Linux via SO_PEERCRED)
//! - Nonce challenge-response

use anyhow::Result;
use base64::Engine;
use rand::Rng;
use std::time::{Duration, Instant};
use tracing::{debug, warn};

/// Authentication challenge.
pub struct AuthChallenge {
    pub nonce: String,
    pub created_at: Instant,
    pub expires_in: Duration,
}

impl AuthChallenge {
    /// Create a new authentication challenge.
    pub fn new(expires_in: Duration) -> Self {
        let mut nonce_bytes = [0u8; 32];
        rand::thread_rng().fill(&mut nonce_bytes);
        let nonce = base64::engine::general_purpose::STANDARD.encode(nonce_bytes);

        Self {
            nonce,
            created_at: Instant::now(),
            expires_in,
        }
    }

    /// Check if the challenge has expired.
    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed() > self.expires_in
    }
}

/// Verify client credentials.
pub struct ClientVerifier {
    /// Expected bundle identifier (macOS).
    #[cfg(target_os = "macos")]
    expected_bundle_id: String,

    /// Expected signing authority (macOS).
    #[cfg(target_os = "macos")]
    expected_team_id: Option<String>,

    /// Allowed user IDs (Linux).
    #[cfg(target_os = "linux")]
    allowed_uids: Vec<u32>,
}

impl Default for ClientVerifier {
    fn default() -> Self {
        Self::new()
    }
}

impl ClientVerifier {
    pub fn new() -> Self {
        Self {
            #[cfg(target_os = "macos")]
            expected_bundle_id: "com.vpnvpn.desktop".to_string(),
            #[cfg(target_os = "macos")]
            expected_team_id: None,
            #[cfg(target_os = "linux")]
            allowed_uids: vec![], // Empty = allow all users
        }
    }

    /// Verify a client connection.
    #[cfg(target_os = "macos")]
    pub fn verify_client(&self, pid: i32) -> Result<bool> {
        // Use Security framework to verify code signature
        verify_code_signature_macos(pid, &self.expected_bundle_id)
    }

    #[cfg(target_os = "linux")]
    pub fn verify_client(&self, uid: u32, _gid: u32, _pid: i32) -> Result<bool> {
        // On Linux, verify peer credentials
        if self.allowed_uids.is_empty() {
            // No restriction - allow all users
            debug!("Allowing client with UID {}", uid);
            return Ok(true);
        }

        let allowed = self.allowed_uids.contains(&uid);
        if !allowed {
            warn!("Rejecting client with UID {} (not in allowed list)", uid);
        }
        Ok(allowed)
    }

    #[cfg(target_os = "windows")]
    pub fn verify_client(&self, _process_id: u32) -> Result<bool> {
        // On Windows, verify process signature
        // For now, accept all clients
        // TODO: Implement Windows code signing verification
        debug!("Windows client verification not yet implemented");
        Ok(true)
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    pub fn verify_client(&self) -> Result<bool> {
        Ok(true)
    }
}

/// Verify code signature on macOS.
#[cfg(target_os = "macos")]
fn verify_code_signature_macos(pid: i32, _expected_bundle_id: &str) -> Result<bool> {
    use std::process::Command;

    // Use codesign to verify the process
    let output = Command::new("codesign")
        .args(["--verify", "--pid", &pid.to_string()])
        .output()?;

    if !output.status.success() {
        warn!("Process {} failed code signature verification", pid);
        return Ok(false);
    }

    // Get signing info
    let info_output = Command::new("codesign")
        .args(["-dv", "--pid", &pid.to_string()])
        .output()?;

    let info = String::from_utf8_lossy(&info_output.stderr);
    debug!("Code signing info for PID {}: {}", pid, info);

    // For now, just verify that it's signed
    // In production, you would verify:
    // - Bundle identifier matches
    // - Team ID matches
    // - Certificate chain is valid

    Ok(true)
}

/// Get peer credentials from a Unix socket.
#[cfg(target_os = "linux")]
pub fn get_peer_credentials(
    fd: std::os::unix::io::RawFd,
) -> Result<(u32, u32, i32)> {
    use std::os::fd::BorrowedFd;
    use nix::sys::socket::{getsockopt, sockopt::PeerCredentials};

    // Safety: fd is a valid file descriptor from an accepted socket
    let borrowed_fd = unsafe { BorrowedFd::borrow_raw(fd) };
    let creds = getsockopt(&borrowed_fd, PeerCredentials)?;
    Ok((creds.uid(), creds.gid(), creds.pid()))
}

/// Get peer credentials from a Unix socket (macOS stub).
#[cfg(target_os = "macos")]
pub fn get_peer_credentials(
    _fd: std::os::unix::io::RawFd,
) -> Result<(u32, u32, i32)> {
    // macOS doesn't have SO_PEERCRED, use LOCAL_PEERCRED instead
    // For now, return placeholder values and rely on code signing
    let pid = std::process::id() as i32;
    Ok((0, 0, pid))
}

/// Nonce store for challenge-response authentication.
pub struct NonceStore {
    /// Active nonces with their creation time.
    nonces: std::collections::HashMap<String, Instant>,
    /// Maximum age of a nonce.
    max_age: Duration,
    /// Maximum number of active nonces.
    max_nonces: usize,
}

impl NonceStore {
    pub fn new(max_age: Duration, max_nonces: usize) -> Self {
        Self {
            nonces: std::collections::HashMap::new(),
            max_age,
            max_nonces,
        }
    }

    /// Generate and store a new nonce.
    pub fn generate(&mut self) -> String {
        // Clean up expired nonces first
        self.cleanup();

        // Generate new nonce
        let mut nonce_bytes = [0u8; 16];
        rand::thread_rng().fill(&mut nonce_bytes);
        let nonce = base64::engine::general_purpose::STANDARD.encode(nonce_bytes);

        // Store nonce
        self.nonces.insert(nonce.clone(), Instant::now());

        nonce
    }

    /// Validate and consume a nonce.
    pub fn validate(&mut self, nonce: &str) -> bool {
        if let Some(created_at) = self.nonces.remove(nonce) {
            if created_at.elapsed() <= self.max_age {
                return true;
            }
        }
        false
    }

    /// Clean up expired nonces.
    fn cleanup(&mut self) {
        let max_age = self.max_age;
        self.nonces.retain(|_, created_at| created_at.elapsed() <= max_age);

        // If still too many, remove oldest
        while self.nonces.len() >= self.max_nonces {
            if let Some(oldest_key) = self
                .nonces
                .iter()
                .min_by_key(|(_, created_at)| *created_at)
                .map(|(k, _)| k.clone())
            {
                self.nonces.remove(&oldest_key);
            } else {
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nonce_store() {
        let mut store = NonceStore::new(Duration::from_secs(60), 10);

        let nonce = store.generate();
        assert!(!nonce.is_empty());

        // First validation should succeed
        assert!(store.validate(&nonce));

        // Second validation should fail (nonce consumed)
        assert!(!store.validate(&nonce));
    }

    #[test]
    fn test_auth_challenge() {
        let challenge = AuthChallenge::new(Duration::from_secs(60));
        assert!(!challenge.nonce.is_empty());
        assert!(!challenge.is_expired());
    }
}

