"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDailyAccountById, reviewDailyAccount } from "@/lib/actions/daily-account.actions";
import { formatCedi, formatDate, formatDateTime } from "@/lib/utils";

interface AccountDetail {
  id: string; businessDate: Date; status: string; submittedAt?: Date | null; reviewedAt?: Date | null;
  openingMomoFloat: number; openingCash: number; totalCashIn: number; totalCashOut: number;
  totalCashReceived: number; totalCashPaid: number; commission: number; otherIncome: number;
  closingMomoFloat: number; closingCash: number; totalExpenses: number;
  calculatedMomoVariance: number; calculatedCashVariance: number;
  location: { id: string; name: string; code: string; address?: string | null; contactPhone?: string | null };
  worker: { id: string; fullName: string; email: string; phone?: string | null };
  expenses: Array<{ id: string; description: string; amount: number }>;
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => { loadAccount(); }, [params.id]);

  async function loadAccount() {
    try { const data = await getDailyAccountById(params.id as string); setAccount(data as unknown as AccountDetail); }
    catch { setError("Failed to load report"); } finally { setLoading(false); }
  }

  async function handleReview() {
    if (!account) return;
    setReviewing(true);
    try {
      const result = await reviewDailyAccount(account.id);
      if (result.success) { setSuccess("Report reviewed successfully"); loadAccount(); }
      else setError(result.error || "Failed to review report");
    } catch { setError("An unexpected error occurred"); } finally { setReviewing(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner"></div></div>;
  if (!account) return <div className="text-center py-20"><p className="text-gray-500">Report not found</p><button onClick={() => router.push("/admin/reports")} className="btn btn-primary mt-4">Back to Reports</button></div>;

  const momoVariance = Number(account.calculatedMomoVariance);
  const cashVariance = Number(account.calculatedCashVariance);
  const totalVariance = momoVariance + cashVariance;

  return (
    <div>
      <div className="mb-8">
        <button onClick={() => router.push("/admin/reports")} className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block">← Back to Reports</button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Daily Report — {formatDate(account.businessDate)}</h1>
            <p className="text-gray-500 mt-1">{account.location.name} ({account.location.code}) &bull; {account.worker.fullName}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`badge ${account.status === "submitted" ? "badge-green" : account.status === "reviewed" ? "badge-blue" : "badge-yellow"}`}>{account.status}</span>
            {account.status === "submitted" && <button onClick={handleReview} className="btn btn-primary btn-sm" disabled={reviewing}>{reviewing ? "Reviewing..." : "✓ Mark as Reviewed"}</button>}
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">{success}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card"><div className="text-sm text-gray-500">Business Date</div><div className="font-medium">{formatDate(account.businessDate)}</div></div>
        <div className="card"><div className="text-sm text-gray-500">Submitted At</div><div className="font-medium">{account.submittedAt ? formatDateTime(account.submittedAt) : "Not submitted"}</div></div>
        <div className="card"><div className="text-sm text-gray-500">Reviewed At</div><div className="font-medium">{account.reviewedAt ? formatDateTime(account.reviewedAt) : "Not reviewed"}</div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-4">Balances</h3>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Opening Balances</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3"><div className="text-xs text-blue-600">MoMo Float</div><div className="font-semibold text-blue-800">{formatCedi(account.openingMomoFloat)}</div></div>
                <div className="bg-green-50 rounded-lg p-3"><div className="text-xs text-green-600">Cash</div><div className="font-semibold text-green-800">{formatCedi(account.openingCash)}</div></div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Closing Balances</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3"><div className="text-xs text-blue-600">MoMo Float</div><div className="font-semibold text-blue-800">{formatCedi(account.closingMomoFloat)}</div></div>
                <div className="bg-green-50 rounded-lg p-3"><div className="text-xs text-green-600">Cash</div><div className="font-semibold text-green-800">{formatCedi(account.closingCash)}</div></div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Daily Business Totals</h3>
          <div className="space-y-2">
            <div className="flex justify-between"><span className="text-sm text-gray-600">MoMo Cash-In (Deposits)</span><span className="font-mono text-sm">{formatCedi(account.totalCashIn)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-600">MoMo Cash-Out (Withdrawals)</span><span className="font-mono text-sm">{formatCedi(account.totalCashOut)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-600">Cash Received</span><span className="font-mono text-sm">{formatCedi(account.totalCashReceived)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-600">Cash Paid Out</span><span className="font-mono text-sm">{formatCedi(account.totalCashPaid)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-600">Commission</span><span className="font-mono text-sm">{formatCedi(account.commission)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-600">Other Income</span><span className="font-mono text-sm">{formatCedi(account.otherIncome)}</span></div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Reconciliation</h3>
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-600 mb-1">MoMo Float Variance</div>
              <div className={`text-lg font-bold ${momoVariance === 0 ? "text-green-600" : "text-red-600"}`}>{momoVariance === 0 ? "GH\u20B5 0.00" : `${momoVariance > 0 ? "+" : ""}${formatCedi(momoVariance)}`}</div>
              <div className="text-xs text-gray-500 mt-1">Expected: {formatCedi(Number(account.openingMomoFloat) + Number(account.totalCashIn) - Number(account.totalCashOut))} &bull; Reported: {formatCedi(account.closingMomoFloat)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-600 mb-1">Cash Variance</div>
              <div className={`text-lg font-bold ${cashVariance === 0 ? "text-green-600" : "text-red-600"}`}>{cashVariance === 0 ? "GH\u20B5 0.00" : `${cashVariance > 0 ? "+" : ""}${formatCedi(cashVariance)}`}</div>
              <div className="text-xs text-gray-500 mt-1">Expected: {formatCedi(Number(account.openingCash) + Number(account.totalCashReceived) + Number(account.commission) + Number(account.otherIncome) - Number(account.totalCashPaid) - Number(account.totalExpenses))} &bull; Reported: {formatCedi(account.closingCash)}</div>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total Variance</span>
                <span className={`text-xl font-bold ${totalVariance === 0 ? "text-green-600" : "text-red-600"}`}>{totalVariance === 0 ? "GH\u20B5 0.00" : `${totalVariance > 0 ? "+" : ""}${formatCedi(totalVariance)}`}</span>
              </div>
              <div className="text-right"><span className={`badge ${totalVariance === 0 ? "badge-green" : "badge-red"} mt-1`}>{totalVariance === 0 ? "Balanced" : "Discrepancy"}</span></div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Expenses ({account.expenses.length})</h3>
          {account.expenses.length === 0 ? <p className="text-gray-500 text-sm">No expenses recorded.</p> : (
            <div className="space-y-2">
              {account.expenses.map((expense) => (
                <div key={expense.id} className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                  <span className="text-sm">{expense.description}</span>
                  <span className="font-mono text-sm">{formatCedi(expense.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t font-medium">
                <span>Total Expenses</span>
                <span className="font-mono">{formatCedi(account.totalExpenses)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
