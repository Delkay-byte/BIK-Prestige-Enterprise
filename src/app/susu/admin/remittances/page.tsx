"use client";
import { isRedirectError } from "@/lib/errors";

import { useEffect, useState } from "react";
import {
  getRemittances,
  recordRemittance,
  getCollectors,
} from "@/lib/actions/susu-collector.actions";
import { formatCedi, formatDateTime } from "@/lib/utils";

interface RemittanceRecord {
  id: string;
  expectedAmount: number;
  remittedAmount: number;
  variance: number;
  status: string;
  notes?: string | null;
  createdAt: Date;
  collector: { user: { fullName: string } };
}

interface CollectorOption {
  id: string;
  user: { fullName: string };
}

export default function SusuRemittancesPage() {
  const [remittances, setRemittances] = useState<RemittanceRecord[]>([]);
  const [collectors, setCollectors] = useState<CollectorOption[]>([]);
  const [pagination, setPagination] = useState<{ page: number; totalPages: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState(1);

  // Remittance form
  const [showForm, setShowForm] = useState(false);
  const [selectedCollector, setSelectedCollector] = useState("");
  const [remittedAmount, setRemittedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadRemittances();
  }, [page]);

  useEffect(() => {
    loadCollectors();
  }, []);

  async function loadRemittances() {
    setLoading(true);
    try {
      const result = await getRemittances({ page, limit: 15 });
      setRemittances(result.remittances as unknown as RemittanceRecord[]);
      setPagination(result.pagination);
    } catch (err) { if (isRedirectError(err)) throw err;
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  async function loadCollectors() {
    try {
      const data = await getCollectors();
      setCollectors(data as unknown as CollectorOption[]);
    } catch (err) { if (isRedirectError(err)) throw err;
      /* ignore */
    }
  }

  async function handleRecordRemittance() {
    if (!selectedCollector) {
      setError("Please select a collector");
      return;
    }

    const amountNum = parseFloat(remittedAmount);
    if (!amountNum || amountNum < 0) {
      setError("Please enter a valid remittance amount");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const result = await recordRemittance({
        collectorId: selectedCollector,
        remittedAmount: amountNum,
        notes: notes || undefined,
      });

      if (result.success) {
        const data = result.data as { variance: number; expectedAmount: number };
        setSuccess(
          `Remittance recorded. Expected: ${formatCedi(data.expectedAmount)}, Remitted: ${formatCedi(amountNum)}, Variance: ${formatCedi(data.variance)}`
        );
        setShowForm(false);
        setSelectedCollector("");
        setRemittedAmount("");
        setNotes("");
        loadRemittances();
      } else {
        setError(result.error || "Failed to record remittance");
      }
    } catch (err) { if (isRedirectError(err)) throw err;
      setError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Collector Money Handed In</h1>
          <p className="text-gray-500 mt-1">Record and reconcile money collectors bring to the business</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
          {showForm ? "Cancel" : "+ Record Money Handed In"}
        </button>
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

      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Record Money Handed In</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Collector *</label>
              <select
                value={selectedCollector}
                onChange={(e) => setSelectedCollector(e.target.value)}
              >
                <option value="">Select collector</option>
                {collectors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.user.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Amount Handed In (GH₵) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Amount brought to office"
                value={remittedAmount}
                onChange={(e) => setRemittedAmount(e.target.value)}
              />
            </div>
            <div className="form-group md:col-span-2">
              <label className="form-label">Notes</label>
              <input
                type="text"
                placeholder="Optional note"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleRecordRemittance}
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? "Recording..." : "Record Remittance"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Remittances List */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner"></div>
          </div>
        ) : remittances.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">🏦</p>
            <p className="font-medium">No money handed in yet</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Collector</th>
                    <th>Expected to Bring In</th>
                    <th>Amount Handed In</th>
                    <th>Difference</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {remittances.map((r) => (
                    <tr key={r.id}>
                      <td className="text-sm">{formatDateTime(r.createdAt)}</td>
                      <td className="font-medium text-sm">{r.collector.user.fullName}</td>
                      <td className="font-mono text-sm">{formatCedi(r.expectedAmount)}</td>
                      <td className="font-mono text-sm font-semibold">{formatCedi(r.remittedAmount)}</td>
                      <td className="font-mono text-sm">
                        <span className={r.variance === 0 ? "text-green-600" : "text-red-600"}>
                          {r.variance === 0 ? "GH₵0.00" : `${r.variance > 0 ? "+" : ""}${formatCedi(r.variance)}`}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            r.status === "reconciled"
                              ? "badge-green"
                              : r.status === "discrepancy"
                              ? "badge-red"
                              : "badge-yellow"
                          }`}
                        >
                          {r.status === "reconciled" ? "Matches" : r.status === "discrepancy" ? "Short" : r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Page {pagination.page} of {pagination.totalPages}
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
