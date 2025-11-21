"use client";

import { useState, useEffect } from "react";
import * as nacl from "tweetnacl";
import * as util from "tweetnacl-util";
import { trpc } from "@/lib/trpc/client";
import { Plus } from "lucide-react";

const WG_ENDPOINT = process.env.NEXT_PUBLIC_WG_ENDPOINT || "";
const WG_SERVER_PUBLIC_KEY = process.env.NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY || "";

type Server = {
  id: string;
  region?: string;
  status: string;
  sessions: number;
};

function buildWireGuardConfig(params: {
  privateKey: string;
  publicKey: string;
  assignedIp: string;
}) {
  const endpoint = WG_ENDPOINT;
  const serverPublicKey = WG_SERVER_PUBLIC_KEY;

  // We do not include any user-identifying info in the config, only keys and IPs.
  return [
    "[Interface]",
    `PrivateKey = ${params.privateKey}`,
    `Address = ${params.assignedIp}`,
    "DNS = 1.1.1.1",
    "",
    "[Peer]",
    serverPublicKey
      ? `PublicKey = ${serverPublicKey}`
      : "# PublicKey = <server-public-key>",
    "AllowedIPs = 0.0.0.0/0, ::/0",
    endpoint ? `Endpoint = ${endpoint}` : "# Endpoint = <hostname:51820>",
    "",
  ].join("\n");
}

export default function AddDeviceModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [serverId, setServerId] = useState<string>("");
  const [keys, setKeys] = useState<{ public: string; private: string } | null>(
    null
  );
  const [config, setConfig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: servers = [], isLoading: loadingServers } =
    trpc.servers.list.useQuery(undefined, { enabled: isOpen });

  const registerMutation = trpc.device.register.useMutation({
    onSuccess: () => {
      utils.device.list.invalidate();
    },
  });

  const generateKeys = () => {
    const keyPair = nacl.box.keyPair();
    const publicKey = util.encodeBase64(keyPair.publicKey);
    const privateKey = util.encodeBase64(keyPair.secretKey);
    setKeys({ public: publicKey, private: privateKey });
    setConfig(null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!keys || !name) return;
    setError(null);
    try {
      const result = await registerMutation.mutateAsync({
        publicKey: keys.public,
        name,
        serverId: serverId || undefined,
      });

      const cfg = buildWireGuardConfig({
        privateKey: keys.private,
        publicKey: keys.public,
        assignedIp: result.assignedIp,
      });
      setConfig(cfg);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Plus className="h-4 w-4" />
        Add Device
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-semibold">Add New Device</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Device Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g. MacBook Pro"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Server Location (Optional)
            </label>
            <select
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={loadingServers}
            >
              <option value="">Auto (Best Available)</option>
              {servers
                .filter((s: Server) => s.status === "online")
                .map((server: Server) => (
                  <option key={server.id} value={server.id}>
                    {server.region || server.id} - {server.sessions} sessions
                  </option>
                ))}
            </select>
            {loadingServers && (
              <p className="mt-1 text-xs text-gray-500">Loading servers...</p>
            )}
          </div>

          {!keys ? (
            <button
              onClick={generateKeys}
              className="w-full rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
            >
              Generate WireGuard Keys
            </button>
          ) : (
            <div className="rounded-md bg-gray-50 p-4 space-y-4">
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">
                  Public Key
                </div>
                <div className="font-mono text-xs break-all text-gray-900">
                  {keys.public}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">
                  Private Key
                </div>
                <div className="font-mono text-xs break-all text-red-600">
                  {keys.private}
                </div>
                <div className="mt-1 text-[10px] text-red-500">
                  Save this private key! It will not be shown again.
                </div>
              </div>
              {config && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase">
                    WireGuard Config
                  </div>
                  <textarea
                    readOnly
                    value={config}
                    className="h-40 w-full resize-none rounded-md border border-gray-300 bg-gray-900 p-2 font-mono text-xs text-green-100"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>
                      Import this config into your WireGuard client on the
                      device.
                    </span>
                  </div>
                </div>
              )}
              {error && (
                <p className="text-xs text-red-600">
                  Failed to register with control plane: {error}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!keys || !name || registerMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {registerMutation.isPending
                ? "Registering..."
                : "Register Device"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
