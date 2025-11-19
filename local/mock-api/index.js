const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 8080;

app.use(bodyParser.json());

// In-memory store
let servers = new Map(); // pubKey -> { listen_port, last_seen }
let peers = []; // Array of PeerSpec

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

app.listen(port, () => {
  console.log(`Mock API listening on port ${port}`);
});

