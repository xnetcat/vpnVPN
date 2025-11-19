# Agent Roles and Instructions

This document defines the specific roles, responsibilities, and prompt instructions for the autonomous agents working on the vpnVPN project.

## 1. Agent 1: Frontend & Business Logic (Web App)

**Focus:** User Experience, Billing, Dashboard, PostgreSQL Data.
**Working Directory:** `web-app/` (formerly `admin-ui/`)

### Key Responsibilities
- **Refactoring:** Rename `admin-ui` to `web-app` and update all internal references.
- **Data Model:** Manage `schema.prisma`. Note: Only store User/Account/Subscription data here. VPN configuration data belongs to the Control Plane.
- **User Dashboard:** Build the `/dashboard` route for users to manage subscriptions and generate VPN configs.
- **Admin Dashboard:** Build the `/admin` route for fleet management.
- **Integrations:** Stripe (Billing), NextAuth (Authentication), Control Plane API (Fetching servers/peers).

### Constraints
- **Do not** access the Rust code.
- **Do not** modify Pulumi infrastructure directly (only interface with it via API definitions).
- **Stack:** Next.js 14+, TailwindCSS, Prisma, Postgres.

---

## 2. Agent 2: Control Plane (Backend/Infrastructure)

**Focus:** API Gateway, Lambda, DynamoDB, Fleet Coordination.
**Working Directory:** `infra/pulumi/`

### Key Responsibilities
- **API Definition:** Implement the REST API that coordinates the system.
- **DynamoDB Schema:** Manage `VpnServers` and `VpnPeers` tables.
- **Endpoints:**
  - `POST /server/register`: Node registration.
  - `GET /server/peers`: Peer synchronization for nodes.
  - `POST /peers`: Frontend adding a new user device.
  - `POST /server/heartbeat`: Health checks.
- **Security:** Ensure API endpoints are secured (API Keys for servers, JWT/Auth for frontend).

### Constraints
- **Performance:** Lambdas must be lightweight (Node.js 20.x).
- **State:** Stateless computation; all state in DynamoDB.

---

## 3. Agent 3: VPN Server Core (Rust)

**Focus:** Networking, WireGuard/OpenVPN, Systems Programming.
**Working Directory:** `vpn-server/`

### Key Responsibilities
- **Autonomy:** Remove `userdata` dependency. Make the binary configurable via CLI args (`--token`, `--api-url`).
- **Registration:** Implement the startup handshake with the Control Plane.
- **Sync Loop:** The critical feature. Periodically fetch peers from Control Plane and apply them to the kernel interface.
- **Privacy:** Ensure strict "No Logging" of traffic data.
- **Metrics:** Report anonymized usage stats to Control Plane.

### Constraints
- **Safety:** Use Rust's safety guarantees.
- **OS:** Target Linux (Debian/Alpine).
- **Dependencies:** Minimal. `clap` for args, `reqwest` for API, `netlink`/`wg` for kernel interaction.

---

## 4. Agent 4: Local Dev & Testing (Integration)

**Focus:** Developer Experience, Docker Compose, End-to-End Testing.
**Working Directory:** `local/`

### Key Responsibilities
- **Mocking:** Create a `mock-control-plane` container (Node/Go) that mimics the AWS Lambda API for local testing.
- **Orchestration:** `docker-compose.yml` that brings up Postgres, Web App, Mock Control Plane, and a VPN Node.
- **Verification:** Write scripts (`test-flow.sh`) that simulate a full user journey: Signup -> Get Config -> Connect -> Ping.

### Constraints
- **Environment:** Must run on standard Docker (Linux/Mac).
- **Privilege:** VPN Node container requires `NET_ADMIN`.

