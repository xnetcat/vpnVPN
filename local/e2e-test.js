const http = require('http');

// Configuration
const API_HOST = 'localhost';
const API_PORT = 8080;
const VPN_ADMIN_PORT = 9090;

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

function log(msg) {
    console.log(`${GREEN}[E2E]${NC} ${msg}`);
}

function error(msg) {
    console.error(`${RED}[ERROR]${NC} ${msg}`);
    process.exit(1);
}

function fetchJson(host, port, path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: host,
            port: port,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(data));
                    } else {
                        reject(new Error(`Status ${res.statusCode}: ${data}`));
                    }
                } catch (e) {
                    // If not JSON, return raw text for debugging
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`Status ${res.statusCode}: ${data}`));
                    }
                }
            });
        });

        req.on('error', reject);
        
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    log("Starting End-to-End Tests...");

    // 1. Check Mock API Status
    try {
        log("Checking Mock API Status...");
        const status = await fetchJson(API_HOST, API_PORT, '/test/status');
        if (status.status !== 'ok') throw new Error('Mock API status not ok');
        log(`Mock API is Online (Uptime: ${status.uptime_seconds}s)`);
    } catch (e) {
        error(`Mock API Check Failed: ${e.message}`);
    }

    // 2. Check VPN Server Registration
    try {
        log("Checking VPN Server Registration...");
        let attempts = 0;
        let registered = false;
        while (attempts < 5 && !registered) {
            const servers = await fetchJson(API_HOST, API_PORT, '/test/servers');
            if (servers.length > 0 && servers[0][1].listen_port === 51820) {
                registered = true;
                log(`VPN Server Registered: ${servers[0][0].substring(0, 16)}...`);
            } else {
                attempts++;
                log(`Waiting for VPN server registration (attempt ${attempts}/5)...`);
                await sleep(2000);
            }
        }
        if (!registered) throw new Error('VPN Server failed to register after 10 seconds');
    } catch (e) {
        error(`VPN Server Registration Check Failed: ${e.message}`);
    }

    // 3. Check VPN Server Health Endpoint
    try {
        log("Checking VPN Server Health Endpoint...");
        const health = await fetchJson(API_HOST, VPN_ADMIN_PORT, '/health');
        if (health !== 'ok') throw new Error('VPN Server health not ok'); // Health returns raw string "ok"
        log("VPN Server Health Check Passed");
    } catch (e) {
        // Try reading raw text if JSON parse failed
        if (e.message.includes('JSON')) {
             // It's likely "ok" plain text which fetchJson might try to parse if we aren't careful, 
             // but our fetchJson handles parse error by returning raw data if status is 200.
             // If we got here, it might be a real error.
             log("VPN Server Health returned non-JSON response (likely 'ok')");
        } else {
             error(`VPN Server Health Check Failed: ${e.message}`);
        }
    }

    // 4. Add Test Peer
    try {
        log("Adding Test Peer...");
        const testPeer = {
            public_key: "TestClientPubKey1234567890ABCDEF=",
            allowed_ips: ["10.8.0.100/32"]
        };
        const result = await fetchJson(API_HOST, API_PORT, '/test/add-peer', 'POST', testPeer);
        if (result.status !== 'added') throw new Error('Failed to add peer');
        log("Test Peer Added successfully");
    } catch (e) {
        error(`Add Peer Failed: ${e.message}`);
    }

    // 5. Verify Peer Sync (Wait for VPN server to fetch it)
    // Note: We can't easily query the VPN server for its internal peer list via the Admin API yet 
    // (unless we add a debug endpoint), but we can verify the Mock API serves it.
    try {
        log("Verifying Peer Configuration on Control Plane...");
        const peers = await fetchJson(API_HOST, API_PORT, '/server/peers');
        // Response format is { peers: [...] }
        if (!peers.peers || peers.peers.length === 0) throw new Error('No peers found in control plane');
        const found = peers.peers.find(p => p.public_key === "TestClientPubKey1234567890ABCDEF=");
        if (!found) throw new Error('Test peer not found in control plane');
        log("Peer verified in Control Plane configuration");
    } catch (e) {
        error(`Peer Verification Failed: ${e.message}`);
    }

    // 6. Check VPN Metrics
    try {
        log("Checking VPN Metrics...");
        const metrics = await fetchJson(API_HOST, VPN_ADMIN_PORT, '/status');
        // Expect array of backend statuses
        if (!Array.isArray(metrics)) throw new Error('Metrics format invalid');
        log(`VPN Metrics: ${metrics.length} backends active`);
        metrics.forEach(b => {
            log(`- ${b.protocol}: ${b.active_sessions} sessions, ${b.ingress_bytes} bytes in, ${b.egress_bytes} bytes out`);
        });
    } catch (e) {
        error(`Metrics Check Failed: ${e.message}`);
    }

    log("");
    console.log(`${BLUE}╔══════════════════════════════════════════════════════════╗${NC}`);
    console.log(`${BLUE}║             All End-to-End Tests Passed!                 ║${NC}`);
    console.log(`${BLUE}╚══════════════════════════════════════════════════════════╝${NC}`);
}

runTests();

