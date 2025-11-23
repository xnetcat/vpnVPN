"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

export default function CreateTokenButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [label, setLabel] = useState("");
  const utils = trpc.useUtils();

  const createMutation = trpc.admin.createToken.useMutation({
    onSuccess: () => {
      utils.admin.listTokens.invalidate();
      setLabel("");
      setIsOpen(false);
      window.location.reload();
    },
    onError: () => {
      alert("Failed to create token");
    },
  });

  const handleCreate = async () => {
    if (!label.trim()) {
      alert("Please enter a label for the token");
      return;
    }

    await createMutation.mutateAsync({ label });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Plus className="h-4 w-4" />
        Create Token
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-semibold">Create Server Token</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Token Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g. US East Production"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create Token"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
