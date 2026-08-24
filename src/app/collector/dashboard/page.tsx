"use client";
import { isRedirectError } from "@/lib/errors";

import { useEffect, useState, useMemo } from "react";
import { getCollectorDashboardStats } from "@/lib/actions/susu-dashboard.actions";
import { recordContribution } from "@/lib/actions/susu-contribution.actions";
import { formatCedi, getGreeting, getDailyQuote } from "@/lib/utils";

interface ToVisitCustomer {
  accountId: string;
  customerName: string;
  customerIdCode: string;
  dailyContribution: number;
  outstandingDays: number;
  expectedAmount: number;
}

interface CollectedCustomer {
  accountId: string;
  customerName: string;
  customerIdCode: string;
  amountCollected: number;
  daysCovered: number;
  collectedAt: string;
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
  toVisit: ToVisitCustomer[];
  collectedToday: CollectedCustomer[];
  recentRemittances: RemittanceEntry[];
}

interface UserInfo {
  userId: string;
  fullName: string;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

type SortOption = "name" | "amount" | "days";

export default function CollectorDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quote] = useState(() => getDailyQuote("susu"));

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "visit" | "collected">("all");
  const [sortBy, setSortBy] = useState<SortOption>("amount");

  // Collection recording state
  const [recordingFor, setRecordingFor] = useState<ToVisitCustomer | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectNotes, setCollectNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
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
    } finally { setLoading(false); }
  }

  async function handleRecordCollection() {
    if (!recordingFor || !collectAmount) return;
    setSubmitting(true); setError(""); setSuccess("");
    try {
      const amountNum = parseFloat(collectAmount);
      if (!amountNum || amountNum <= 0) { setError("Enter a valid amount"); return; }
      const result = await recordContribution({
        accountId: recordingFor.accountId, amount: amountNum, channel: "collector",
        notes: collectNotes || undefined,
      });
      if (result.success) {
        const resultData = result.data as { daysAllocated: number };
        setSuccess(`${recordingFor.customerName}: ${formatCedi(amountNum)} — ${resultData.daysAllocated} day(s) covered`);
        setRecordingFor(null); setCollectAmount(""); setCollectNotes("");
        loadData();
      } else {
        setError(result.error || "Unable to record. Please try again.");
      }
    } catch (err) { if (isRedirectError(err)) throw err;
      setError("We couldn't confirm this collection. Please check the customer's history.");
    } finally { setSubmitting(false); }
  }

  // Filtered + sorted data
  const filteredToVisit = useMemo(() => {
    if (!data) return [];
    let list = data.toVisit;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        c.customerName.toLowerCase().includes(q) ||
        c.customerIdCode.toLowerCase().includes(q)
      );
    }
    if (sortBy === "name") list = [...list].sort((a, b) => a.customerName.localeCompare(b.customerName));
    else if (sortBy === "amount") list = [...list].sort((a, b) => b.expectedAmount - a.expectedAmount);
    else if (sortBy === "days") list = [...list].sort((a, b) => b.outstandingDays - a.outstandingDays);
    return list;
  }, [data, searchQuery, sortBy]);

  const filteredCollected = useMemo(() => {
    if (!data) return [];
    let list = data.collectedToday;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        c.customerName.toLowerCase().includes(q) ||
        c.customerIdCode.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());
  }, [data, searchQuery]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner"></div></div>;
  if (error && !data) return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>;

  const totalAssigned = data?.assignedCustomers || 0;
  const collected = data?.collectedToday.length || 0;
  const remaining = data?.toVisit.length || 0;
  const allDone = remaining === 0 && totalAssigned > 0;

  const showVisit = filter === "all" || filter === "visit";
  const showCollected = filter === "all" || filter === "collected";

  return (
    <div className="space-y-5">
      {/* Header with greeting */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">
          {getGreeting()}, {user?.fullName || "Collector"} 👋
        </h1>
        <p className="text-sm text-green-600 italic mt-1">&ldquo;{quote}&rdquo;</p>
      </div>

      {/* Messages */}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">✓ {success}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Progress */}
      {data && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-3">Today&apos;s Collections</h2>
          {allDone ? (
            <div className="text-center py-2">
              <p className="text-2xl mb-1">✅</p>
              <p className="font-semibold text-green-700">All collections completed!</p>
              <p className="text-sm text-gray-500 mt-1">{totalAssigned} of {totalAssigned} customers collected</p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="text-2xl font-bold text-green-700">{collected}</div>
                <div className="text-xs text-gray-500">Collected</div>
              </div>
              <div className="text-gray-300 text-xl">·</div>
              <div className="text-center flex-1">
                <div className="text-2xl font-bold text-orange-600">{remaining}</div>
                <div className="text-xs text-gray-500">Remaining</div>
              </div>
              <div className="text-gray-300 text-xl">·</div>
              <div className="text-center flex-1">
                <div className="text-2xl font-bold text-gray-700">{formatCedi(data.todayCollected)}</div>
                <div className="text-xs text-gray-500">Collected Today</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search + Filters + Sort */}
      {data && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400"
              />
            </div>
            {/* Filters */}
            <div className="flex gap-1">
              {(["all", "visit", "collected"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    filter === f
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {f === "all" ? "All" : f === "visit" ? "To Visit" : "Collected"}
                </button>
              ))}
            </div>
            {/* Sort */}
            {showVisit && remaining > 0 && (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600"
              >
                <option value="amount">Sort: Amount</option>
                <option value="days">Sort: Days Due</option>
                <option value="name">Sort: Name</option>
              </select>
            )}
          </div>
        </div>
      )}

      {/* TO VISIT — Grid */}
      {data && showVisit && filteredToVisit.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-1 px-1">To Visit</h2>
          <p className="text-sm text-gray-500 mb-3 px-1">{filteredToVisit.length} customer{filteredToVisit.length !== 1 ? "s" : ""} remaining</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredToVisit.map((customer) => (
              <div key={customer.accountId} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-green-300 transition-colors flex flex-col">
                <div className="flex-1">
                  <div className="font-medium text-sm truncate" title={customer.customerName}>{customer.customerName}</div>
                  <div className="text-xs text-gray-400 mb-2">{customer.customerIdCode}</div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Daily: {formatCedi(customer.dailyContribution)}</span>
                    <span>{customer.outstandingDays}d due</span>
                  </div>
                  <div className="font-semibold text-sm text-green-700">{formatCedi(customer.expectedAmount)}</div>
                </div>
                <button
                  onClick={() => { setRecordingFor(customer); setCollectAmount(String(customer.expectedAmount)); }}
                  className="btn btn-primary btn-sm w-full mt-3"
                >
                  💵 Collect
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty search */}
      {data && showVisit && searchQuery && filteredToVisit.length === 0 && remaining > 0 && (
        <div className="text-center py-6 text-gray-500">
          <p className="text-sm">No customers matching &ldquo;{searchQuery}&rdquo;</p>
        </div>
      )}

      {/* All caught up */}
      {data && allDone && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
          <p className="text-3xl mb-2">🎉</p>
          <p className="font-medium text-gray-700">All collections completed for today!</p>
          <p className="text-sm text-gray-500 mt-1">{totalAssigned} of {totalAssigned} collected</p>
        </div>
      )}

      {/* COLLECTED TODAY — Grid */}
      {data && showCollected && filteredCollected.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-1 px-1">Collected Today</h2>
          <p className="text-sm text-gray-500 mb-3 px-1">{filteredCollected.length} customer{filteredCollected.length !== 1 ? "s" : ""} collected</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredCollected.map((customer) => (
              <div key={customer.accountId} className="bg-green-50 rounded-xl p-4 border border-green-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-green-600">✓</span>
                  <span className="font-medium text-sm truncate" title={customer.customerName}>{customer.customerName}</span>
                </div>
                <div className="text-xs text-gray-400 mb-2">{customer.customerIdCode}</div>
                <div className="font-semibold text-sm text-green-700">{formatCedi(customer.amountCollected)}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {customer.daysCovered} day{customer.daysCovered !== 1 ? "s" : ""} covered · {formatTime(customer.collectedAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Money Handed In */}
      {data && data.recentRemittances.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Recent Money Handed In</h2>
          <div className="space-y-2">
            {data.recentRemittances.map((r) => (
              <div key={r.id} className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                <div className="text-sm">
                  <span className="font-mono">{formatCedi(r.remittedAmount)}</span>
                  {r.variance !== 0 && (
                    <span className={`ml-2 text-xs ${r.variance > 0 ? "text-red-600" : "text-green-600"}`}>
                      ({r.variance > 0 ? "Short " : "Over "}{formatCedi(Math.abs(r.variance))})
                    </span>
                  )}
                </div>
                <span className={`badge ${r.status === "reconciled" ? "badge-green" : "badge-red"}`}>
                  {r.status === "reconciled" ? "Matches" : "Short"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recording Modal */}
      {recordingFor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Record Collection</h3>
            <div className="bg-green-50 rounded-lg p-3 mb-4">
              <div className="font-medium">{recordingFor.customerName}</div>
              <div className="text-sm text-gray-600">
                {recordingFor.outstandingDays} day{recordingFor.outstandingDays !== 1 ? "s" : ""} due · Expected: {formatCedi(recordingFor.expectedAmount)}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Amount Received (GH₵)</label>
              <input type="number" step="0.01" min="0.01" value={collectAmount}
                onChange={(e) => setCollectAmount(e.target.value)} className="text-lg" />
              <p className="form-hint">
                Will cover ~{Math.floor(parseFloat(collectAmount || "0") / recordingFor.dailyContribution)} day(s)
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Note (optional)</label>
              <input type="text" value={collectNotes} onChange={(e) => setCollectNotes(e.target.value)} placeholder="Any note..." />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleRecordCollection} className="btn btn-primary flex-1" disabled={submitting}>
                {submitting ? "Recording..." : "✅ Record"}
              </button>
              <button onClick={() => { setRecordingFor(null); setCollectAmount(""); }} className="btn btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
