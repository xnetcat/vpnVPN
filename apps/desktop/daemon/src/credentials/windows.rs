//! Windows Credential Manager storage.

use anyhow::Result;

/// Store a credential in Windows Credential Manager.
pub fn store(service: &str, key: &str, value: &str) -> Result<()> {
    let target = format!("{}:{}", service, key);

    // Use cmdkey to store credential
    let output = std::process::Command::new("cmdkey")
        .args([
            &format!("/add:{}", target),
            &format!("/user:{}", key),
            &format!("/pass:{}", value),
        ])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("cmdkey add failed: {}", stderr));
    }

    Ok(())
}

/// Get a credential from Windows Credential Manager.
pub fn get(service: &str, key: &str) -> Result<Option<String>> {
    let target = format!("{}:{}", service, key);

    // Use PowerShell to retrieve credential (cmdkey doesn't show passwords)
    let ps_script = format!(
        r#"
        $cred = Get-StoredCredential -Target "{}"
        if ($cred) {{
            $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($cred.Password)
            [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        }}
        "#,
        target
    );

    let output = std::process::Command::new("powershell")
        .args(["-Command", &ps_script])
        .output()?;

    if output.status.success() {
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if value.is_empty() {
            Ok(None)
        } else {
            Ok(Some(value))
        }
    } else {
        // Try alternative method using Windows API via PowerShell
        let ps_alt = format!(
            r#"
            Add-Type -AssemblyName System.Security
            $bytes = [System.Text.Encoding]::Unicode.GetBytes("{}")
            $protected = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')
            [System.Text.Encoding]::Unicode.GetString($protected)
            "#,
            target
        );

        // If both methods fail, credential doesn't exist
        Ok(None)
    }
}

/// Delete a credential from Windows Credential Manager.
pub fn delete(service: &str, key: &str) -> Result<()> {
    let target = format!("{}:{}", service, key);

    let output = std::process::Command::new("cmdkey")
        .args([&format!("/delete:{}", target)])
        .output()?;

    // Ignore errors (credential might not exist)
    Ok(())
}
