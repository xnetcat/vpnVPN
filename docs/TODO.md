# Detailed Task Board & Roadmap

**Status Legend:**

- [ ] Pending
- [/] In Progress
- [x] Completed

---

## 🚨 Critical Integration Milestones

_These tasks block multiple streams of work._

- [ ] **API Contract Finalization**
  - [ ] Formalize request/response JSON for `POST /server/register`, `POST /server/heartbeat`, `GET /server/peers`, `POST /peers`, and `/proxies` endpoints.
  - [ ] Define authentication for nodes (signed tokens from `vpnTokens`) and for web-app calls (internal key or signed JWT).
- [ ] **Secrets / Environment**
  - [ ] Document how Stripe, email provider, and control-plane secrets are stored in Vercel / AWS (no secrets in git).
  - [ ] Document how `vpn-server` is configured via CLI + env (no `.env` files required).

---

## 1. Frontend (`web-app`)

### 1.1. Foundation & Dependencies

- [ ] **Project Identity**
  - [ ] Ensure project name is `@vpnvpn/web` and references to `admin-ui` are removed from docs and configs.
- [ ] **Dependency Update**
  - [ ] Audit `package.json` for outdated deps.
  - [ ] Ensure `next`, `react`, `tailwindcss`, Prisma, and Auth.js are on latest stable versions.

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
  - [ ] **API Registration:** Call `POST /api/peers` (proxy to control plane) with `publicKey` and desired region/server.
  - [ ] **Config Download:** Generate `.conf` file string client-side and trigger download.
  - [ ] **QR Code:** Render QR code of the config for mobile scanning.
- [ ] **Server List**
  - [ ] Fetch list from `GET /api/servers`.
  - [ ] Display Load/Ping/Region.

### 1.5. Admin Panel (`/admin`)

- [ ] **Admin Scope & Security**
  - [ ] Add admin flag/role on `User` model and protect `/admin` routes based on it.
  - [ ] Ensure all admin pages require paid + admin access.
- [ ] **Fleet Monitor**
  - [ ] Fetch node data from control-plane (DynamoDB-backed) instead of EC2-only view.
  - [ ] Show table of nodes: id, region, status, last heartbeat, active sessions.
  - [ ] Actions: decommission node (mark offline) and view node metadata.
- [ ] **Token Management**
  - [ ] Admin can create and revoke node registration tokens (backed by `vpnTokens`).
  - [ ] UI shows which nodes registered with which token.

---

## 2. Control Plane (`infra/pulumi`)

### 2.1. Infrastructure Definitions

- [ ] **DynamoDB Tables**
  - [ ] `VpnServers`: Partition Key `id` (String), Global Secondary Index on `status`.
  - [ ] `VpnPeers`: Partition Key `publicKey` (String), GSI on `serverId`.
- [ ] **API Gateway**
  - [ ] Define HTTP API (v2).
  - [ ] Setup CORS (Allow `web-app` domain).

### 2.2. Lambda Functions (Node.js, container-based)

- [ ] **Containerization**
  - [ ] Extract each Lambda into a dedicated TypeScript handler file.
  - [ ] Add Dockerfiles to build Node 20 images for these handlers and push to ECR.
  - [ ] Replace `CallbackFunction` with `aws.lambda.Function` using `packageType: "Image"`.
- [ ] **Node Registration (`POST /server/register`)**
  - [ ] Validate bearer token against `vpnTokens`.
  - [ ] Write/update item in `vpnServers` table.
  - [ ] Return `200 OK` with minimal metadata.
- [ ] **Heartbeat (`POST /server/heartbeat`)**
  - [ ] Input: `{ id, metrics: { sessions, bytesPerProtocol } }`.
  - [ ] Update `lastSeen` and `metrics` in `vpnServers`.
- [ ] **Peer Sync (`GET /server/peers`)**
  - [ ] Authenticate node and derive `serverId`.
  - [ ] Query `vpnPeers` for peers assigned to this server.
  - [ ] Return list: `[{ publicKey, allowedIps, endpoint? }]`.
- [ ] **Add Peer (`POST /peers`)**
  - [ ] Auth: internal API key or signed JWT from web-app.
  - [ ] Input: `{ publicKey, userId, region?, allowedIps }`.
  - [ ] Write to `vpnPeers` and assign to a server based on load-balancing policy.

---

## 3. VPN Server (`vpn-server` - Rust)

### 3.1. Core & CLI

- [ ] **CLI Shape**
  - [ ] Implement `vpn-server run` subcommand with flags/env for `--api-url`, `--token`, `--listen-port`, and enabled protocols.
  - [ ] Implement `vpn-server doctor` subcommand.
- [ ] **Startup Logic**
  - [ ] Generate/load WireGuard key material and base config.
  - [ ] Register with control plane (`POST /server/register`).

### 3.2. Synchronization Loop

- [ ] **Peer Fetcher**
  - [ ] Create loop (interval: 30s) that calls control-plane `GET /server/peers`.
- [ ] **Diff & Apply**
  - [ ] Get current peers from WireGuard/OpenVPN/IPsec.
  - [ ] Compare with API list and add/remove/modify peers accordingly.

### 3.3. Metrics & Health

- [ ] **Stats Collection**
  - [ ] Read interface transfer stats and active handshakes per protocol.
- [ ] **Reporting**
  - [ ] Send `POST /server/heartbeat` every 60s and publish CloudWatch metrics.

### 3.4. Privacy & Security

- [ ] **Audit Logging**
  - [ ] Ensure no traffic logs or client IPs are printed.
  - [ ] Log only aggregate counts and operational events.

---

## 4. Local Development (`local`)

### 4.1. LocalStack Control Plane

- [ ] **Services**
  - [ ] Run LocalStack for DynamoDB, Lambda, and API Gateway.
  - [ ] Apply Pulumi control-plane stack against LocalStack.

### 4.2. Docker Compose

- [ ] **Service: Postgres**
  - [ ] Standard image, expose port 5432.
- [ ] **Service: Web App**
  - [ ] Build context `../web-app`.
  - [ ] Env vars pointing to local Postgres and LocalStack-hosted control plane.
- [ ] **Service: VPN Node**
  - [ ] Build context `../vpn-server`.
  - [ ] Capabilities: `NET_ADMIN`, TUN device.
  - [ ] CLI args: `--api-url http://control-plane/...` matching LocalStack gateway.

### 4.3. Integration Testing

- [ ] **Shell Script (`test-flow.sh`)**
  - [ ] Bring up Docker stack.
  - [ ] Drive a real user → subscription → device → peer registration flow via `web-app`.
  - [ ] Wait for node sync and verify peers in WireGuard config inside container.
