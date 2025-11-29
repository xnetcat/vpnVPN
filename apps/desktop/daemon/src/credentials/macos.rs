//! macOS Keychain credential storage.

use anyhow::Result;
use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};

/// Store a credential in the macOS Keychain.
pub fn store(service: &str, key: &str, value: &str) -> Result<()> {
    // Delete existing entry first (set_generic_password doesn't update)
    let _ = delete_generic_password(service, key);

    set_generic_password(service, key, value.as_bytes())
        .map_err(|e| anyhow::anyhow!("Failed to store credential: {}", e))?;

    Ok(())
}

/// Get a credential from the macOS Keychain.
pub fn get(service: &str, key: &str) -> Result<Option<String>> {
    match get_generic_password(service, key) {
        Ok(data) => {
            let value = String::from_utf8(data)
                .map_err(|e| anyhow::anyhow!("Invalid credential encoding: {}", e))?;
            Ok(Some(value))
        }
        Err(e) => {
            // Check if it's a "not found" error
            let err_str = e.to_string();
            if err_str.contains("not found") || err_str.contains("-25300") {
                Ok(None)
            } else {
                Err(anyhow::anyhow!("Failed to get credential: {}", e))
            }
        }
    }
}

/// Delete a credential from the macOS Keychain.
pub fn delete(service: &str, key: &str) -> Result<()> {
    match delete_generic_password(service, key) {
        Ok(()) => Ok(()),
        Err(e) => {
            let err_str = e.to_string();
            // Ignore "not found" errors
            if err_str.contains("not found") || err_str.contains("-25300") {
                Ok(())
            } else {
                Err(anyhow::anyhow!("Failed to delete credential: {}", e))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_roundtrip() {
        let service = "com.vpnvpn.test";
        let key = "test-key";
        let value = "test-value-12345";

        // Store
        store(service, key, value).expect("store should succeed");

        // Get
        let retrieved = get(service, key).expect("get should succeed");
        assert_eq!(retrieved, Some(value.to_string()));

        // Delete
        delete(service, key).expect("delete should succeed");

        // Verify deleted
        let after_delete = get(service, key).expect("get should succeed");
        assert_eq!(after_delete, None);
    }
}

