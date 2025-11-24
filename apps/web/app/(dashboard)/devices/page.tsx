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
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Devices</h1>
          <p className="text-sm text-gray-500 mt-1">
            {devices.length} of {gate.deviceLimit} devices
          </p>
        </div>
        <AddDeviceModal
          canAdd={canAddDevice}
          current={devices.length}
          limit={gate.deviceLimit}
        />
      </div>

      {devices.length === 0 ? (
        <div className="rounded-lg border bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500 mb-4">
            No devices connected yet. Add your first device to get started.
          </p>
          <AddDeviceModal
            canAdd={canAddDevice}
            current={devices.length}
            limit={gate.deviceLimit}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Public Key
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Server
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Added
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {devices.map((device: (typeof devices)[number]) => (
                <tr key={device.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {device.name}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-gray-500">
                    {maskPublicKey(device.publicKey)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {device.serverId || "Auto"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
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
