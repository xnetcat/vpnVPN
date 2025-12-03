# API Reference

Complete API documentation for vpnVPN services.

---

## Table of Contents

1. [Control Plane API](#control-plane-api)
2. [Metrics Service API](#metrics-service-api)
3. [Web App REST API](#web-app-rest-api)
4. [tRPC API](#trpc-api)

---

## Control Plane API

**Base URL:** `https://api.vpnvpn.com` (production) or `http://localhost:4000` (development)

### Authentication

| Method | Header | Description |
|--------|--------|-------------|
| Bearer Token | `Authorization: Bearer <token>` | For VPN node authentication |
| API Key | `x-api-key: <key>` | For web app authentication |

---

### Health Check

Check service health and database connectivity.

```
GET /health
```

**Authentication:** None

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "control-plane",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 5
    }
  }
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Service healthy |
| 503 | Service unhealthy (database connection failed) |

---

### Server Registration

Register or update a VPN server node.

```
POST /server/register
```

**Authentication:** Bearer Token

**Request Body:**

```json
{
  "id": "vpn-us-east-1-001",
  "publicKey": "base64-encoded-wireguard-public-key",
  "listenPort": 51820,
  "metadata": {
    "region": "us-east-1",
    "country": "US",
    "provider": "aws"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique server identifier |
| `publicKey` | string | Yes | WireGuard public key |
| `listenPort` | number | Yes | WireGuard listen port |
| `metadata` | object | No | Additional server metadata |

**Response:**

```json
{
  "status": "registered"
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Successfully registered |
| 401 | Invalid or missing bearer token |
| 400 | Invalid request body |

---

### Get Peers for Server

Fetch active peers assigned to a VPN server.

```
GET /server/peers?id=<server-id>
```

**Authentication:** Bearer Token

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | No | Server ID to filter peers (returns all if omitted) |

**Response:**

```json
{
  "peers": [
    {
      "public_key": "client-wireguard-public-key",
      "preshared_key": null,
      "allowed_ips": ["10.8.0.2/32"],
      "endpoint": null
    }
  ]
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Success |
| 401 | Invalid or missing bearer token |

---

### List All Servers

Get a list of all registered VPN servers with metrics.

```
GET /servers
```

**Authentication:** API Key (`x-api-key` header)

**Response:**

```json
[
  {
    "id": "vpn-us-east-1-001",
    "publicIp": "54.123.45.67",
    "metadata": {
      "region": "us-east-1",
      "country": "US"
    },
    "metrics": {
      "sessions": 42,
      "cpu": 15.5,
      "memory": 45.2
    },
    "status": "online",
    "lastSeen": "2024-01-15T10:30:00.000Z",
    "country": "US",
    "region": "us-east-1"
  }
]
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Success |
| 401 | Invalid or missing API key |

---

### Create/Update Peer

Add a new peer or update existing peer configuration.

```
POST /peers
```

**Authentication:** API Key (`x-api-key` header)

**Request Body:**

```json
{
  "publicKey": "client-wireguard-public-key",
  "userId": "user-id-from-database",
  "allowedIps": ["10.8.0.5/32"],
  "serverId": "vpn-us-east-1-001",
  "country": "US",
  "region": "us-east-1"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `publicKey` | string | Yes | Client WireGuard public key |
| `userId` | string | Yes | User ID from web app database |
| `allowedIps` | string[] | Yes | Allowed IP ranges for client |
| `serverId` | string | No | Preferred server ID |
| `country` | string | No | Country code |
| `region` | string | No | AWS region |

**Note:** Creating a new peer automatically revokes any existing active peers for the same user.

**Response:** `204 No Content`

**Status Codes:**

| Code | Description |
|------|-------------|
| 204 | Peer created/updated |
| 400 | Invalid request body |
| 401 | Invalid or missing API key |

---

### Revoke Peers for User

Revoke all active peers for a specific user.

```
POST /peers/revoke-for-user
```

**Authentication:** API Key (`x-api-key` header)

**Request Body:**

```json
{
  "userId": "user-id-from-database"
}
```

**Response:** `204 No Content`

**Status Codes:**

| Code | Description |
|------|-------------|
| 204 | Peers revoked |
| 400 | Invalid request body |
| 401 | Invalid or missing API key |

---

### Revoke Peer by Public Key

Revoke a specific peer by its public key.

```
DELETE /peers/:publicKey
```

**Authentication:** API Key (`x-api-key` header)

**URL Parameters:**

| Parameter | Description |
|-----------|-------------|
| `publicKey` | URL-encoded WireGuard public key |

**Response:** `204 No Content`

**Status Codes:**

| Code | Description |
|------|-------------|
| 204 | Peer revoked |
| 400 | Peer not found |
| 401 | Invalid or missing API key |

---

## Metrics Service API

**Base URL:** `https://metrics.vpnvpn.com` (production) or `http://localhost:4001` (development)

### Health Check

```
GET /health
```

**Authentication:** None

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "metrics",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 3
    }
  }
}
```

---

### Ingest VPN Metrics

Submit metrics from a VPN server node.

```
POST /metrics/vpn
```

**Authentication:** None (consider adding token auth in production)

**Request Body:**

```json
{
  "serverId": "vpn-us-east-1-001",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "cpu": 15.5,
  "memory": 45.2,
  "activePeers": 42,
  "region": "us-east-1"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serverId` | string | Yes | Server identifier |
| `timestamp` | string | No | ISO 8601 timestamp (defaults to now) |
| `cpu` | number | No | CPU usage percentage |
| `memory` | number | No | Memory usage percentage |
| `activePeers` | number | No | Number of active peer connections |
| `region` | string | No | AWS region |

**Response:**

```json
{
  "status": "accepted"
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 202 | Metrics accepted |
| 400 | Invalid request body |

---

## Web App REST API

**Base URL:** `https://vpnvpn.com` (production) or `http://localhost:3000` (development)

### Health Check

```
GET /api/health
```

**Authentication:** None

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "web",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 5
    },
    "controlPlane": {
      "status": "ok",
      "latencyMs": 50
    }
  }
}
```

**Status Values:**

| Status | Description |
|--------|-------------|
| `healthy` | All systems operational |
| `degraded` | Non-critical service unavailable |
| `unhealthy` | Critical service (database) unavailable |

---

### Desktop Connect

Register a device and get WireGuard configuration (for desktop app).

```
POST /api/desktop/connect
```

**Authentication:** Session cookie (NextAuth)

**Headers:**

| Header | Description |
|--------|-------------|
| `x-vpn-private-key` | Client WireGuard private key |

**Request Body:**

```json
{
  "publicKey": "client-wireguard-public-key",
  "deviceName": "My MacBook",
  "serverId": "vpn-us-east-1-001"
}
```

**Response:**

```json
{
  "config": "[Interface]\nPrivateKey = ...\nAddress = 10.8.0.5/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = ...\nAllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = vpn.vpnvpn.com:51820\n"
}
```

**Error Responses:**

| Code | Error | Description |
|------|-------|-------------|
| 401 | `unauthenticated` | No valid session |
| 402 | `payment_required` | No active subscription |
| 400 | `missing_keys` | Missing public or private key |
| 403 | `device_limit` | Device limit reached |
| 500 | `control_plane_error` | Failed to register with control plane |

---

### Stripe Webhook

Handle Stripe billing events.

```
POST /api/webhooks/stripe
```

**Authentication:** Stripe signature (`stripe-signature` header)

**Handled Events:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create subscription, send welcome email |
| `customer.subscription.created` | Create/update subscription record |
| `customer.subscription.updated` | Update subscription status/tier |
| `customer.subscription.deleted` | Revoke VPN access, send cancellation email |

**Response:**

```json
{
  "received": true
}
```

---

## tRPC API

**Base URL:** `/api/trpc` (via Next.js API routes)

All tRPC procedures use SuperJSON transformer for type-safe data serialization.

### Procedure Types

| Type | Description |
|------|-------------|
| `publicProcedure` | No authentication required |
| `protectedProcedure` | Requires authenticated session |
| `paidProcedure` | Requires active subscription |
| `adminProcedure` | Requires admin role |

---

### Device Router (`device.*`)

#### `device.list`

**Type:** Query (paidProcedure)

**Description:** List all devices for the current user.

**Response:**

```typescript
Array<{
  id: string;
  userId: string;
  publicKey: string;
  name: string;
  serverId: string | null;
  createdAt: Date;
  updatedAt: Date;
}>
```

---

#### `device.register`

**Type:** Mutation (paidProcedure)

**Description:** Register a new device and generate WireGuard config.

**Input:**

```typescript
{
  name: string;        // Device name (min 1 char)
  serverId?: string;   // Optional server preference
}
```

**Response:**

```typescript
{
  deviceId: string;
  assignedIp: string;
  publicKey: string;
  privateKey: string;
}
```

**Errors:**

| Code | Message |
|------|---------|
| `FORBIDDEN` | Device limit reached |
| `INTERNAL_SERVER_ERROR` | Control plane registration failed |

---

#### `device.revoke`

**Type:** Mutation (paidProcedure)

**Description:** Revoke and delete a device.

**Input:**

```typescript
{
  deviceId: string;
}
```

**Response:**

```typescript
{
  success: true;
}
```

---

### Billing Router (`billing.*`)

#### `billing.createCheckoutSession`

**Type:** Mutation (protectedProcedure)

**Description:** Create a Stripe Checkout session for subscription.

**Input:**

```typescript
{
  priceId?: string;  // Optional, defaults to Pro tier
}
```

**Response:**

```typescript
{
  url: string;  // Stripe Checkout URL
}
```

---

#### `billing.createPortalSession`

**Type:** Mutation (protectedProcedure)

**Description:** Create a Stripe Customer Portal session.

**Response:**

```typescript
{
  url: string;  // Stripe Portal URL
}
```

---

### Servers Router (`servers.*`)

#### `servers.list`

**Type:** Query (paidProcedure)

**Description:** List available VPN servers with status.

**Response:**

```typescript
Array<{
  id: string;
  region: string;
  country?: string;
  status: "online" | "offline" | "unknown";
  sessions: number;
  cpu?: number;
  lastSeen?: string;
}>
```

---

### Proxies Router (`proxies.*`)

#### `proxies.list`

**Type:** Query (paidProcedure)

**Description:** List available proxy servers.

**Response:**

```typescript
Array<{
  proxyId: string;
  type: string;
  ip: string;
  port: number;
  latency?: number;
  score?: number;
  country?: string;
}>
```

---

### Account Router (`account.*`)

#### `account.get`

**Type:** Query (protectedProcedure)

**Description:** Get account details including subscription and preferences.

**Response:**

```typescript
{
  subscription: {
    id: string;
    stripeSubscriptionId: string;
    status: string;
    tier: "basic" | "pro" | "enterprise";
    currentPeriodEnd: Date | null;
  } | null;
  user: {
    name: string | null;
    email: string | null;
  } | null;
  notificationPreferences: {
    marketing: boolean;
    transactional: boolean;
    security: boolean;
  } | null;
}
```

---

#### `account.updateProfile`

**Type:** Mutation (protectedProcedure)

**Description:** Update user profile.

**Input:**

```typescript
{
  name?: string | null;  // 1-255 characters
}
```

**Response:**

```typescript
{
  success: true;
}
```

---

#### `account.updateNotifications`

**Type:** Mutation (protectedProcedure)

**Description:** Update notification preferences.

**Input:**

```typescript
{
  marketing: boolean;
  transactional: boolean;
  security: boolean;
}
```

**Response:**

```typescript
{
  success: true;
}
```

---

### Admin Router (`admin.*`)

#### `admin.listServers`

**Type:** Query (adminProcedure)

**Description:** List all VPN servers (admin view).

**Response:** Same as `servers.list` but includes all servers regardless of status.

---

#### `admin.listTokens`

**Type:** Query (adminProcedure)

**Description:** List all VPN node tokens.

**Response:**

```typescript
Array<{
  token: string;
  label: string;
  active: boolean;
  usageCount: number;
  createdAt: Date;
}>
```

---

#### `admin.createToken`

**Type:** Mutation (adminProcedure)

**Description:** Create a new VPN node token.

**Input:**

```typescript
{
  label: string;  // Min 1 character
}
```

**Response:**

```typescript
{
  token: string;
  label: string;
}
```

---

#### `admin.revokeToken`

**Type:** Mutation (adminProcedure)

**Description:** Revoke a VPN node token.

**Input:**

```typescript
{
  token: string;
}
```

**Response:**

```typescript
{
  success: true;
}
```

---

### Desktop Router (`desktop.*`)

#### `desktop.resolveCode`

**Type:** Mutation (publicProcedure)

**Description:** Resolve a 6-digit desktop login code to auth URL.

**Input:**

```typescript
{
  email: string;  // Valid email
  code: string;   // 6 characters
}
```

**Response:**

```typescript
{ ok: true; url: string; } | { ok: false; }
```

---

#### `desktop.serverPubkey`

**Type:** Query (publicProcedure)

**Description:** Get VPN server public key from node admin API.

**Response:**

```typescript
{
  publicKey: string | null;
}
```

---

## Error Handling

### tRPC Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `BAD_REQUEST` | 400 | Invalid input |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

### Rate Limits

| Endpoint Category | Limit |
|-------------------|-------|
| Read operations | 100 req/min |
| Write operations | 20 req/min |
| Authentication | 10 req/min |

See `TROUBLESHOOTING.md` for error resolution guidance.




