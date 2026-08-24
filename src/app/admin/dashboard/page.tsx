"use client";
import { isRedirectError } from "@/lib/errors";

import { useEffect, useState } from "react";
import { getAdminDashboardStats } from "@/lib/actions/daily-account.actions";
import { getSusuDashboardStats } from "@/lib/actions/susu-dashboard.actions";
import { formatCedi } from "@/lib/utils";
import CediAmount from "@/components/CediAmount";
import Link from "next/link";

interface MoMoStats {
  totalActiveLocations: number;
  totalActiveWorkers: number;
  submittedToday: number;
  pendingToday: number;
  balancedReports: number;
  discrepancyReports: number;
  totalCashPosition: number;
  totalFloat: number;
  totalExpenses: number;
  locationStatus: Array<{
    location: { name: string; code: string; id: string };
    worker: string;
    status: string;
    difference: number | null;
  }>;
}

interface SusuStats {
  activeCustomers: number;
  activeCollectors: number;
  paidToday: number;
  outstandingToday: number;
  todayContributions: number;
  todayWithdrawals: number;
  todayCommission: number;
  totalCardFees: number;
  pendingRemittances: number;
}

export default function AdminDashboardPage() {
  const [momoStats, setMomoStats] = useState<MoMoStats | null>(null);
  const [susuStats, setSusuStats] = useState<SusuStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStats() {
    try {
      const [momo, susu] = await Promise.all([
        getAdminDashboardStats(),
        getSusuDashboardStats(),
      ]);
      setMomoStats(momo);
      setSusuStats(susu);
    } catch (err) { if (isRedirectError(err)) throw err;
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner"></div>
      </div>
    );
  if (error)
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
    );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Platform Dashboard</h1>
        <p className="text-gray-500 mt-1">BIK Prestige Enterprise — Overview of all modules</p>
      </div>

      {/* Module Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* MoMo Module */}
        <div className="card border-l-4 border-l-green-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-green-700">📱 MoMo Module</h2>
            <Link href="/admin/reports" className="text-sm text-green-600 hover:text-green-700">
              View →
            </Link>
          </div>
          {momoStats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold">{momoStats.totalActiveLocations}</div>
                <div className="text-xs text-gray-600">Locations</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold">{momoStats.totalActiveWorkers}</div>
                <div className="text-xs text-gray-600">Workers</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold">{momoStats.submittedToday}</div>
                <div className="text-xs text-gray-600">Submitted Today</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold">{momoStats.pendingToday}</div>
                <div className="text-xs text-gray-600">Pending</div>
              </div>
            </div>
          )}
        </div>

        {/* Susu Module */}
        <div className="card border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-blue-700">💰 Susu Module</h2>
            <Link href="/susu/admin" className="text-sm text-blue-600 hover:text-blue-700">
              View →
            </Link>
          </div>
          {susuStats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold">{susuStats.activeCustomers}</div>
                <div className="text-xs text-gray-600">Customers</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold">{susuStats.paidToday}</div>
                <div className="text-xs text-gray-600">Paid Today</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold"><CediAmount amount={susuStats.todayContributions} /></div>
                <div className="text-xs text-gray-600">Contributions</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold">{susuStats.outstandingToday}</div>
                <div className="text-xs text-gray-600">Outstanding</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <div className="text-sm text-gray-500 mb-1">MoMo Cash Position</div>
          <div className="text-xl font-bold text-green-700">
            {momoStats ? <CediAmount amount={momoStats.totalCashPosition} /> : "—"}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 mb-1">Susu Today&apos;s Commission</div>
          <div className="text-xl font-bold text-purple-700">
            {susuStats ? <CediAmount amount={susuStats.todayCommission} /> : "—"}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 mb-1">Susu Card Fee Income</div>
          <div className="text-xl font-bold text-indigo-700">
            {susuStats ? <CediAmount amount={susuStats.totalCardFees} /> : "—"}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 mb-1">Pending Remittances</div>
          <div className={`text-xl font-bold ${susuStats && susuStats.pendingRemittances > 0 ? "text-red-600" : "text-green-700"}`}>
            {susuStats ? <CediAmount amount={susuStats.pendingRemittances} /> : "—"}
          </div>
        </div>
      </div>

      {/* MoMo Location Status */}
      {momoStats && momoStats.locationStatus.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">MoMo — Location Status Today</h2>
            <Link href="/admin/reports" className="text-sm text-green-600 hover:text-green-700">
              All Reports →
            </Link>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Worker</th>
                  <th>Status</th>
                  <th className="text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {momoStats.locationStatus.map((row) => (
                  <tr key={row.location.id}>
                    <td>
                      <div className="font-medium">{row.location.name}</div>
                      <div className="text-xs text-gray-500">{row.location.code}</div>
                    </td>
                    <td className="text-gray-600">{row.worker}</td>
                    <td>
                      <span
                        className={`badge ${
                          row.status === "Submitted"
                            ? "badge-green"
                            : row.status === "Draft"
                            ? "badge-yellow"
                            : "badge-gray"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="text-right font-mono">
                      {row.difference !== null ? (
                        <span className={row.difference === 0 ? "text-green-600" : "text-red-600"}>
                          {row.difference === 0
                            ? <CediAmount amount={0} />
                            : <CediAmount amount={row.difference} showSign />}
                        </span>
                      ) : (
                        <span className="text-gray-400">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
