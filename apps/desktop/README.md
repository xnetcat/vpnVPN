# vpnVPN Desktop (Tauri)

This directory contains the multi‑platform desktop shell for vpnVPN.  
The desktop app is intentionally **thin** – it embeds the existing `web-app`
desktop experience (`/desktop`) instead of duplicating UI and business logic.

The flow is:

1. `web-app` exposes a rich desktop UI at `/desktop` (served from
   `app.domain.com` in production, `http://localhost:3000/desktop` locally).
2. The Tauri app opens that URL inside a native window.
3. All authentication, billing, device registration, and VPN credential
   management continue to be handled by the Next.js app via tRPC.

## Running locally

1. **Start the web app** (and local services):

   ```bash
   # In project root
   cd web-app
   pnpm install
   pnpm dev
   # The app serves http://localhost:3000, including /desktop
   ```

   Make sure your local control plane / VPN services are running via
   `local/compose.yaml` or `local/test-flow.sh` so the web app can talk to the
   local API Gateway and VPN nodes.

2. **Start the desktop app**:

   ```bash
   cd desktop-app

   # Optional: override the embedded URL (defaults to http://localhost:3000/desktop)
   export VITE_VPNVPN_DESKTOP_URL="http://localhost:3000/desktop"

   pnpm install
   pnpm tauri:dev
   ```

   The Tauri window should open and display the `/desktop` route from the web
   app. When the web app is configured to use your local control plane
   (`CONTROL_PLANE_API_URL` / `NEXT_PUBLIC_API_BASE_URL`), the desktop app will
   automatically operate against local VPN services.

## Building for production

1. Ensure `web-app` is deployed and reachable at `https://app.domain.com`.
   The `/desktop` route should be available and wired to your production
   control plane.

2. Build the desktop bundles:

   ```bash
   cd desktop-app
   export VITE_VPNVPN_DESKTOP_URL="https://app.domain.com/desktop"
   pnpm install
   pnpm tauri:build
   ```

Tauri will produce native installers / bundles for macOS, Windows, and Linux.

## Configuration

- `VITE_VPNVPN_DESKTOP_URL` – URL that the embedded webview should load.
  - **Dev default**: `http://localhost:3000/desktop`
  - **Prod example**: `https://app.domain.com/desktop`

No control‑plane or VPN secrets are stored in the desktop app. All sensitive
communication stays inside `web-app` (Next.js) and its tRPC backend.



