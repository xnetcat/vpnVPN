# vpnVPN — Project Documentation and Specification

## 1. Executive Summary

vpnVPN is a privacy-focused, verified-data-flow VPN SaaS platform. It provides a complete solution for selling and managing VPN access, featuring a modern frontend for users and admins, a robust control plane, and autonomous VPN server nodes that can run on any infrastructure (EC2, VPS, bare metal).

Key Pillars:

- **Privacy & Security:** No traffic logging, strong encryption (WireGuard, OpenVPN, IKEv2), verifiable data flow.
- **Universal Deployment:** VPN nodes are infrastructure-agnostic and self-registering.
- **User Experience:** Seamless frontend for purchasing subscriptions and managing connections.
- **Transparency:** Open-source architecture with verifiable components.

## 2. Architecture Overview

### 2.1 Frontend App (`web-app`)

A full-stack Next.js SaaS application hosted on **Vercel**.

- **Roles:**
  - **Public:** Landing page, Pricing, Features, Sign-up/Login.
  - **User:** Dashboard to view subscription status, select servers, generate VPN configs (QR code/file), view usage history.
  - **Admin:** Secure panel to manage users, view revenue, and manage the server fleet (add/remove/monitor nodes).
- **SaaS Features:**
  - **Authentication:** NextAuth.js with SSO (Google, GitHub) and Magic Links.
  - **Billing:** Stripe Subscriptions (Checkout & Portal).
  - **Notifications:** Transactional emails (Welcome, Invoice, Usage Limits) via Resend/SendGrid.
  - **Entitlements:** Role-based access control (RBAC) and subscription-gated features.
- **Tech Stack:** Next.js 14+ App Router, TailwindCSS, Prisma (PostgreSQL), NextAuth.js, Stripe, Recharts.
- **Deployment:** Vercel (Middleware, Serverless Functions).

### 2.2 Control Plane (Backend)

The central brain managing the fleet and users.

- **Functions:**
  - **Server Registry:** API for VPN nodes to register and heartbeat.
  - **Peer Management:** Distributes allowed peer configurations to relevant VPN nodes.
  - **Billing & Auth:** Webhooks for Stripe, user session management.
- **Infrastructure:** **AWS Serverless** (API Gateway + Lambda + DynamoDB). Deployed via Pulumi.

### 2.3 VPN Server (Data Plane)

A portable, autonomous Rust-based agent that manages the actual VPN protocols.

- **Capabilities:**
  - **Self-Registration:** On startup, connects to Control Plane to register availability.
  - **Dynamic Configuration:** Periodically fetches or receives updates for allowed peers (public keys) and applies them to WireGuard/OpenVPN interfaces.
  - **Monitoring:** Reports health and anonymized metrics (connected session count, bandwidth) to Control Plane.
  - **Multi-Protocol:** WireGuard (priority), OpenVPN, IKEv2.
- **Deployment:** Docker container or binary. Runs on EC2, VPS (DigitalOcean, Hetzner), or home servers.
- **Configuration:** configured via CLI arguments (no .env files).

## 3. Technical Specifications

### 3.1 Privacy & Verification

- **No Logging:** Server configuration must explicitly disable traffic logging.
- **Minimal Metadata:** Only track active session count and aggregate bandwidth for billing/fair-use limits. No IP logging.
- **Encryption:**
  - WireGuard: ChaCha20-Poly1305.
  - OpenVPN: AES-256-GCM.

### 3.2 Data Model (Draft)

- **User:** `id`, `email`, `subscriptionStatus`, `plan`, `stripeCustomerId`.
- **Device/Peer:** `id`, `userId`, `publicKey`, `allowedIPs`.
- **Server:** `id`, `region`, `ipAddress`, `load`, `status`, `protocols`.

### 3.3 VPN Server Logic

The Rust server is the critical component for enforcement.

1.  **Startup:** Parse CLI args (`--api-url`, `--token`, `--public-ip`).
2.  **Register:** POST `/server/register` to Control Plane.
3.  **Loop:**
    - Heartbeat (every 10s).
    - Fetch Peers (every 30s or via push): Get list of `{ public_key, allowed_ip }` for this node.
    - **Sync:** Update WireGuard interface peers to match the list exactly (remove revoked, add new).
    - **Metrics:** Collect bytes sent/received (for user quotas) and report to API.

### 3.4 Infrastructure as Code

- **Pulumi (TypeScript):**
  - **Global:** Control Plane resources (DynamoDB, API Gateway, ECR).
  - **Region (optional):** AWS-specific auto-scaling groups (legacy support, moving towards agnostic nodes).

## 4. System Architecture & Data Flow

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant F as Web App (Next.js on Vercel)
    participant DB as Postgres (User Data)
    participant S as Stripe
    participant CP as Control Plane API (AWS Lambda/DynamoDB)
    participant VPN as VPN Server (Rust)
    participant WG as WireGuard Interface

    Note over U, S: **1. User Subscription Flow**
    U->>F: Sign Up / Login (SSO)
    U->>F: Purchase Subscription
    F->>S: Create Checkout Session
    S-->>U: Redirect to Payment
    U->>S: Complete Payment
    S->>F: Webhook (subscription.created)
    F->>DB: Update User (active=true)
    F->>U: Email Notification (Welcome)

    Note over U, VPN: **2. Peer Provisioning Flow**
    U->>F: Dashboard -> "Add Device"
    F->>F: Generate Client Keypair (JS)
    F->>CP: POST /peers { publicKey, userId }
    CP->>DB: Store Peer (dynamo)
    F-->>U: Download .conf / QR Code

    Note over VPN, CP: **3. VPN Server Registration & Sync**
    VPN->>VPN: Startup (CLI Args)
    VPN->>CP: POST /server/register { ip, pubKey }
    CP->>DB: Update Server Status (Online)

    loop Every 30s
        VPN->>CP: GET /server/peers
        CP->>DB: Fetch Allowed Peers for Server
        CP-->>VPN: List [ { pubKey, allowedIP } ... ]
        VPN->>WG: Apply Diff (Add new, Remove old)
    end

    Note over VPN, CP: **4. Monitoring & Usage**
    loop Every 1m
        VPN->>WG: Collect Stats (Bytes, Sessions)
        VPN->>CP: POST /server/heartbeat { stats }
        CP->>DB: Update Metrics
    end

    Note over U, WG: **5. Connection**
    U->>WG: Connect (UDP 51820)
    WG->>WG: Handshake (Authenticated by Public Key)
    WG-->>U: Traffic Flowing
```

## 5. Development Plan

### 5.1 Phase 1: Foundation & Rework

- Convert `admin-ui` to `web-app`.
- Define strict API contract between Control Plane and VPN Server.
- Implement "Self-Registration" logic in Rust server.

### 5.2 Phase 2: Frontend & Billing

- Implement User Dashboard with SSO and Stripe.
- Implement Admin Panel for server management.
- Add transactional emails.

### 5.3 Phase 3: VPN Core Enhancements

- Implement `apply_peers` for WireGuard in Rust.
- Add OpenVPN support.
- Add "No Logging" verification tests.

### 5.4 Phase 4: Local Dev & Testing

- `docker-compose` setup mimicking the full stack.
- Mock Control Plane for local VPN server testing.

## 6. Operational Runbooks

- **Adding a Node:** Simply spin up a VPS, run the Docker container with the correct API token. It appears in the Admin Panel. Admin approves it (optional security step) and it starts accepting traffic.
- **User Ban:** Revoke subscription in Stripe -> Webhook updates DB -> Server fetches new peer list (user missing) -> VPN access cut instantly.
