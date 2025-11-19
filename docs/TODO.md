# Detailed Task Board & Roadmap

**Status Legend:**

- [ ] Pending
- [/] In Progress
- [x] Completed

---

## 🚨 Critical Integration Milestones

_These tasks block multiple streams of work._

- [ ] **API Contract Finalization**
  - [ ] Define JSON Schema for `POST /server/register` (Input/Output).
  - [ ] Define JSON Schema for `GET /server/peers` (Response format).
  - [ ] Define Authentication Method for Nodes (e.g., Bearer Token vs. mTLS).
- [ ] **Shared Secrets / Environment**
  - [ ] Define mechanism for sharing `STRIPE_SECRET_KEY` between Frontend and Local Mock.
  - [ ] Define `API_TOKEN` generation strategy for VPN Nodes.

---

## 1. Frontend (`web-app`)

### 1.1. Refactoring & Setup

- [ ] **Rename Project Root**
  - [ ] Rename folder `admin-ui` -> `web-app`.
  - [ ] Update `package.json` name to `@vpnvpn/web`.
  - [ ] Update `tsconfig.json` paths if necessary.
- [ ] **Dependency Update**
  - [ ] Audit `package.json` for outdated deps.
  - [ ] Ensure `next`, `react`, `tailwindcss` are latest stable.

### 1.2. Authentication & Database

- [ ] **Prisma Schema Expansion**
  - [ ] Add `Subscription` model (stripeId, status, currentPeriodEnd, priceId).
  - [ ] Add `NotificationPreferences` model (email types).
  - [ ] Run `npx prisma db push` to sync local DB.
- [ ] **NextAuth Configuration**
  - [ ] Configure Google Provider.
  - [ ] Configure GitHub Provider.
  - [ ] Configure Email (Magic Link) Provider.
  - [ ] Customize Login Page UI (`app/auth/login/page.tsx`).

### 1.3. Billing (Stripe)

- [ ] **API Routes**
  - [ ] `POST /api/billing/checkout`: Create Stripe Checkout Session.
  - [ ] `POST /api/billing/portal`: Create Stripe Customer Portal Session.
  - [ ] `POST /api/webhooks/stripe`: Verify signature and handle events.
- [ ] **Webhook Handlers**
  - [ ] `checkout.session.completed`: Grant subscription access in DB.
  - [ ] `invoice.payment_succeeded`: Extend subscription validity.
  - [ ] `customer.subscription.deleted`: Revoke access (mark active=false).
- [ ] **UI Components**
  - [ ] Pricing Cards (Monthly/Yearly toggle).
  - [ ] Billing Settings (Show current plan, "Manage Subscription" button).

### 1.4. User Dashboard (`/dashboard`)

- [ ] **Layout**
  - [ ] Create authenticated layout shell (Sidebar, Header).
- [ ] **Overview Page**
  - [ ] Display Subscription Status (Active/Past Due/None).
  - [ ] Data Usage Graph (Mocked initially, then real).
- [ ] **VPN Configuration Flow**
  - [ ] **"Add Device" Button:** Opens Modal.
  - [ ] **Client-Side Key Gen:** Use JS lib (e.g. `tweetnacl` or `sodium-plus`) to generate WireGuard Keypair in browser.
  - [ ] **API Registration:** Call `POST /api/peers` (Proxy to Control Plane) with `publicKey`.
  - [ ] **Config Download:** Generate `.conf` file string client-side and trigger download.
  - [ ] **QR Code:** Render QR code of the config for mobile scanning.
- [ ] **Server List**
  - [ ] Fetch list from `GET /api/servers`.
  - [ ] Display Load/Ping/Region.

### 1.5. Admin Panel (`/admin`)

- [ ] **Migration**
  - [ ] Move existing admin pages to `/admin` subpath.
- [ ] **Fleet Monitor**
  - [ ] Fetch real data from Control Plane `GET /servers` (admin view).
  - [ ] Show table of Nodes: IP, Version, Last Heartbeat, Active Sessions.
  - [ ] Action: "Decommission" (Remove from DB).

---

## 2. Control Plane (`infra/pulumi`)

### 2.1. Infrastructure Definitions

- [ ] **DynamoDB Tables**
  - [ ] `VpnServers`: Partition Key `id` (String), Global Secondary Index on `status`.
  - [ ] `VpnPeers`: Partition Key `publicKey` (String), GSI on `serverId`.
- [ ] **API Gateway**
  - [ ] Define HTTP API (v2).
  - [ ] Setup CORS (Allow `web-app` domain).

### 2.2. Lambda Functions (Node.js)

- [ ] **Node Registration (`POST /server/register`)**
  - [ ] Validate `token` (Shared Secret or similar).
  - [ ] Write/Update item in `VpnServers` table.
  - [ ] Return `200 OK`.
- [ ] **Heartbeat (`POST /server/heartbeat`)**
  - [ ] Input: `{ id, stats: { sessions, bytes } }`.
  - [ ] Update `lastHeartbeat` and `metrics` in `VpnServers`.
- [ ] **Peer Sync (`GET /server/peers`)**
  - [ ] Input: `?serverId=...` (or derived from token).
  - [ ] Query `VpnPeers` table for all peers assigned to this server (or global).
  - [ ] Return list: `[{ publicKey, allowedIps }]`.
- [ ] **Add Peer (`POST /peers`)**
  - [ ] Auth: Validate JWT from Web App.
  - [ ] Input: `{ publicKey, userId, region? }`.
  - [ ] Write to `VpnPeers`.
  - [ ] (Optional) Assign to specific `serverId` based on load balancing logic.

---

## 3. VPN Server (`vpn-server` - Rust)

### 3.1. Core & CLI

- [ ] **Dependencies**
  - [ ] Add `clap` (Command Line Argument Parser).
  - [ ] Add `reqwest` (HTTP Client).
  - [ ] Add `wireguard-control` or similar (or wrapper around `wg` binary).
- [ ] **Startup Logic**
  - [ ] Parse args: `--api-url`, `--token`, `--listen-port`.
  - [ ] Check for `/etc/wireguard/privatekey`. Generate if missing.
  - [ ] Register with Control Plane (`POST /server/register`).

### 3.2. Synchronization Loop

- [ ] **Peer Fetcher**
  - [ ] Create loop (interval: 30s).
  - [ ] HTTP GET to Control Plane for allowed peers.
- [ ] **Diff & Apply**
  - [ ] Get current kernel peers (`wg show`).
  - [ ] Compare with API list.
  - [ ] **Add:** `wg set ... peer <KEY> allowed-ips ...`
  - [ ] **Remove:** `wg set ... peer <KEY> remove`
  - [ ] **Modify:** Update allowed IPs if changed.

### 3.3. Metrics & Health

- [ ] **Stats Collection**
  - [ ] Read interface transfer stats.
  - [ ] Count active handshakes (< 3 mins).
- [ ] **Reporting**
  - [ ] Send `POST /server/heartbeat` every 60s.

### 3.4. Privacy & Security

- [ ] **Audit Logging**
  - [ ] Ensure _no_ traffic logs are printed to stdout.
  - [ ] Ensure _no_ IP addresses of peers are logged.
  - [ ] Log only operational events ("Synced X peers", "Registration successful").

---

## 4. Local Development (`local`)

### 4.1. Mock Control Plane

- [ ] **Scaffold**
  - [ ] Create `local/mock-api` (Express or Fastify).
- [ ] **Endpoints**
  - [ ] Implement `POST /server/register` (Store in variable).
  - [ ] Implement `GET /server/peers` (Return mock list).
  - [ ] Implement `POST /peers` (Add to mock list).

### 4.2. Docker Compose

- [ ] **Service: Postgres**
  - [ ] Standard image, expose port 5432.
- [ ] **Service: Web App**
  - [ ] Build context `../web-app`.
  - [ ] Env vars pointing to local Postgres and Mock API.
- [ ] **Service: Mock API**
  - [ ] Build context `./mock-api`.
- [ ] **Service: VPN Node**
  - [ ] Build context `../vpn-server`.
  - [ ] Capabilities: `NET_ADMIN`.
  - [ ] Args: `--api-url http://mock-api:3000`.

### 4.3. Integration Testing

- [ ] **Shell Script (`test-flow.sh`)**
  - [ ] `docker-compose up -d`.
  - [ ] `curl` to Mock API to add a test peer.
  - [ ] Wait 30s.
  - [ ] `docker exec vpn-node wg show` -> Grep for peer key.
  - [ ] Assert peer exists.
