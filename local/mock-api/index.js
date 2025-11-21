const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;

app.use(bodyParser.json());

// Serve dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// In-memory store
let servers = new Map(); // pubKey -> { listen_port, last_seen }
let peers = []; // Array of PeerSpec
const DEV_TOKEN = process.env.DEV_TOKEN || 'dev-token';
const API_KEY = process.env.API_KEY || 'dev-web-api-key';

// Middleware to log requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// POST /server/register
// Expected body: { "public_key": "...", "listen_port": 51820 }
app.post('/server/register', (req, res) => {
  const { public_key, listen_port } = req.body;

  if (!public_key || !listen_port) {
    console.error('Invalid registration request:', req.body);
    return res.status(400).send('Missing public_key or listen_port');
  }

  servers.set(public_key, {
    listen_port,
    last_seen: new Date(),
    ip: req.ip
  });

  console.log(`Registered server: ${public_key} (Port: ${listen_port})`);
  res.status(200).json({ status: 'registered' });
});

// GET /server/peers
// Returns list of allowed peers for the calling server
app.get('/server/peers', (req, res) => {
  // In a real system, we'd filter by what this specific server needs.
  // For mock/local, we just return all configured peers.
  
  // Simulate the structure expected by Rust: { "peers": [...] }
  res.json({ peers });
});

// POST /peers
// Used by web-app to add a peer
app.post('/peers', (req, res) => {
  const { publicKey, userId, allowedIps } = req.body;

  if (!publicKey || !userId || !allowedIps) {
    console.error('Invalid add peer request:', req.body);
    return res.status(400).send('Missing required fields');
  }

  // Convert camelCase to snake_case for internal storage if needed, 
  // but let's keep it consistent with what we store.
  // Our internal 'peers' array uses: { public_key, allowed_ips, ... }
  // The web-app sends camelCase.
  
  const newPeer = {
    public_key: publicKey,
    allowed_ips: allowedIps,
    user_id: userId, // Store user ID for revocation
    created_at: new Date()
  };

  peers.push(newPeer);
  console.log(`Added peer via web-app: ${publicKey} (User: ${userId})`);
  res.status(200).json({ status: 'added' });
});

// POST /peers/revoke-for-user
// Used by web-app to revoke all peers for a user
app.post('/peers/revoke-for-user', (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).send('Missing userId');
  }

  const initialCount = peers.length;
  peers = peers.filter(p => p.user_id !== userId);
  const removedCount = initialCount - peers.length;

  console.log(`Revoked ${removedCount} peers for user: ${userId}`);
  res.status(200).json({ status: 'revoked', count: removedCount });
});

// DELETE /peers/:publicKey
// Used by web-app to revoke a specific peer
app.delete('/peers/:publicKey', (req, res) => {
  const publicKey = decodeURIComponent(req.params.publicKey);
  
  const initialCount = peers.length;
  peers = peers.filter(p => p.public_key !== publicKey);
  
  if (peers.length < initialCount) {
    console.log(`Revoked peer: ${publicKey}`);
    res.status(200).json({ status: 'revoked' });
  } else {
    res.status(404).send('Peer not found');
  }
});

// Test Helper: POST /test/add-peer
// Body: PeerSpec object
app.post('/test/add-peer', (req, res) => {
  const peer = req.body;
  // Basic validation
  if (!peer.public_key || !peer.allowed_ips) {
      return res.status(400).send("Invalid peer spec");
  }
  
  peers.push(peer);
  console.log('Added test peer:', peer);
  res.status(200).json({ status: 'added', current_count: peers.length });
});

// Test Helper: GET /test/servers
app.get('/test/servers', (req, res) => {
  res.json(Array.from(servers.entries()));
});

// Test Helper: GET /test/info - Complete system status and connection info
app.get('/test/info', (req, res) => {
  const serverList = Array.from(servers.entries()).map(([pubkey, data]) => ({
    public_key: pubkey,
    listen_port: data.listen_port,
    last_seen: data.last_seen,
    ip: data.ip,
    status: isServerOnline(data.last_seen) ? 'online' : 'offline'
  }));

  const info = {
    timestamp: new Date().toISOString(),
    environment: 'local-dev',
    control_plane: {
      url: `http://localhost:${port}`,
      api_key: API_KEY,
      status: 'running'
    },
    vpn_servers: {
      registered: serverList.length,
      servers: serverList
    },
    peers: {
      configured: peers.length,
      list: peers
    },
    connection_info: {
      token: DEV_TOKEN,
      endpoints: {
        register: `POST http://localhost:${port}/server/register`,
        peers: `GET http://localhost:${port}/server/peers`,
        add_peer: `POST http://localhost:${port}/test/add-peer`
      }
    },
    admin_endpoints: serverList.map(srv => ({
      server: srv.public_key.substring(0, 16) + '...',
      health: `http://localhost:9090/health`,
      status: `http://localhost:9090/status`,
      metrics: `http://localhost:9090/metrics`
    })),
    quick_start: {
      add_test_peer: {
        command: `curl -X POST http://localhost:${port}/test/add-peer -H 'Content-Type: application/json' -d '{"public_key":"CLIENT_PUBKEY","allowed_ips":["10.8.0.2/32"]}'`,
        description: "Add a test peer to connect to the VPN"
      },
      check_admin: {
        command: `curl http://localhost:9090/status`,
        description: "Check VPN server status and active sessions"
      },
      view_peers: {
        command: `curl http://localhost:${port}/server/peers`,
        description: "View all configured peers"
      }
    }
  };

  res.json(info);
});

// Test Helper: GET /test/status - Simple status check
app.get('/test/status', (req, res) => {
  const onlineServers = Array.from(servers.values())
    .filter(srv => isServerOnline(srv.last_seen)).length;

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    servers_registered: servers.size,
    servers_online: onlineServers,
    peers_configured: peers.length,
    uptime_seconds: Math.floor(process.uptime())
  });
});

// Helper function to check if server is online (last seen within 60s)
function isServerOnline(lastSeen) {
  const now = new Date();
  const diff = (now - new Date(lastSeen)) / 1000; // seconds
  return diff < 60;
}

// Root endpoint with welcome message
app.get('/', (req, res) => {
  res.json({
    service: 'vpnVPN Mock Control Plane',
    version: '1.0.0-local',
    endpoints: {
      info: '/test/info',
      status: '/test/status',
      servers: '/test/servers',
      register: 'POST /server/register',
      peers: 'GET /server/peers',
      add_peer: 'POST /test/add-peer'
    }
  });
});

app.listen(port, () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          vpnVPN Mock Control Plane API                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`✅ Server running on port ${port}`);
  console.log('');
  console.log('📊 Dashboard:       http://localhost:' + port + '/dashboard');
  console.log('ℹ️  System Info:     http://localhost:' + port + '/test/info');
  console.log('🔍 Status:          http://localhost:' + port + '/test/status');
  console.log('');
});

