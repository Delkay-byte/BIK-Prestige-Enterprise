"use client";

import { useEffect, useState, useCallback } from "react";
import { useRedirectHandler } from "@/hooks/useRedirectHandler";
import {
  getMoMoHistory,
  searchLocations,
  searchWorkers,
  type MoMoHistoryRecord,
  type MoMoHistorySummary,
} from "@/lib/actions/momo-history.actions";
import { formatCedi, formatDateTime } from "@/lib/utils";
import CediAmount from "@/components/CediAmount";
import SmartSearch from "@/components/SmartSearch";

type TransactionType = "" | "cash_in" | "cash_out" | "momo_added" | "momo_paid" | "commission" | "other_income" | "expenses" | "reconciliation";
type DatePreset = "" | "today" | "yesterday" | "24h" | "48h" | "7d" | "30d" | "custom";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "24h", label: "Last 24 Hours" },
  { value: "48h", label: "Last 48 Hours" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "custom", label: "Custom Range" },
];

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: "", label: "All Types" },
  { value: "cash_in", label: "Cash Received" },
  { value: "cash_out", label: "Cash Paid Out" },
  { value: "momo_added", label: "Money Added to MoMo" },
  { value: "momo_paid", label: "Money Paid from MoMo" },
  { value: "commission", label: "Commission Earned" },
  { value: "other_income", label: "Other Money Received" },
  { value: "expenses", label: "Business Expenses" },
  { value: "reconciliation", label: "Reconciliation Records" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "reviewed", label: "Reviewed" },
];

export default function MoMoHistoryPage() {
  const handleRedirect = useRedirectHandler();

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [transactionType, setTransactionType] = useState<TransactionType>("");
  const [locationId, setLocationId] = useState("");
  const [locationName, setLocationName] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [status, setStatus] = useState("");

  // Data
  const [records, setRecords] = useState<MoMoHistoryRecord[]>([]);
  const [summary, setSummary] = useState<MoMoHistorySummary | null>(null);
  const [pagination, setPagination] = useState<{ page: number; totalPages: number; total: number } | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getMoMoHistory({
        datePreset: datePreset || undefined,
        dateFrom: datePreset === "custom" ? dateFrom : undefined,
        dateTo: datePreset === "custom" ? dateTo : undefined,
        transactionType: transactionType || undefined,
        locationId: locationId || undefined,
        workerId: workerId || undefined,
        status: status || undefined,
        page,
        limit: 50,
      });
      setRecords(result.records);
      setSummary(result.summary);
      setPagination(result.pagination);
    } catch (err) {
      if (handleRedirect(err, setError, "Failed to load MoMo history")) return;
      setError("Failed to load MoMo history");
    } finally {
      setLoading(false);
    }
  }, [datePreset, dateFrom, dateTo, transactionType, locationId, workerId, status, page, handleRedirect]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function resetFilters() {
    setDatePreset("");
    setDateFrom("");
    setDateTo("");
    setTransactionType("");
    setLocationId("");
    setLocationName("");
    setWorkerId("");
    setWorkerName("");
    setStatus("");
    setPage(1);
  }

  function handleExportCSV() {
    if (records.length === 0) return;
    const headers = [
      "Date & Time",
      "Business Date",
      "Location",
      "Worker",
      "Type",
      "Amount",
      "Status",
      "Notes",
    ];
    const rows = records.map((r) => [
      formatDateTime(r.date),
      formatDateTime(r.businessDate),
      r.locationName,
      r.workerName,
      r.type,
      String(r.amount),
      r.status,
      r.notes,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bik-prestige-momo-history-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getTypeBadge(type: string) {
    switch (type) {
      case "Cash Received": return <span className="badge badge-green">Cash Received</span>;
      case "Cash Paid Out": return <span className="badge badge-orange">Cash Paid Out</span>;
      case "Money Added to MoMo": return <span className="badge badge-blue">MoMo Added</span>;
      case "Money Paid from MoMo": return <span className="badge badge-yellow">MoMo Paid</span>;
      case "Commission Earned": return <span className="badge badge-purple">Commission</span>;
      case "Other Money Received": return <span className="badge badge-teal">Other Income</span>;
      case "Business Expense": return <span className="badge badge-red">Expense</span>;
      case "Reconciliation Record": return <span className="badge badge-gray">Reconciliation</span>;
      default: return <span className="badge badge-gray">{type}</span>;
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MoMo Money &amp; History</h1>
          <p className="text-gray-500 mt-1">View all MoMo financial transactions across dates</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="btn btn-secondary btn-sm" disabled={records.length === 0}>
            Export CSV
          </button>
          <button onClick={resetFilters} className="btn btn-secondary btn-sm">
            Reset Filters
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2">✕</button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card bg-green-50 text-center">
            <div className="text-xs text-gray-600 mb-1">Cash Received</div>
            <div className="text-lg font-bold"><CediAmount amount={summary.totalCashReceived} /></div>
          </div>
          <div className="card bg-orange-50 text-center">
            <div className="text-xs text-gray-600 mb-1">Cash Paid Out</div>
            <div className="text-lg font-bold"><CediAmount amount={summary.totalCashPaid} /></div>
          </div>
          <div className="card bg-blue-50 text-center">
            <div className="text-xs text-gray-600 mb-1">Money Added to MoMo</div>
            <div className="text-lg font-bold"><CediAmount amount={summary.totalMomoAdded} /></div>
          </div>
          <div className="card bg-yellow-50 text-center">
            <div className="text-xs text-gray-600 mb-1">Money Paid from MoMo</div>
            <div className="text-lg font-bold"><CediAmount amount={summary.totalMomoPaid} /></div>
          </div>
          <div className="card bg-red-50 text-center">
            <div className="text-xs text-gray-600 mb-1">Business Expenses</div>
            <div className="text-lg font-bold"><CediAmount amount={summary.totalExpenses} /></div>
          </div>
          <div className="card bg-purple-50 text-center">
            <div className="text-xs text-gray-600 mb-1">Commission Earned</div>
            <div className="text-lg font-bold"><CediAmount amount={summary.totalCommission} /></div>
          </div>
          <div className="card bg-teal-50 text-center">
            <div className="text-xs text-gray-600 mb-1">Other Money Received</div>
            <div className="text-lg font-bold"><CediAmount amount={summary.totalOtherIncome} /></div>
          </div>
          <div className="card bg-gray-50 text-center">
            <div className="text-xs text-gray-600 mb-1">Total Records</div>
            <div className="text-lg font-bold">{summary.recordCount}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Date Preset */}
          <div className="form-group">
            <label className="form-label">Date Range</label>
            <select
              value={datePreset}
              onChange={(e) => {
                setDatePreset(e.target.value as DatePreset);
                setPage(1);
              }}
            >
              {DATE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Transaction Type */}
          <div className="form-group">
            <label className="form-label">Transaction Type</label>
            <select
              value={transactionType}
              onChange={(e) => {
                setTransactionType(e.target.value as TransactionType);
                setPage(1);
              }}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="form-group">
            <label className="form-label">Account Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Date Range */}
        {datePreset === "custom" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="form-group">
              <label className="form-label">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
            </div>
          </div>
        )}

        {/* Smart Search Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-group">
            <SmartSearch
              label="Location"
              placeholder="Search by location name or code..."
              searchFn={searchLocations}
              onSelect={(opt) => { setLocationId(opt.id); setLocationName(opt.label); setPage(1); }}
              onClear={() => { setLocationId(""); setLocationName(""); setPage(1); }}
              selectedOption={locationId ? { id: locationId, label: locationName } : null}
              minQueryLength={2}
              debounceMs={200}
            />
          </div>
          <div className="form-group">
            <SmartSearch
              label="Worker"
              placeholder="Search worker by name or email..."
              searchFn={searchWorkers}
              onSelect={(opt) => { setWorkerId(opt.id); setWorkerName(opt.label); setPage(1); }}
              onClear={() => { setWorkerId(""); setWorkerName(""); setPage(1); }}
              selectedOption={workerId ? { id: workerId, label: workerName } : null}
              minQueryLength={2}
              debounceMs={200}
            />
          </div>
        </div>
      </div>

      {/* Records List */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner"></div>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">📋</p>
            <p className="font-medium">No MoMo records found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Location</th>
                    <th>Worker</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td className="text-sm whitespace-nowrap">{formatDateTime(r.date)}</td>
                      <td className="text-sm">{r.locationName}</td>
                      <td className="text-sm">{r.workerName}</td>
                      <td>{getTypeBadge(r.type)}</td>
                      <td className="font-mono font-semibold">
                        {r.amount > 0 ? <CediAmount amount={r.amount} /> : <span className="text-gray-400">—</span>}
                      </td>
                      <td>
                        <span className={`badge ${
                          r.status === "reviewed" ? "badge-green" :
                          r.status === "submitted" ? "badge-blue" :
                          r.status === "draft" ? "badge-yellow" : "badge-gray"
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="text-sm text-gray-600 max-w-xs truncate">{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn btn-secondary btn-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page === pagination.totalPages}
                    className="btn btn-secondary btn-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
