"use client";
import { isRedirectError } from "@/lib/errors";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils";

interface DeviceData {
  id: string;
  deviceId: string;
  deviceName: string | null;
  module: string;
  status: string;
  lastSyncAt: Date | null;
  createdAt: Date;
  user: { id: string; fullName: string; email: string; role: string };
}

export default function AdminDevicesPage() {
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionPending, setActionPending] = useState<string | null>(null);

  async function loadDevices() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/devices");
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
    } catch (err) {
      if (isRedirectError(err)) throw err;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
  }, []);

  async function handleRevoke(deviceId: string) {
    if (!confirm("Revoke this device? It will no longer be allowed to synchronize offline financial transactions.")) return;
    setActionPending(deviceId);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, action: "revoke" }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Device revoked successfully");
        loadDevices();
      } else {
        setError(data.error || "Failed to revoke device");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setActionPending(null);
    }
  }

  async function handleActivate(deviceId: string) {
    setActionPending(deviceId);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, action: "activate" }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Device reactivated");
        loadDevices();
      } else {
        setError(data.error || "Failed to activate device");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setActionPending(null);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Offline Devices</h1>
        <p className="text-gray-500 mt-1">Manage devices enrolled for offline financial collections</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
          {success}
          <button onClick={() => setSuccess("")} className="ml-2">✕</button>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner"></div>
          </div>
        ) : devices.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">📱</p>
            <p className="font-medium">No devices enrolled</p>
            <p className="text-sm mt-1">Devices will appear here when collectors enroll for offline collections.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Device</th>
                  <th>Module</th>
                  <th>Status</th>
                  <th>Enrolled</th>
                  <th>Last Sync</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <div className="font-medium">{device.user.fullName}</div>
                      <div className="text-xs text-gray-500">{device.user.email}</div>
                    </td>
                    <td className="text-sm">
                      <div className="font-mono text-xs">{device.deviceId.substring(0, 12)}...</div>
                      {device.deviceName && <div className="text-gray-500 text-xs">{device.deviceName}</div>}
                    </td>
                    <td>
                      <span className={`badge ${device.module === "susu" ? "badge-blue" : "badge-green"}`}>
                        {device.module === "susu" ? "Susu" : "MoMo"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${device.status === "active" ? "badge-green" : "badge-red"}`}>
                        {device.status === "active" ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td className="text-sm whitespace-nowrap">{formatDateTime(device.createdAt)}</td>
                    <td className="text-sm whitespace-nowrap">
                      {device.lastSyncAt ? formatDateTime(device.lastSyncAt) : "—"}
                    </td>
                    <td>
                      {device.status === "active" ? (
                        <button
                          onClick={() => handleRevoke(device.deviceId)}
                          disabled={actionPending === device.deviceId}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          {actionPending === device.deviceId ? "Revoking..." : "Revoke"}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivate(device.deviceId)}
                          disabled={actionPending === device.deviceId}
                          className="text-sm text-green-600 hover:text-green-800"
                        >
                          {actionPending === device.deviceId ? "Activating..." : "Reactivate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
