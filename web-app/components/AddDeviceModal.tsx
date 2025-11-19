'use client'

import { useState } from "react";
import * as nacl from "tweetnacl";
import * as util from "tweetnacl-util";
import { registerDevice } from "@/actions/device";
import { Plus } from "lucide-react";

export default function AddDeviceModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [keys, setKeys] = useState<{ public: string; private: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const generateKeys = () => {
    const keyPair = nacl.box.keyPair();
    const publicKey = util.encodeBase64(keyPair.publicKey);
    const privateKey = util.encodeBase64(keyPair.secretKey);
    setKeys({ public: publicKey, private: privateKey });
  };

  const handleSubmit = async () => {
    if (!keys || !name) return;
    setLoading(true);
    const res = await registerDevice(keys.public, name);
    setLoading(false);
    if (res.success) {
      setIsOpen(false);
      setKeys(null);
      setName("");
    } else {
      alert("Failed to register: " + (res.error || "Unknown error"));
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
            <label className="block text-sm font-medium text-gray-700">Device Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g. MacBook Pro"
            />
          </div>

          {!keys ? (
            <button
              onClick={generateKeys}
              className="w-full rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
            >
              Generate WireGuard Keys
            </button>
          ) : (
            <div className="rounded-md bg-gray-50 p-4 space-y-2">
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Public Key</div>
                <div className="font-mono text-xs break-all text-gray-900">{keys.public}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Private Key</div>
                <div className="font-mono text-xs break-all text-red-600">{keys.private}</div>
                <div className="mt-1 text-[10px] text-red-500">
                  Save this private key! It will not be shown again.
                </div>
              </div>
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
              disabled={!keys || !name || loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Registering..." : "Register Device"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

