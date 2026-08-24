"use client";
import { isRedirectError } from "@/lib/errors";

import { useEffect, useState } from "react";
import { getCollectorDashboardStats } from "@/lib/actions/susu-dashboard.actions";
import { recordContribution } from "@/lib/actions/susu-contribution.actions";
import { formatCedi } from "@/lib/utils";

interface OutstandingCustomer {
  accountId: string;
  customerName: string;
  customerIdCode: string;
  dailyContribution: number;
  outstandingDays: number;
  expectedAmount: number;
}

interface RemittanceEntry {
  id: string;
  expectedAmount: number;
  remittedAmount: number;
  variance: number;
  status: string;
  createdAt: string;
}

interface DashboardData {
  assignedCustomers: number;
  todayCollected: number;
  todayCollectionCount: number;
  outstandingObligations: (OutstandingCustomer | null)[];
  recentRemittances: RemittanceEntry[];
}

interface UserInfo {
  userId: string;
  fullName: string;
}

export default function CollectorDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Collection recording state
  const [recordingFor, setRecordingFor] = useState<OutstandingCustomer | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectNotes, setCollectNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Get user info
      const authRes = await fetch("/api/auth/me");
      const authUser = authRes.ok ? await authRes.json() : null;

      if (authUser?.userId) {
        const userRes = await fetch(`/api/user/${authUser.userId}`);
        const fullUser = userRes.ok ? await userRes.json() : null;
        setUser({ userId: authUser.userId, fullName: fullUser?.fullName || "" });

        const dashboardData = await getCollectorDashboardStats(authUser.userId);
        setData(dashboardData as DashboardData | null);
      }
    } catch (err) { if (isRedirectError(err)) throw err;
      setError("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecordCollection() {
    if (!recordingFor || !collectAmount) return;

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const amountNum = parseFloat(collectAmount);
      if (!amountNum || amountNum <= 0) {
        setError("Enter a valid amount");
        return;
      }

      const result = await recordContribution({
        accountId: recordingFor.accountId, // Correct: uses the SusuAccount ID
        amount: amountNum,
        channel: "collector",
        notes: collectNotes || undefined,
      });

      if (result.success) {
        const resultData = result.data as { daysAllocated: number };
        setSuccess(`Recorded: GH₵${amountNum.toFixed(2)} — ${resultData.daysAllocated} day(s) covered`);
        setRecordingFor(null);
        setCollectAmount("");
        setCollectNotes("");
        loadData();
      } else {
        setError(result.error || "Failed to record");
      }
    } catch (err) { if (isRedirectError(err)) throw err;
      setError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner"></div>
      </div>
    );

  if (error && !data)
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">
          {user?.fullName || "Collector"} 👋
        </h1>
        <p className="text-gray-500 mt-1">Collector Dashboard</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Today's Summary */}
      {data && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-2xl font-bold text-green-700">
              {formatCedi(data.todayCollected)}
            </div>
            <div className="text-xs text-gray-500 mt-1">Collected Today</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-2xl font-bold text-blue-700">{data.assignedCustomers}</div>
            <div className="text-xs text-gray-500 mt-1">Assigned Customers</div>
          </div>
        </div>
      )}

      {/* Today's Route - Outstanding Customers */}
      {data && data.outstandingObligations.filter(Boolean).length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Today&apos;s Route</h2>
          <div className="space-y-3">
            {data.outstandingObligations.filter(Boolean).map((customer) => (
              <div
                key={customer!.accountId}
                className="p-4 rounded-lg border border-gray-200 hover:border-green-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-medium">{customer!.customerName}</div>
                    <div className="text-xs text-gray-500">{customer!.customerIdCode}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">
                      {customer!.outstandingDays} day(s) outstanding
                    </div>
                    <div className="font-semibold text-green-700">
                      Expected: {formatCedi(customer!.expectedAmount)}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mb-3">
                  Daily contribution: {formatCedi(customer!.dailyContribution)}/day
                </div>
                <button
                  onClick={() => {
                    setRecordingFor(customer!);
                    setCollectAmount(String(customer!.expectedAmount));
                  }}
                  className="btn btn-primary btn-sm w-full"
                >
                  💵 Record Collection
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No outstanding customers */}
      {data && data.outstandingObligations.filter(Boolean).length === 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
          <p className="text-3xl mb-2">✅</p>
          <p className="font-medium text-gray-700">All caught up!</p>
          <p className="text-sm text-gray-500">No outstanding collections for today.</p>
        </div>
      )}

      {/* Recent Remittances */}
      {data && data.recentRemittances.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Recent Remittances</h2>
          <div className="space-y-2">
            {data.recentRemittances.map((r) => (
              <div key={r.id} className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                <div className="text-sm">
                  <span className="font-mono">{formatCedi(r.remittedAmount)}</span>
                  {r.variance !== 0 && (
                    <span className={`ml-2 text-xs ${r.variance > 0 ? "text-red-600" : "text-green-600"}`}>
                      ({r.variance > 0 ? "-" : "+"}GH₵{Math.abs(r.variance).toFixed(2)})
                    </span>
                  )}
                </div>
                <span
                  className={`badge ${
                    r.status === "reconciled" ? "badge-green" : "badge-red"
                  }`}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collection Recording Modal */}
      {recordingFor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Record Collection</h3>
            <div className="bg-green-50 rounded-lg p-3 mb-4">
              <div className="font-medium">{recordingFor.customerName}</div>
              <div className="text-sm text-gray-600">
                Outstanding: {recordingFor.outstandingDays} day(s) &bull;{" "}
                {formatCedi(recordingFor.expectedAmount)}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Amount Received (GH₵)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={collectAmount}
                onChange={(e) => setCollectAmount(e.target.value)}
                className="text-lg"
              />
              <p className="form-hint">
                Will cover ~{Math.floor(parseFloat(collectAmount || "0") / recordingFor.dailyContribution)} day(s)
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Note (optional)</label>
              <input
                type="text"
                value={collectNotes}
                onChange={(e) => setCollectNotes(e.target.value)}
                placeholder="Any note..."
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleRecordCollection}
                className="btn btn-primary flex-1"
                disabled={submitting}
              >
                {submitting ? "Recording..." : "✅ Record"}
              </button>
              <button
                onClick={() => {
                  setRecordingFor(null);
                  setCollectAmount("");
                }}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
