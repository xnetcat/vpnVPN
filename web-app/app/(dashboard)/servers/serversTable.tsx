"use client";

import type { Server } from "./page";
import { useMemo, useState } from "react";

type Props = {
  servers: Server[];
};

const statusOptions = ["all", "online", "offline", "unknown"] as const;

export default function ServersTable({ servers }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] =
    useState<(typeof statusOptions)[number]>("all");

  const filtered = useMemo(() => {
    return servers.filter((s) => {
      const matchesSearch =
        !search ||
        s.id.toLowerCase().includes(search.toLowerCase()) ||
        s.region.toLowerCase().includes(search.toLowerCase()) ||
        (s.country ?? "")
          .toLowerCase()
          .includes(search.toLowerCase());

      const matchesStatus =
        status === "all" ? true : s.status.toLowerCase() === status;

      return matchesSearch && matchesStatus;
    });
  }, [servers, search, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by country, region, or ID..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as (typeof statusOptions)[number])
            }
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {statusOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "all"
                  ? "All statuses"
                  : opt.charAt(0).toUpperCase() + opt.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Country
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Region
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Status
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Sessions
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                CPU
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                ID
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm">
                  {s.country ?? "—"}
                </td>
                <td className="px-4 py-2 text-sm">{s.region}</td>
                <td className="px-4 py-2 text-sm capitalize">
                  {s.status}
                </td>
                <td className="px-4 py-2 text-sm">{s.sessions}</td>
                <td className="px-4 py-2 text-sm">
                  {typeof s.cpu === "number"
                    ? `${s.cpu.toFixed(1)}%`
                    : "—"}
                </td>
                <td className="px-4 py-2 text-sm font-mono text-gray-500">
                  {s.id}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-sm text-gray-500"
                >
                  No servers match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}



