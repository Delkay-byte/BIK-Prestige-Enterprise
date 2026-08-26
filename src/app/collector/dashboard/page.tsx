"use client";
import { isRedirectError } from "@/lib/errors";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getCollectorDashboardStats } from "@/lib/actions/susu-dashboard.actions";
import { recordContribution } from "@/lib/actions/susu-contribution.actions";
import { formatCedi, getGreeting, getDailyQuote } from "@/lib/utils";
import {
  addTransaction,
  getPendingTransactions,
  getSyncedTransactions,
  getFailedTransactions,
  cacheCustomers,
  type OfflineTransaction,
  type CachedCustomer,
} from "@/lib/offline/store";
import { getOrCreateDeviceId } from "@/lib/offline/device";
import { syncPendingTransactions, checkConnectivity, startAutoSync, stopAutoSync, isOfflineAuthExpired, secondsUntilOfflineAuthExpiry, setOfflineAuthorizedAt, type SyncResult } from "@/lib/offline/sync";
import CediAmount from "@/components/CediAmount";

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

type SortOption = "name" | "amount" | "days";
type FilterOption = "all" | "visit" | "collected" | "pending";

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// Offline is enabled per-user via device enrollment, not a global flag.
// The server checks enrollment status before allowing offline operations.

export default function CollectorDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quote] = useState(() => getDailyQuote("susu"));

  // Offline state
  const [isOnline, setIsOnline] = useState(true);
  const [pendingTxs, setPendingTxs] = useState<OfflineTransaction[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [lastSyncTime, setLastSyncTime] = useState<string>("");
  const [offlineAuthExpired, setOfflineAuthExpired] = useState(false);
  const [offlineAuthExpiry, setOfflineAuthExpiry] = useState(0);
  const [offlineEnabled, setOfflineEnabled] = useState(false);
  const [enrollingOffline, setEnrollingOffline] = useState(false);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("amount");

  // Collection recording
  const [recordingFor, setRecordingFor] = useState<ToVisitCustomer | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectNotes, setCollectNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  // Initialize
  useEffect(() => {
    loadData();
    return () => { stopAutoSync(); };
  }, []);

  // Online/offline listener — always attached so the connectivity indicator
  // reflects the real network state (and we auto-sync when reconnecting).
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); attemptSync(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Resume offline mode automatically if this device was already enrolled on a
  // previous visit (no admin action required). New devices use the
  // "Enable Offline" button.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const did = await getOrCreateDeviceId();
        setDeviceId(did);
        const checkRes = await fetch(`/api/offline/enroll?deviceId=${encodeURIComponent(did)}`, {
          credentials: "include",
        });
        if (!cancelled && checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.enrolled) {
            await startOfflineSession();
          }
        }
      } catch {
        /* Offline unavailable — the page still works fully online. */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cache the day's customer list into IndexedDB so collections can be
  // recorded and viewed without a connection.
  async function cacheCustomersForOffline() {
    try {
      const authRes = await fetch("/api/auth/me?module=susu");
      const authUser = authRes.ok ? await authRes.json() : null;
      if (!authUser?.userId) return;
      const dashboardData = (await getCollectorDashboardStats(authUser.userId)) as DashboardData | null;
      const toVisit = dashboardData?.toVisit || [];
      const customers: CachedCustomer[] = toVisit.map((c) => ({
        accountId: c.accountId,
        customerName: c.customerName,
        customerIdCode: c.customerIdCode,
        dailyContribution: c.dailyContribution,
        outstandingDays: c.outstandingDays,
        expectedAmount: c.expectedAmount,
        lastSynced: new Date().toISOString(),
      }));
      await cacheCustomers(customers);
    } catch {
      /* Non-fatal: customers will cache on the next successful sync. */
    }
  }

  // Activate offline mode for this device (idempotent — safe to call again).
  async function startOfflineSession() {
    if (offlineEnabled) return;
    setOfflineEnabled(true);
    await refreshPendingTxs();
    startAutoSync(handleSyncResults);
    await cacheCustomersForOffline();
  }

  // Enroll this device with the server (self-service — no admin pre-approval
  // needed) and then start the offline session.
  async function enrollAndStartOffline() {
    if (offlineEnabled) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("You appear to be offline. Connect to the internet once to enable offline mode.");
      return;
    }
    setEnrollingOffline(true);
    setError("");
    try {
      const did = await getOrCreateDeviceId();
      setDeviceId(did);
      const res = await fetch("/api/offline/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ deviceId: did, module: "susu" }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "Could not enable offline mode. Please try again.");
        return;
      }
      const result = await res.json();
      if (result.device?.authorizedAt) setOfflineAuthorizedAt(result.device.authorizedAt);
      else setOfflineAuthorizedAt(new Date());
      await startOfflineSession();
    } catch (err) {
      console.error("Offline enrollment failed:", err);
      setError("Could not reach the server to enable offline mode. Check your connection and try again.");
    } finally {
      setEnrollingOffline(false);
    }
  }

  // Periodically check offline auth expiry
  useEffect(() => {
    if (!offlineEnabled) return;
    const interval = setInterval(() => {
      setOfflineAuthExpired(isOfflineAuthExpired());
      setOfflineAuthExpiry(secondsUntilOfflineAuthExpiry());
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncResults = useCallback((results: SyncResult[]) => {
    const syncedCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;
    if (syncedCount > 0) {
      setSuccess(`${syncedCount} collection${syncedCount !== 1 ? "s" : ""} synced successfully`);
      loadData();
    }
    if (failedCount > 0) {
      setError(`${failedCount} collection${failedCount !== 1 ? "s" : ""} need${failedCount === 1 ? "s" : ""} attention`);
    }
    refreshPendingTxs();
  }, []);

  async function refreshPendingTxs() {
    const pending = await getPendingTransactions();
    setPendingTxs(pending);
  }

  async function attemptSync() {
    if (!navigator.onLine) return;
    const connected = await checkConnectivity();
    if (!connected) return;
    setSyncing(true);
    try {
      const results = await syncPendingTransactions();
      handleSyncResults(results);
    } finally {
      setSyncing(false);
      setLastSyncTime(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    }
  }

  async function loadData() {
    try {
      const authRes = await fetch("/api/auth/me?module=susu");
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

      // Try online first
      if (navigator.onLine) {
        try {
          const result = await recordContribution({
            accountId: recordingFor.accountId, amount: amountNum, channel: "collector",
            notes: collectNotes || undefined,
          });
          if (result.success) {
            const resultData = result.data as { daysAllocated: number };
            setSuccess(`${recordingFor.customerName}: ${formatCedi(amountNum)} — ${resultData.daysAllocated} day(s) covered ✓`);
            setRecordingFor(null); setCollectAmount(""); setCollectNotes("");
            loadData();
            return;
          }
        } catch {
          // Online failed — fall through to offline queue
        }
      }

      // Offline: queue the transaction
      if (offlineEnabled && deviceId) {
        const idempotencyKey = `${deviceId}-${crypto.randomUUID()}`;
        const tx: OfflineTransaction = {
          id: crypto.randomUUID(),
          deviceId,
          userId: user?.userId || "",
          type: "contribution",
          idempotencyKey,
          payload: JSON.stringify({
            accountId: recordingFor.accountId,
            amount: amountNum,
            channel: "collector",
            notes: collectNotes || undefined,
          }),
          status: "pending_sync",
          retryCount: 0,
          maxRetries: 5,
          failureReason: null,
          serverResult: null,
          localTimestamp: new Date().toISOString(),
          syncStartedAt: null,
          syncedAt: null,
          createdAt: new Date().toISOString(),
        };
        await addTransaction(tx);
        setSuccess(`${recordingFor.customerName}: ${formatCedi(amountNum)} — Saved on device ⏳`);
        setRecordingFor(null); setCollectAmount(""); setCollectNotes("");
        refreshPendingTxs();
      } else {
        setError("Unable to record. Check your connection and try again.");
      }
    } catch (err) { if (isRedirectError(err)) throw err;
      setError("Something went wrong. Please try again.");
    } finally { setSubmitting(false); }
  }

  // Filtered + sorted data
  const filteredToVisit = useMemo(() => {
    if (!data) return [];
    let list = data.toVisit;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.customerName.toLowerCase().includes(q) || c.customerIdCode.toLowerCase().includes(q));
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
      list = list.filter(c => c.customerName.toLowerCase().includes(q) || c.customerIdCode.toLowerCase().includes(q));
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
  const showPending = filter === "pending";

  return (
    <div className="space-y-5">
      {/* Header with greeting */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}, {user?.fullName || "Collector"} 👋</h1>
            <p className="text-sm text-green-600 italic mt-1">&ldquo;{quote}&rdquo;</p>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isOnline ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
              <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-yellow-500"}`}></span>
              {isOnline ? "Online" : "Offline"}
            </div>
            {offlineEnabled ? (
              <>
                {offlineAuthExpired && !isOnline && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    Reconnect required
                  </div>
                )}
                {lastSyncTime && <p className="text-[10px] text-gray-400">Last sync: {lastSyncTime}</p>}
                {!isOnline && !offlineAuthExpired && offlineAuthExpiry > 0 && (
                  <p className="text-[10px] text-yellow-600">Offline auth expires in {Math.floor(offlineAuthExpiry / 3600)}h{Math.floor((offlineAuthExpiry % 3600) / 60)}m</p>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={enrollAndStartOffline}
                disabled={enrollingOffline}
                className="btn btn-secondary text-sm"
              >
                {enrollingOffline ? "Enabling…" : "📱 Enable Offline"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">✓ {success}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Pending Sync Banner */}
      {offlineEnabled && pendingTxs.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-yellow-600 text-lg">⏳</span>
            <div>
              <p className="font-medium text-yellow-800">{pendingTxs.length} collection{pendingTxs.length !== 1 ? "s" : ""} waiting to sync</p>
              <p className="text-xs text-yellow-600">These will sync automatically when connection returns</p>
            </div>
          </div>
          {isOnline && (
            <button onClick={attemptSync} disabled={syncing} className="btn btn-secondary btn-sm">
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          )}
        </div>
      )}

      {/* Progress */}
      {data && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-3">Today&apos;s Collections</h2>
          {allDone && pendingTxs.length === 0 ? (
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
                <div className="text-2xl font-bold text-gray-700"><CediAmount amount={data.todayCollected} /></div>
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
            <div className="flex-1">
              <input type="text" placeholder="Search customers..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(["all", "visit", "collected"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filter === f ? "bg-green-100 text-green-700" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
                  {f === "all" ? "All" : f === "visit" ? "To Visit" : "Collected"}
                </button>
              ))}
              {offlineEnabled && pendingTxs.length > 0 && (
                <button onClick={() => setFilter("pending")}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filter === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
                  ⏳ Pending ({pendingTxs.length})
                </button>
              )}
            </div>
            {showVisit && remaining > 0 && (
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600">
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
                    <span>Daily: <CediAmount amount={customer.dailyContribution} /></span>
                    <span>{customer.outstandingDays}d due</span>
                  </div>
                  <div className="font-semibold text-sm text-green-700"><CediAmount amount={customer.expectedAmount} /></div>
                </div>
                <button onClick={() => { setRecordingFor(customer); setCollectAmount(String(customer.expectedAmount)); }}
                  className="btn btn-primary btn-sm w-full mt-3">💵 Collect</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty search */}
      {data && showVisit && searchQuery && filteredToVisit.length === 0 && remaining > 0 && (
        <div className="text-center py-6 text-gray-500"><p className="text-sm">No customers matching &ldquo;{searchQuery}&rdquo;</p></div>
      )}

      {/* All caught up */}
      {data && allDone && pendingTxs.length === 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
          <p className="text-3xl mb-2">🎉</p>
          <p className="font-medium text-gray-700">All collections completed for today!</p>
          <p className="text-sm text-gray-500 mt-1">{totalAssigned} of {totalAssigned} collected</p>
        </div>
      )}

      {/* Pending Sync List */}
      {showPending && pendingTxs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-1 px-1">⏳ Pending Sync</h2>
          <p className="text-sm text-gray-500 mb-3 px-1">{pendingTxs.length} collection{pendingTxs.length !== 1 ? "s" : ""} saved on device</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingTxs.map((tx) => {
              const payload = JSON.parse(tx.payload);
              const cust = data?.toVisit.find((c) => c.accountId === payload.accountId) || data?.collectedToday.find((c) => c.accountId === payload.accountId);
              return (
                <div key={tx.id} className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-yellow-600">⏳</span>
                    <span className="font-medium text-sm truncate">{cust?.customerName || "Customer"}</span>
                  </div>
                  <div className="font-semibold text-sm text-yellow-800"><CediAmount amount={payload.amount} /></div>
                  <div className="text-xs text-yellow-600 mt-1">
                    Saved {formatTime(tx.localTimestamp)} · {tx.retryCount > 0 ? `Retry ${tx.retryCount}/${tx.maxRetries}` : "Waiting"}
                  </div>
                </div>
              );
            })}
          </div>
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
                  <span className="font-medium text-sm truncate">{customer.customerName}</span>
                </div>
                <div className="text-xs text-gray-400 mb-2">{customer.customerIdCode}</div>
                <div className="font-semibold text-sm text-green-700"><CediAmount amount={customer.amountCollected} /></div>
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
                  <span className="font-mono"><CediAmount amount={r.remittedAmount} /></span>
                  {r.variance !== 0 && (
                    <span className={`ml-2 text-xs ${r.variance > 0 ? "text-red-600" : "text-green-600"}`}>
                      ({r.variance > 0 ? "Short " : "Over "}<CediAmount amount={Math.abs(r.variance)} />)
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
                {recordingFor.outstandingDays} day{recordingFor.outstandingDays !== 1 ? "s" : ""} due · Expected: <CediAmount amount={recordingFor.expectedAmount} />
              </div>
            </div>
            {!isOnline && offlineEnabled && offlineAuthExpired && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-4 text-xs text-red-700">
                ⚠️ Reconnect to the internet and sign in again before continuing offline work.
              </div>
            )}
            {!isOnline && offlineEnabled && !offlineAuthExpired && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-4 text-xs text-yellow-700">
                ⚠️ You&apos;re offline. This will be saved on your device and synced when you reconnect.
              </div>
            )}
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
              <button onClick={handleRecordCollection} className="btn btn-primary flex-1" disabled={submitting || (!isOnline && offlineEnabled && offlineAuthExpired)}>
                {submitting ? "Recording..." : !isOnline && offlineEnabled ? (offlineAuthExpired ? "🔒 Reconnect Required" : "💾 Save on Device") : "✅ Record"}
              </button>
              <button onClick={() => { setRecordingFor(null); setCollectAmount(""); }} className="btn btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
