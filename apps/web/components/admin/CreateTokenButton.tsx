"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
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
        className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 shadow-sm transition hover:border-amber-400 hover:bg-amber-500/30"
      >
        <Plus className="h-4 w-4" />
        Create Token
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/40">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-50">
            Create Server Token
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-full border border-slate-700 bg-slate-900 p-1 text-slate-400 transition hover:text-slate-100"
            aria-label="Close create token modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Token Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 shadow-sm outline-none ring-1 ring-transparent transition focus:border-amber-500/60 focus:ring-amber-500/20"
              placeholder="e.g. US East Production"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 shadow-sm transition hover:border-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Token"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
