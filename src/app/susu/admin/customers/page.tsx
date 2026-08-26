"use client";
import { isRedirectError } from "@/lib/errors";

import { useEffect, useState } from "react";
import {
  getCustomers,
  createCustomer,
  toggleCustomerStatus,
} from "@/lib/actions/susu-customer.actions";
import { getCollectors, assignCustomerToCollector } from "@/lib/actions/susu-collector.actions";
import { formatDate } from "@/lib/utils";
import CediAmount from "@/components/CediAmount";
import Link from "next/link";

interface Customer {
  id: string;
  customerId: string;
  fullName: string;
  phone?: string | null;
  address?: string | null;
  status: string;
  registeredAt: Date;
  accounts: Array<{
    id: string;
    accountId: string;
    dailyContribution: number;
    cycles: Array<{ id: string; cycleNumber: number; status: string }>;
  }>;
  assignments: Array<{
    id: string;
    collector: { user: { fullName: string } };
  }>;
}

interface Collector {
  id: string;
  user: { fullName: string };
}

export default function SusuCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  // Assignment modal state
  const [assignModal, setAssignModal] = useState<{ open: boolean; customerId: string; accountId: string }>({
    open: false,
    customerId: "",
    accountId: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [customerData, collectorData] = await Promise.all([
        getCustomers({ limit: 100 }),
        getCollectors(),
      ]);
      setCustomers(customerData.customers as unknown as Customer[]);
      setCollectors(collectorData as unknown as Collector[]);
    } catch (err) {
      // Re-throw Next.js redirect errors so the router handles them
      if (err && typeof err === "object" && "digest" in err) throw err;
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(formData: FormData) {
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const result = await createCustomer(formData);
      if (result.success) {
        setSuccess("Customer created successfully");
        setShowForm(false);
        loadData();
      } else {
        setError(result.error || "Failed to create customer");
      }
    } catch (err) { if (isRedirectError(err)) throw err;
      setError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssign(collectorId: string) {
    try {
      const result = await assignCustomerToCollector({
        collectorId,
        customerId: assignModal.customerId,
        accountId: assignModal.accountId,
      });
      if (result.success) {
        setSuccess("Customer assigned to collector");
        setAssignModal({ open: false, customerId: "", accountId: "" });
        loadData();
      } else {
        setError(result.error || "Failed to assign");
      }
    } catch (err) { if (isRedirectError(err)) throw err;
      setError("An unexpected error occurred");
    }
  }

  const filtered = customers.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.customerId.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
      );
    }
    return true;
  });

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
          <h1 className="text-2xl font-bold text-gray-900">Susu Customers</h1>
          <p className="text-gray-500 mt-1">Manage Susu customers and their accounts</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
          {showForm ? "Cancel" : "+ New Customer"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-500 hover:text-red-700">
            ✕
          </button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
          {success}
          <button onClick={() => setSuccess("")} className="ml-2 text-green-500 hover:text-green-700">
            ✕
          </button>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Register New Customer</h2>
          <form action={handleCreate}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input type="text" name="fullName" placeholder="Enter customer name" required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="tel" name="phone" placeholder="+233 XX XXX XXXX" />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input type="text" name="address" placeholder="Customer address" />
              </div>
              <div className="form-group">
                <label className="form-label">Daily Contribution (GH₵) *</label>
                <input
                  type="number"
                  name="dailyContribution"
                  step="0.01"
                  min="0.01"
                  placeholder="e.g. 50"
                  required
                />
                <p className="form-hint">The amount the customer commits to save per day</p>
              </div>
              <div className="form-group">
                <label className="form-label">Card Fee (GH₵)</label>
                <input
                  type="number"
                  name="cardFee"
                  step="0.01"
                  min="0"
                  defaultValue={10}
                  placeholder="10"
                />
                <p className="form-hint">Standard card fee is GH₵10</p>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Creating..." : "Create Customer"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="form-group">
            <label className="form-label">Search</label>
            <input
              type="text"
              placeholder="Name, ID, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Customer List */}
      <div className="card">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">🧑</p>
            <p className="font-medium">No customers found</p>
            <p className="text-sm mt-1">
              {search ? "Try adjusting your search." : "Register your first customer to get started."}
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Account</th>
                  <th>Daily Rate</th>
                  <th>Cycle</th>
                  <th>Collector</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => {
                  const account = customer.accounts[0];
                  const cycle = account?.cycles[0];
                  const collector = customer.assignments[0]?.collector?.user?.fullName;
                  return (
                    <tr key={customer.id}>
                      <td>
                        <div className="font-medium">{customer.fullName}</div>
                        <div className="text-xs text-gray-500">{customer.customerId}</div>
                        {customer.phone && (
                          <div className="text-xs text-gray-400">{customer.phone}</div>
                        )}
                      </td>
                      <td className="font-mono text-sm">
                        {account?.accountId || "—"}
                      </td>
                      <td className="font-mono text-sm">
                        {account ? <><CediAmount amount={account.dailyContribution} />/day</> : "—"}
                      </td>
                      <td>
                        {cycle ? (
                          <span className="badge badge-blue">Cycle {cycle.cycleNumber}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {collector ? (
                          <span className="text-sm">{collector}</span>
                        ) : (
                          <button
                            onClick={() =>
                              setAssignModal({
                                open: true,
                                customerId: customer.id,
                                accountId: account?.id || "",
                              })
                            }
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            Assign
                          </button>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            customer.status === "active" ? "badge-green" : "badge-red"
                          }`}
                        >
                          {customer.status}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <Link
                            href={`/susu/admin/customers/${customer.id}`}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            View
                          </Link>
                          <button
                            onClick={async () => {
                              const newStatus =
                                customer.status === "active" ? "inactive" : "active";
                              await toggleCustomerStatus(customer.id, newStatus);
                              loadData();
                            }}
                            className={`text-sm ${
                              customer.status === "active"
                                ? "text-red-600 hover:text-red-800"
                                : "text-green-600 hover:text-green-800"
                            }`}
                          >
                            {customer.status === "active" ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assignment Modal */}
      {assignModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Assign Collector</h3>
            <p className="text-sm text-gray-500 mb-4">Select a collector for this customer:</p>
            <div className="space-y-2">
              {collectors.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleAssign(c.id)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-green-50 hover:border-green-300 transition-colors"
                >
                  {c.user.fullName}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAssignModal({ open: false, customerId: "", accountId: "" })}
              className="btn btn-secondary w-full mt-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
