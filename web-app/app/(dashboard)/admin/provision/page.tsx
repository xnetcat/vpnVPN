import { requireAdmin } from "@/lib/requireAdmin";
import { redirect } from "next/navigation";
import { Terminal, Server } from "lucide-react";

export default async function AdminProvisionPage() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    redirect(gate.reason === "unauthenticated" ? "/api/auth/signin" : "/");
  }

  const apiUrl = process.env.CONTROL_PLANE_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.vpnvpn.com";

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-2">Server Provisioning</h1>
        <p className="text-gray-600">
          Deploy new VPN servers using the commands below
        </p>
      </div>

      <div className="space-y-6">
        {/* Docker Deployment */}
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Server className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Docker Deployment</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Deploy a VPN server using Docker (requires NET_ADMIN capabilities)
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">
                1. Create a registration token
              </label>
              <p className="text-sm text-gray-700 mb-2">
                Go to the <a href="/admin/tokens" className="text-blue-600 hover:underline">Tokens page</a> and create a new token for this server.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">
                2. Run the Docker command
              </label>
              <div className="relative">
                <pre className="bg-gray-900 text-green-100 p-4 rounded-md text-xs overflow-x-auto font-mono">
{`docker run -d \\
  --name vpnvpn-server \\
  --cap-add NET_ADMIN \\
  --device /dev/net/tun \\
  -p 51820:51820/udp \\
  -p 8080:8080 \\
  -e API_URL="${apiUrl}" \\
  -e VPN_TOKEN="<YOUR_TOKEN_HERE>" \\
  -e LISTEN_UDP_PORT=51820 \\
  vpnvpn/vpn-server:latest`}
                </pre>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Replace <code className="bg-gray-100 px-1 py-0.5 rounded">&lt;YOUR_TOKEN_HERE&gt;</code> with your actual token.
              </p>
            </div>
          </div>
        </div>

        {/* Binary Deployment */}
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold">Binary Deployment</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Deploy a VPN server using the compiled binary (Linux, macOS, Windows)
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">
                1. Download the binary
              </label>
              <div className="relative">
                <pre className="bg-gray-900 text-green-100 p-4 rounded-md text-xs overflow-x-auto font-mono">
{`# Linux
curl -L -o vpn-server https://github.com/vpnvpn/vpn-server/releases/latest/download/vpn-server-linux-amd64
chmod +x vpn-server

# macOS
curl -L -o vpn-server https://github.com/vpnvpn/vpn-server/releases/latest/download/vpn-server-darwin-amd64
chmod +x vpn-server`}
                </pre>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">
                2. Run the server
              </label>
              <div className="relative">
                <pre className="bg-gray-900 text-green-100 p-4 rounded-md text-xs overflow-x-auto font-mono">
{`sudo ./vpn-server run \\
  --api-url "${apiUrl}" \\
  --token "<YOUR_TOKEN_HERE>" \\
  --listen-port 51820 \\
  --admin-port 8080`}
                </pre>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Note: Requires root/administrator privileges to create network interfaces.
              </p>
            </div>
          </div>
        </div>

        {/* Systemd Service */}
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Server className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold">Systemd Service (Linux)</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Run as a systemd service for automatic restarts and management
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">
                Create systemd service file
              </label>
              <div className="relative">
                <pre className="bg-gray-900 text-green-100 p-4 rounded-md text-xs overflow-x-auto font-mono">
{`sudo tee /etc/systemd/system/vpnvpn.service > /dev/null <<EOF
[Unit]
Description=vpnVPN Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vpnvpn
ExecStart=/opt/vpnvpn/vpn-server run \\
  --api-url "${apiUrl}" \\
  --token "<YOUR_TOKEN_HERE>" \\
  --listen-port 51820
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable vpnvpn
sudo systemctl start vpnvpn`}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h3 className="text-sm font-semibold text-yellow-900 mb-2">Important Notes</h3>
          <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
            <li>Ensure ports 51820 (UDP) and 8080 (TCP) are open in your firewall</li>
            <li>The server will automatically register with the control plane on startup</li>
            <li>Check server logs for any errors during startup</li>
            <li>Servers will appear in the Admin / Fleet view once registered</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

