use anyhow::{anyhow, Result};
use std::process::Command;

#[cfg(test)]
mod os_tests;

pub trait NetworkManager: Send + Sync {
    /// Check if required tools are installed (wg, etc.)
    fn check_dependencies(&self) -> Result<()>;
    
    /// Setup interface (create if needed, configure IP)
    fn configure_wireguard(&self, iface: &str, ip_cidr: &str, port: u16, conf_path: &str) -> Result<()>;
    
    /// Bring interface up
    fn bring_up_interface(&self, iface: &str) -> Result<()>;
    
    /// Teardown interface
    fn teardown_interface(&self, iface: &str) -> Result<()>;

    /// Get the command used to interact with the interface
    fn get_cmd_output(&self, cmd: &str, args: &[&str]) -> Result<String> {
        let output = Command::new(cmd)
            .args(args)
            .output()
            .map_err(|e| anyhow!("failed to execute {}: {}", cmd, e))?;
        
        if !output.status.success() {
            return Err(anyhow!("command failed: {} {:?}", cmd, args));
        }
        
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "linux")]
pub use linux::LinuxNetworkManager as PlatformNetworkManager;

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "macos")]
pub use macos::MacNetworkManager as PlatformNetworkManager;

#[cfg(target_os = "windows")]
pub mod windows;
#[cfg(target_os = "windows")]
pub use windows::WindowsNetworkManager as PlatformNetworkManager;

// Fallback for other OSs to satisfy compiler if building on unsupported platform (though we aim to support major 3)
#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
pub struct PlatformNetworkManager;

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
impl NetworkManager for PlatformNetworkManager {
    fn check_dependencies(&self) -> Result<()> { Err(anyhow!("Unsupported OS")) }
    fn configure_wireguard(&self, _: &str, _: &str, _: u16, _: &str) -> Result<()> { Err(anyhow!("Unsupported OS")) }
    fn bring_up_interface(&self, _: &str) -> Result<()> { Err(anyhow!("Unsupported OS")) }
    fn teardown_interface(&self, _: &str) -> Result<()> { Err(anyhow!("Unsupported OS")) }
}

pub fn get_network_manager() -> Box<dyn NetworkManager> {
    Box::new(PlatformNetworkManager::default())
}
