"use client";
import { isRedirectError } from "@/lib/errors";

import { useEffect, useState } from "react";
import { getSusuDashboardStats } from "@/lib/actions/susu-dashboard.actions";
import { formatCedi } from "@/lib/utils";

interface DashboardStats {
  activeCustomers: number;
  activeCollectors: number;
  totalCustomers: number;
  paidToday: number;
  outstandingToday: number;
  todayContributions: number;
  todayContributionCount: number;
  todayWithdrawals: number;
  todayWithdrawalCount: number;
  todayCommission: number;
  todayNetPaid: number;
  totalCardFees: number;
  pendingRemittances: number;
  pendingRemittanceCount: number;
}

export default function SusuAdminOverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStats() {
    try {
      const data = await getSusuDashboardStats();
      setStats(data);
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
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  if (!stats) return null;

  const statCards = [
    { label: "Active Customers", value: stats.activeCustomers, icon: "🧑", color: "bg-blue-50" },
    { label: "Active Collectors", value: stats.activeCollectors, icon: "🚶", color: "bg-green-50" },
    { label: "Paid Today", value: stats.paidToday, icon: "✅", color: "bg-emerald-50" },
    { label: "Outstanding Today", value: stats.outstandingToday, icon: "⏳", color: "bg-yellow-50" },
  ];

  const financialCards = [
    { label: "Today's Contributions", value: formatCedi(stats.todayContributions), icon: "💵", color: "bg-green-50" },
    { label: "Today's Withdrawals", value: formatCedi(stats.todayWithdrawals), icon: "🏧", color: "bg-orange-50" },
    { label: "Today's Commission", value: formatCedi(stats.todayCommission), icon: "💼", color: "bg-purple-50" },
    { label: "Card Fee Income", value: formatCedi(stats.totalCardFees), icon: "💳", color: "bg-indigo-50" },
    { label: "Pending Remittances", value: formatCedi(stats.pendingRemittances), icon: "🏦", color: stats.pendingRemittances > 0 ? "bg-red-50" : "bg-green-50" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Susu Overview</h1>
        <p className="text-gray-500 mt-1">Susu module dashboard — today&apos;s activity at a glance</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <div key={card.label} className={`card ${card.color} text-center`}>
            <div className="text-2xl mb-1">{card.icon}</div>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-xs text-gray-600 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {financialCards.slice(0, 3).map((card) => (
          <div key={card.label} className="card">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{card.icon}</span>
              <div>
                <div className="text-sm text-gray-500">{card.label}</div>
                <div className="text-xl font-bold">{card.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {financialCards.slice(3).map((card) => (
          <div key={card.label} className="card">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{card.icon}</span>
              <div>
                <div className="text-sm text-gray-500">{card.label}</div>
                <div className="text-xl font-bold">{card.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Info */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Quick Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Total Registered Customers</div>
            <div className="font-semibold text-lg">{stats.totalCustomers}</div>
          </div>
          <div>
            <div className="text-gray-500">Contribution Events Today</div>
            <div className="font-semibold text-lg">{stats.todayContributionCount}</div>
          </div>
          <div>
            <div className="text-gray-500">Withdrawals Today</div>
            <div className="font-semibold text-lg">{stats.todayWithdrawalCount}</div>
          </div>
          <div>
            <div className="text-gray-500">Net Paid to Customers Today</div>
            <div className="font-semibold text-lg text-green-700">{formatCedi(stats.todayNetPaid)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
