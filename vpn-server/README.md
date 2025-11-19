# VPN Server

High-performance VPN server written in Rust, supporting WireGuard, OpenVPN, and IKEv2.

## Supported Platforms

| Platform    | Support Status | Requirements                                                         |
| ----------- | -------------- | -------------------------------------------------------------------- |
| **Linux**   | ✅ First-class | Kernel WireGuard or `wireguard-go`                                   |
| **macOS**   | ✅ Supported   | `brew install wireguard-tools`                                       |
| **Windows** | ⚠️ Beta        | Requires [WireGuard for Windows](https://www.wireguard.com/install/) |

## Prerequisites

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install wireguard openvpn iproute2
```

### macOS

```bash
brew install wireguard-tools openvpn
# Note: Userspace wireguard-go (utun) is used.
```

### Windows

1. Download and install [WireGuard for Windows](https://www.wireguard.com/install/).
2. Ensure `wg.exe` or `wireguard.exe` is in your PATH.
3. Install [OpenVPN Connect](https://openvpn.net/client-connect-vpn-for-windows/) if using OpenVPN.

## Running

```bash
cargo run --release -- --listen-port 51820
```

## Architecture

The server uses a modular backend system:

- **WireGuard**:
  - **Linux**: Uses kernel module if available, falls back to `wireguard-go`.
  - **macOS**: Uses `wireguard-go` (userspace).
  - **Windows**: Uses `wireguard.exe` service wrapper.

## Configuration

Environment variables:

- `API_URL`: Control Plane URL (e.g., `https://api.vpn.com`)
- `VPN_TOKEN`: Registration token.
- `VPN_PROTOCOLS`: Comma-separated list (default: `wireguard,openvpn,ikev2`).

## Cross-Platform Notes

- On **Windows**, the server should be run with **Administrator privileges** to manage network interfaces and services.
- On **macOS/Linux**, `sudo` is generally required to manipulate `utun`/`tun` devices.
