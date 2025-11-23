"use client";

import { useState } from "react";
import { Trash2, Copy, Check } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

type Token = {
  token: string;
  label: string;
  createdAt: string;
  usageCount: number;
  active: boolean;
};

export default function TokenList() {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: tokens = [], isLoading: loading } =
    trpc.admin.listTokens.useQuery();

  const revokeMutation = trpc.admin.revokeToken.useMutation({
    onSuccess: () => {
      utils.admin.listTokens.invalidate();
    },
    onError: () => {
      alert("Failed to revoke token");
    },
  });

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleRevoke = async (token: string) => {
    if (!confirm("Are you sure you want to revoke this token?")) return;
    await revokeMutation.mutateAsync({ token });
  };

  const maskToken = (token: string) => {
    if (token.length <= 16) return token;
    return `${token.substring(0, 8)}...${token.substring(token.length - 8)}`;
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">Loading tokens...</div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center shadow-sm">
        <p className="text-gray-500">
          No tokens created yet. Create one to register new servers.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Label
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Token
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Usage
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Created
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {tokens.map((token: Token) => (
            <tr key={token.token} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                {token.label}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-gray-500">
                <div className="flex items-center gap-2">
                  <span>{maskToken(token.token)}</span>
                  <button
                    onClick={() => handleCopy(token.token)}
                    className="text-blue-600 hover:text-blue-900"
                    aria-label="Copy token"
                  >
                    {copiedToken === token.token ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                {token.usageCount || 0} uses
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                {new Date(token.createdAt).toLocaleDateString()}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm">
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                    token.active
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {token.active ? "Active" : "Revoked"}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                {token.active && (
                  <button
                    onClick={() => handleRevoke(token.token)}
                    className="inline-flex items-center gap-1 text-red-600 hover:text-red-900"
                    aria-label={`Revoke ${token.label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Revoke</span>
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
