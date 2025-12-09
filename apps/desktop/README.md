# vpnVPN Desktop (Tauri)

Native multi‑platform desktop client for vpnVPN. The UI is rendered directly in
Tauri (no embedded `/desktop` webview) and talks to the Next.js API routes for
auth, billing, device registration, and VPN credentials.

## Running locally

1. Start the web app / API (and local services):

   ```bash
   bun install
   bun run dev            # full stack (web, control-plane, metrics, vpn-server)
   # or just the web app
   cd apps/web && bun run dev   # serves http://localhost:3000
   ```

2. Start the desktop app:

   ```bash
   cd apps/desktop
   export VITE_API_BASE_URL="http://localhost:3000"
   export VITE_DASHBOARD_URL="http://localhost:3000/dashboard" # optional, used when opening the browser
   bun install
   bun run dev
   ```

## Building for production

```bash
cd apps/desktop
export VITE_API_BASE_URL="https://vpnvpn.dev"
export VITE_DASHBOARD_URL="https://vpnvpn.dev/dashboard"
bun install
bun run build
```

Tauri produces native installers for macOS, Windows, and Linux.

## Configuration

- `VITE_API_BASE_URL` – base URL for Next.js API routes (auth, trpc, etc.)
- `VITE_DASHBOARD_URL` – dashboard URL to open in a browser when needed
- `VITE_WG_ENDPOINT`, `VITE_WG_SERVER_PUBLIC_KEY`, `VITE_OVPN_REMOTE`,
  `VITE_OVPN_PORT`, `VITE_IKEV2_REMOTE` – VPN endpoint configuration
