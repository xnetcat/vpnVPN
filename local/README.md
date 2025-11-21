# Local stack & end-to-end testing

This folder contains a **dockerized VPN connectivity test** for vpnVPN.

## Quick Start

### Run the dockerized VPN connectivity test

```bash
cd local
./test-flow.sh   # run as your normal user (no sudo)
```

If the script exits with status `0`, the VPN connectivity test passed and the stack stays up.

## Requirements

- Docker
- WireGuard (for generating keys inside the script)

You do **not** need to export any keys yourself – `test-flow.sh` generates ephemeral
WireGuard keys for the docker test client on each run.

## What the test does

- Builds and runs `vpn-node` (Rust VPN server), `postgres`, `web-app`, and `vpn-test-client` containers.
- `vpn-test-client` fetches the server WireGuard public key, establishes a tunnel to `vpn-node`,
  and pings `10.8.0.1` to verify connectivity.
