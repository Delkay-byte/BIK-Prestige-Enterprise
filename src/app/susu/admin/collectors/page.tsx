"use client";

import { useEffect, useState } from "react";
import {
  getCollectors,
  createCollector,
  toggleCollectorStatus,
} from "@/lib/actions/susu-collector.actions";

interface CollectorData {
  id: string;
  status: string;
  user: { id: string; fullName: string; email: string; phone?: string | null; status: string };
  assignments: Array<{ id: string }>;
  contributions: Array<{ id: string; amount: number }>;
  remittances: Array<{ id: string; status: string; expectedAmount: number; remittedAmount: number }>;
}

export default function SusuCollectorsPage() {
  const [collectors, setCollectors] = useState<CollectorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCollectors();
  }, []);

  async function loadCollectors() {
    try {
      const data = await getCollectors();
      setCollectors(data as unknown as CollectorData[]);
    } catch {
      setError("Failed to load collectors");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(formData: FormData) {
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const result = await createCollector(formData);
      if (result.success) {
        setSuccess("Collector created successfully");
        setShowForm(false);
        loadCollectors();
      } else {
        setError(result.error || "Failed to create collector");
      }
    } catch {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Susu Collectors</h1>
          <p className="text-gray-500 mt-1">Manage field collectors</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
          {showForm ? "Cancel" : "+ New Collector"}
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
          <h2 className="text-lg font-semibold mb-4">Register New Collector</h2>
          <form action={handleCreate}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input type="text" name="fullName" placeholder="Collector name" required />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input type="email" name="email" placeholder="collector@example.com" required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="tel" name="phone" placeholder="+233 XX XXX XXXX" />
              </div>
              <div className="form-group">
                <label className="form-label">Temporary Password *</label>
                <input type="password" name="password" placeholder="Min 8 chars" required />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Creating..." : "Create Collector"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {collectors.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">🚶</p>
            <p className="font-medium">No collectors yet</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Collector</th>
                  <th>Customers</th>
                  <th>Today&apos;s Collections</th>
                  <th>Last Remittance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {collectors.map((c) => {
                  const todayCollected = c.contributions.reduce((sum, col) => sum + Number(col.amount), 0);
                  const lastRemittance = c.remittances[0];
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="font-medium">{c.user.fullName}</div>
                        <div className="text-xs text-gray-500">{c.user.email}</div>
                        {c.user.phone && <div className="text-xs text-gray-400">{c.user.phone}</div>}
                      </td>
                      <td>{c.assignments.length}</td>
                      <td className="font-mono text-sm">
                        {todayCollected > 0 ? `GH₵${todayCollected.toFixed(2)}` : "—"}
                      </td>
                      <td>
                        {lastRemittance ? (
                          <span className={`badge ${lastRemittance.status === "reconciled" ? "badge-green" : "badge-red"}`}>
                            {lastRemittance.status}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">None</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${c.user.status === "active" ? "badge-green" : "badge-red"}`}>
                          {c.user.status}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={async () => {
                            const newStatus = c.user.status === "active" ? "inactive" : "active";
                            await toggleCollectorStatus(c.id, newStatus);
                            loadCollectors();
                          }}
                          className={`text-sm ${
                            c.user.status === "active"
                              ? "text-red-600 hover:text-red-800"
                              : "text-green-600 hover:text-green-800"
                          }`}
                        >
                          {c.user.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
