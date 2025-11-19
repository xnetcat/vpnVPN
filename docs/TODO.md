# Agent Communication & Task Board

**Status Legend:**
- [ ] Pending
- [/] In Progress
- [x] Completed

---

## 🚨 Critical Integration Points
*Items here require coordination between agents.*

- [ ] **API Contract:** Agent 2 (Control Plane) must finalize the JSON schema for `/server/peers` before Agent 3 (Rust) can implement the sync loop.
- [ ] **Auth Token:** Agent 1 (Frontend) needs to know how to generate/display the "Server Join Token" that Agent 3 (Rust) uses to register.
- [ ] **Billing Webhook:** Agent 1 (Frontend) needs the Stripe Secret which Agent 4 (Local) must mock or provide in env.

---

## 1. Frontend (Agent 1) Tasks
- [ ] Rename `admin-ui` folder to `web-app`.
- [ ] Update `package.json` name to `vpnvpn-web`.
- [ ] Update `schema.prisma` with `Subscription` model.
- [ ] Create `/dashboard` page skeleton.
- [ ] Implement "Generate WireGuard Config" UI (pure JS key generation).

## 2. Control Plane (Agent 2) Tasks
- [ ] Create `VpnServers` DynamoDB table definition in Pulumi.
- [ ] Create `VpnPeers` DynamoDB table definition in Pulumi.
- [ ] Implement `POST /server/register` Lambda.
- [ ] Implement `GET /server/peers` Lambda.

## 3. VPN Server (Agent 3) Tasks
- [ ] Add `clap` dependency to `Cargo.toml`.
- [ ] Implement CLI argument parsing (`--api-url`, `--token`).
- [ ] Create HTTP Client struct for communicating with Control Plane.
- [ ] Implement `apply_peers` logic for WireGuard (using `wg` command or library).

## 4. Local Dev (Agent 4) Tasks
- [ ] Create `local/mock-api/` project (Express.js).
- [ ] Write `local/compose.yaml` including Postgres and Mock API.
- [ ] Create `test-flow.sh` script foundation.

