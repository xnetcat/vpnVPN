import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Trash2, Edit2 } from "lucide-react";
import AddDeviceModal from "@/components/AddDeviceModal";
import RevokeDeviceButton from "@/components/RevokeDeviceButton";

async function getUserDevices(userId: string) {
  return prisma.device.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

function maskPublicKey(key: string): string {
  if (key.length <= 16) return key;
  return `${key.substring(0, 8)}...${key.substring(key.length - 8)}`;
}

export default async function DevicesPage() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated" ? "/api/auth/signin" : "/pricing"
    );
  }

  const devices = await getUserDevices(gate.userId);
  const canAddDevice = devices.length < gate.deviceLimit;

  return (
    <main className="mx-auto max-w-6xl p-6 text-slate-50">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Devices</h1>
          <p className="mt-1 text-sm text-slate-400">
            {devices.length} of {gate.deviceLimit} devices. Each device is a VPN
            client: either the vpnVPN desktop app or a custom WireGuard
            configuration connected to your account.
          </p>
        </div>
        <AddDeviceModal
          canAdd={canAddDevice}
          current={devices.length}
          limit={gate.deviceLimit}
        />
      </div>

      {devices.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-12 text-center shadow-sm shadow-slate-900/40">
          <p className="mb-4 text-slate-400">
            No devices connected yet. Add your first device to get started.
          </p>
          <AddDeviceModal
            canAdd={canAddDevice}
            current={devices.length}
            limit={gate.deviceLimit}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80 shadow-sm shadow-slate-900/40">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Public Key
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Server
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Added
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/80">
              {devices.map((device: (typeof devices)[number]) => (
                <tr key={device.id} className="hover:bg-slate-800/80">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-50">
                    {device.name}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-slate-400">
                    {maskPublicKey(device.publicKey)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-400">
                    {device.serverId || "Auto"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-400">
                    {new Date(device.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <RevokeDeviceButton
                      deviceId={device.id}
                      deviceName={device.name}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
