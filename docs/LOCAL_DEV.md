## Local Development

This project is a Bun/Turborepo monorepo. You can run the full stack via Docker Compose or run individual apps/services with Bun/Cargo.

### 1. Prerequisites

- Bun 1.1+
- Docker & Docker Compose (for full local stack)
- Rust toolchain (for vpn-server and Tauri)

### 2. Install Dependencies

```bash
cd vpnVPN
bun install
```

### 3. Environment Variables

Create a root `.env` file based on the variables documented in:

- `apps/web/env.local.example`
- `infra/pulumi/env.example`

Use a Neon or local Postgres URL for `DATABASE_URL`. For local Docker Compose, you can use:

```bash
DATABASE_URL="postgresql://postgres:password@postgres:5432/vpnvpn"
```

### 4. Run Full Stack with Docker

```bash
cd local
docker compose up --build
```

This brings up:

- Postgres
- `services/control-plane` on port `4000`
- `services/metrics` on port `4100`
- `apps/vpn-server` as `vpn-node`
- `apps/web` on port `3000`

### 5. Run Apps/Services Individually

In separate terminals:

```bash
# Control-plane service
cd services/control-plane
bun run dev

# Metrics service
cd services/metrics
bun run dev

# Web app
cd apps/web
bun run dev

# VPN server (requires sudo and WireGuard/OpenVPN tooling)
cd apps/vpn-server
cargo run -- run
```

### 6. Tests

```bash
# All JS/TS tests via Turbo
bun run test

# Web app only
cd apps/web
bun run test

# Services
cd services/control-plane && bun run test
cd services/metrics && bun run test

# VPN server
cd apps/vpn-server
cargo test
```


