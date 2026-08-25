"use client";
import { isRedirectError } from "@/lib/errors";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCustomerById, reassignCustomer } from "@/lib/actions/susu-customer.actions";
import { getCollectors } from "@/lib/actions/susu-collector.actions";
import { formatCedi, formatDate, formatDateTime } from "@/lib/utils";

interface CustomerDetail {
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
    status: string;
    cardCustody: string;
    cardFees: Array<{ id: string; amount: number; createdAt: Date }>;
    cycles: Array<{
      id: string;
      cycleNumber: number;
      startDate: Date;
      endDate: Date;
      dailyContribution: number;
      status: string;
      commissionCharged: boolean;
      contributions: Array<{
        id: string;
        amount: number;
        collectionDate: Date;
        channel: string;
        allocations: Array<{ cycleDay: number; amount: number }>;
      }>;
      withdrawals: Array<{
        id: string;
        requestedAmount: number;
        commissionAmount: number;
        netAmount: number;
        remainingBalance: number;
        createdAt: Date;
        notes?: string | null;
      }>;
      commissions: Array<{ id: string; amount: number; createdAt: Date }>;
    }>;
  }>;
  assignments: Array<{
    id: string;
    active: boolean;
    assignedAt: Date;
    unassignedAt?: Date | null;
    collector: { user: { id: string; fullName: string } };
  }>;
}

interface Collector {
  id: string;
  user: { fullName: string; email: string; status: string };
}

export default function SusuCustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Reassignment modal
  const [showReassign, setShowReassign] = useState(false);
  const [newCollectorId, setNewCollectorId] = useState("");
  const [collectorSearch, setCollectorSearch] = useState("");
  const [reassigning, setReassigning] = useState(false);

  async function loadCustomer() {
    try {
      const [customerData, collectorData] = await Promise.all([
        getCustomerById(params.id as string),
        getCollectors(),
      ]);
      setCustomer(customerData as unknown as CustomerDetail);
      setCollectors(collectorData as unknown as Collector[]);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      setError("Failed to load customer");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomer();
  }, [params.id]);

  async function handleReassign() {
    if (!newCollectorId || !customer) return;
    setReassigning(true);
    setError("");
    setSuccess("");
    try {
      const account = customer.accounts[0];
      if (!account) {
        setError("No active account found");
        return;
      }
      const result = await reassignCustomer({
        customerId: customer.id,
        accountId: account.id,
        newCollectorId,
      });
      if (result.success) {
        setSuccess("Customer reassigned successfully");
        setShowReassign(false);
        setNewCollectorId("");
        setCollectorSearch("");
        loadCustomer();
      } else {
        setError(result.error || "Failed to reassign customer");
      }
    } catch (err) {
      if (isRedirectError(err)) throw err;
      setError("An unexpected error occurred");
    } finally {
      setReassigning(false);
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner"></div>
      </div>
    );
  if (!customer)
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Customer not found</p>
        <button onClick={() => router.push("/susu/admin/customers")} className="btn btn-primary mt-4">
          Back to Customers
        </button>
      </div>
    );

  const account = customer.accounts[0];
  const currentCycle = account?.cycles[0];
  const activeAssignment = customer.assignments.find((a) => a.active);
  const currentCollector = activeAssignment?.collector?.user?.fullName;

  // Filter collectors for search
  const filteredCollectors = collectors.filter((c) => {
    if (c.user.status !== "active") return false;
    if (!collectorSearch) return true;
    const q = collectorSearch.toLowerCase();
    return (
      c.user.fullName.toLowerCase().includes(q) ||
      c.user.email.toLowerCase().includes(q)
    );
  });

  // Assignment history (inactive assignments + current)
  const assignmentHistory = customer.assignments;

  // Calculate cycle totals
  function getCycleStats(cycle: CustomerDetail["accounts"][0]["cycles"][0]) {
    const totalContributed = cycle.contributions.reduce((sum, c) => sum + Number(c.amount), 0);
    const totalWithdrawn = cycle.withdrawals.reduce((sum, w) => sum + Number(w.netAmount), 0);
    const totalCommissions = cycle.commissions.reduce((sum, c) => sum + Number(c.amount), 0);
    const paidDays = new Set(cycle.contributions.flatMap((c) => c.allocations.map((a) => a.cycleDay)));
    return { totalContributed, totalWithdrawn, totalCommissions, paidDays: paidDays.size };
  }

  return (
    <div>
      <div className="mb-8">
        <button
          onClick={() => router.push("/susu/admin/customers")}
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
        >
          ← Back to Customers
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.fullName}</h1>
            <p className="text-gray-500 mt-1">
              {customer.customerId} &bull; {customer.phone || "No phone"}
            </p>
          </div>
          <span
            className={`badge ${customer.status === "active" ? "badge-green" : "badge-red"}`}
          >
            {customer.status}
          </span>
        </div>
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

      {/* Current Collector + Account Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card border-l-4 border-l-blue-500">
          <div className="text-sm text-gray-500 mb-1">Current Collector</div>
          {currentCollector ? (
            <div className="font-semibold text-lg">{currentCollector}</div>
          ) : (
            <div className="text-gray-400 italic">No Collector Assigned</div>
          )}
          <button
            onClick={() => setShowReassign(true)}
            className="btn btn-secondary btn-sm mt-2"
          >
            Change Collector
          </button>
        </div>
        {account && (
          <>
            <div className="card">
              <div className="text-sm text-gray-500 mb-1">Account Number</div>
              <div className="font-mono font-semibold text-lg">{account.accountId}</div>
            </div>
            <div className="card">
              <div className="text-sm text-gray-500 mb-1">Daily Contribution</div>
              <div className="font-semibold text-lg text-green-700">
                {formatCedi(account.dailyContribution)}/day
              </div>
            </div>
          </>
        )}
      </div>

      {/* Collector History */}
      {assignmentHistory.length > 0 && (
        <div className="card mb-8">
          <h3 className="font-semibold mb-3">Collector History</h3>
          <div className="space-y-2">
            {assignmentHistory.map((a) => (
              <div key={a.id} className={`flex items-center justify-between p-3 rounded-lg ${a.active ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                <div>
                  <div className="font-medium text-sm">{a.collector.user.fullName}</div>
                  <div className="text-xs text-gray-500">
                    {formatDate(a.assignedAt)}
                    {a.unassignedAt ? ` — ${formatDate(a.unassignedAt)}` : " — Current"}
                  </div>
                </div>
                {a.active && <span className="badge badge-green text-xs">Current</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Card Fee */}
      {account && account.cardFees.length > 0 && (
        <div className="card mb-8">
          <h3 className="font-semibold mb-3">Card Fee</h3>
          {account.cardFees.map((fee) => (
            <div key={fee.id} className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
              <span className="text-sm">Card Purchase Fee</span>
              <span className="font-mono font-semibold">{formatCedi(fee.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cycles */}
      {account && account.cycles.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">Cycle History</h2>
          {account.cycles.map((cycle) => {
            const stats = getCycleStats(cycle);
            return (
              <div key={cycle.id} className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">
                      Cycle {cycle.cycleNumber} —{" "}
                      {formatDate(cycle.startDate)} to {formatDate(cycle.endDate)}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {stats.paidDays}/31 days paid &bull; Daily rate: {formatCedi(cycle.dailyContribution)}
                    </p>
                  </div>
                  <span
                    className={`badge ${
                      cycle.status === "active" ? "badge-green" : "badge-blue"
                    }`}
                  >
                    {cycle.status}
                  </span>
                </div>

                {/* Cycle Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xs text-green-600">Gross Contributions</div>
                    <div className="font-semibold">{formatCedi(stats.totalContributed)}</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-xs text-purple-600">Commission Charged</div>
                    <div className="font-semibold">{formatCedi(stats.totalCommissions)}</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3">
                    <div className="text-xs text-orange-600">Total Withdrawn</div>
                    <div className="font-semibold">{formatCedi(stats.totalWithdrawn)}</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xs text-blue-600">Remaining Balance</div>
                    <div className="font-semibold">
                      {formatCedi(stats.totalContributed - stats.totalWithdrawn - stats.totalCommissions)}
                    </div>
                  </div>
                </div>

                {/* Contributions */}
                {cycle.contributions.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-600 mb-2">Contributions</h4>
                    <div className="space-y-1">
                      {cycle.contributions.map((c) => (
                        <div key={c.id} className="flex justify-between items-center text-sm p-2 rounded bg-gray-50">
                          <div>
                            <span>{formatDate(c.collectionDate)}</span>
                            <span className="text-gray-400 ml-2">
                              ({c.channel === "collector" ? "Collector" : "Direct Office"})
                            </span>
                          </div>
                          <span className="font-mono">{formatCedi(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Withdrawals */}
                {cycle.withdrawals.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-600 mb-2">Withdrawals</h4>
                    <div className="space-y-1">
                      {cycle.withdrawals.map((w) => (
                        <div key={w.id} className="flex justify-between items-center text-sm p-2 rounded bg-orange-50">
                          <div>
                            <span>{formatDateTime(w.createdAt)}</span>
                            {w.commissionAmount > 0 && (
                              <span className="text-orange-600 ml-2">
                                (incl. {formatCedi(w.commissionAmount)} commission)
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-semibold">{formatCedi(w.netAmount)}</div>
                            <div className="text-xs text-gray-500">
                              Balance: {formatCedi(w.remainingBalance)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reassignment Modal */}
      {showReassign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-2">Change Collector</h3>

            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Customer:</span>
                <span className="font-medium">{customer.fullName}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Customer ID:</span>
                <span className="font-mono">{customer.customerId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Current Collector:</span>
                <span className="font-medium">{currentCollector || "None"}</span>
              </div>
            </div>

            <div className="form-group mb-4">
              <label className="form-label">New Collector</label>
              <input
                type="text"
                placeholder="Search collector by name..."
                value={collectorSearch}
                onChange={(e) => setCollectorSearch(e.target.value)}
                className="w-full"
              />
              <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredCollectors.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500 text-center">No collectors found</div>
                ) : (
                  filteredCollectors.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setNewCollectorId(c.id);
                        setCollectorSearch(c.user.fullName);
                      }}
                      className={`w-full text-left p-3 text-sm border-b border-gray-100 last:border-0 hover:bg-green-50 transition-colors ${
                        newCollectorId === c.id ? "bg-green-50 border-l-2 border-l-green-500" : ""
                      }`}
                    >
                      <div className="font-medium">{c.user.fullName}</div>
                      <div className="text-xs text-gray-500">{c.user.email}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {newCollectorId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
                <strong>Reassign this customer?</strong>
                <br />
                {customer.fullName} will be moved from {currentCollector || "no collector"} to{" "}
                {filteredCollectors.find((c) => c.id === newCollectorId)?.user?.fullName}.
                <br />
                <span className="text-blue-600">Previous collection history will remain unchanged.</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowReassign(false);
                  setNewCollectorId("");
                  setCollectorSearch("");
                }}
                className="btn btn-secondary flex-1"
                disabled={reassigning}
              >
                Cancel
              </button>
              <button
                onClick={handleReassign}
                className="btn btn-primary flex-1"
                disabled={!newCollectorId || reassigning}
              >
                {reassigning ? "Reassigning..." : "Reassign Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
