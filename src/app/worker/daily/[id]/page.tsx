"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDailyAccountById, saveDailyAccount, submitDailyAccount } from "@/lib/actions/daily-account.actions";
import { formatCedi, formatDate } from "@/lib/utils";

interface Expense { description: string; amount: number; }
interface AccountDetail {
  id: string; businessDate: Date; status: string;
  openingMomoFloat: number; openingCash: number;
  totalCashIn: number; totalCashOut: number;
  totalCashReceived: number; totalCashPaid: number;
  commission: number; otherIncome: number;
  closingMomoFloat: number; closingCash: number;
  totalExpenses: number;
  calculatedMomoVariance: number; calculatedCashVariance: number;
  location: { name: string; code: string };
  expenses: Array<{ id: string; description: string; amount: number }>;
}

export default function DailyAccountFormPage() {
  const params = useParams();
  const router = useRouter();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [step, setStep] = useState(1);

  const [openingMomoFloat, setOpeningMomoFloat] = useState(0);
  const [openingCash, setOpeningCash] = useState(0);
  const [totalCashIn, setTotalCashIn] = useState(0);
  const [totalCashOut, setTotalCashOut] = useState(0);
  const [totalCashReceived, setTotalCashReceived] = useState(0);
  const [totalCashPaid, setTotalCashPaid] = useState(0);
  const [commission, setCommission] = useState(0);
  const [otherIncome, setOtherIncome] = useState(0);
  const [closingMomoFloat, setClosingMomoFloat] = useState(0);
  const [closingCash, setClosingCash] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  async function loadAccount() {
    try {
      const data = await getDailyAccountById(params.id as string);
      if (!data) { setError("Account not found or you don't have access"); return; }
      setAccount(data as unknown as AccountDetail);
      setOpeningMomoFloat(Number(data.openingMomoFloat));
      setOpeningCash(Number(data.openingCash));
      setTotalCashIn(Number(data.totalCashIn));
      setTotalCashOut(Number(data.totalCashOut));
      setTotalCashReceived(Number(data.totalCashReceived));
      setTotalCashPaid(Number(data.totalCashPaid));
      setCommission(Number(data.commission));
      setOtherIncome(Number(data.otherIncome));
      setClosingMomoFloat(Number(data.closingMomoFloat));
      setClosingCash(Number(data.closingCash));
      if (data.expenses && data.expenses.length > 0) {
        setExpenses(data.expenses.map((e) => ({ description: e.description, amount: Number(e.amount) })));
      }
    } catch { setError("Failed to load account"); } finally { setLoading(false); }
  }

  useEffect(() => { loadAccount(); }, [params.id]);

  function addExpense() { setExpenses([...expenses, { description: "", amount: 0 }]); }
  function removeExpense(index: number) { setExpenses(expenses.filter((_, i) => i !== index)); }
  function updateExpense(index: number, field: keyof Expense, value: string | number) {
    const updated = [...expenses]; updated[index] = { ...updated[index], [field]: value }; setExpenses(updated);
  }
  function getTotalExpenses() { return expenses.reduce((sum, e) => sum + (e.amount || 0), 0); }
  function calculateMomoVariance() { return closingMomoFloat - (openingMomoFloat + totalCashIn - totalCashOut); }
  function calculateCashVariance() { return closingCash - (openingCash + totalCashReceived + commission + otherIncome - totalCashPaid - getTotalExpenses()); }

  async function buildFormData(): Promise<FormData> {
    const formData = new FormData();
    formData.set("openingMomoFloat", String(openingMomoFloat));
    formData.set("openingCash", String(openingCash));
    formData.set("totalCashIn", String(totalCashIn));
    formData.set("totalCashOut", String(totalCashOut));
    formData.set("totalCashReceived", String(totalCashReceived));
    formData.set("totalCashPaid", String(totalCashPaid));
    formData.set("commission", String(commission));
    formData.set("otherIncome", String(otherIncome));
    formData.set("closingMomoFloat", String(closingMomoFloat));
    formData.set("closingCash", String(closingCash));
    formData.set("expenses", JSON.stringify(expenses.filter((e) => e.description && e.amount > 0)));
    return formData;
  }

  async function handleSave() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const formData = await buildFormData();
      const result = await saveDailyAccount(params.id as string, formData);
      if (result.success) setSuccess("Draft saved successfully — you can continue later.");
      else setError(result.error || "Failed to save");
    } catch { setError("An unexpected error occurred"); } finally { setSaving(false); }
  }

  async function handleSubmit() {
    setSubmitting(true); setError("");
    try {
      const formData = await buildFormData();
      const saveResult = await saveDailyAccount(params.id as string, formData);
      if (!saveResult.success) { setError(saveResult.error || "Failed to save"); setConfirmOpen(false); return; }
      const submitResult = await submitDailyAccount(params.id as string);
      if (submitResult.success) router.push("/worker/dashboard");
      else setError(submitResult.error || "Failed to submit");
    } catch { setError("An unexpected error occurred"); } finally { setSubmitting(false); setConfirmOpen(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner"></div></div>;
  if (!account) return <div className="text-center py-20"><p className="text-gray-500">Account not found</p><button onClick={() => router.push("/worker/dashboard")} className="btn btn-primary mt-4">Back to Dashboard</button></div>;

  if (account.status !== "draft") {
    return (
      <div>
        <button onClick={() => router.push("/worker/dashboard")} className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block">← Back to Dashboard</button>
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">This report has been submitted and is now read-only.</div>
        <div className="card">
          <h2 className="text-lg font-semibold mb-2">Daily Account — {formatDate(account.businessDate)}</h2>
          <p className="text-gray-500 mb-4">{account.location.name}</p>
          <p className="text-sm text-gray-500">Status: <span className="badge badge-green">{account.status}</span></p>
        </div>
      </div>
    );
  }

  const momoVariance = calculateMomoVariance();
  const cashVariance = calculateCashVariance();
  const totalVariance = momoVariance + cashVariance;
  const steps = [{ num: 1, label: "Start" }, { num: 2, label: "Totals" }, { num: 3, label: "Expenses" }, { num: 4, label: "Ending" }, { num: 5, label: "Review" }];

  return (
    <div className="space-y-4">
      <button onClick={() => router.push("/worker/dashboard")} className="text-sm text-gray-500 hover:text-gray-700 inline-block">← Back to Dashboard</button>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">Daily Account</h1>
        <p className="text-sm text-gray-500">{formatDate(account.businessDate)} &bull; {account.location.name}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

      <div className="flex gap-1 overflow-x-auto pb-2">
        {steps.map((s) => (
          <button key={s.num} onClick={() => setStep(s.num)} className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${step === s.num ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600"}`}>
            {s.num}. {s.label}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold">Starting Balances</h2>
          <p className="text-sm text-gray-500">Enter the balances you started business with today.</p>
          <div className="form-group"><label className="form-label">Starting Balance — MoMo (GH&#x20B5;)</label><input type="number" step="0.01" min="0" value={openingMomoFloat || ""} onChange={(e) => setOpeningMomoFloat(parseFloat(e.target.value) || 0)} placeholder="0.00" /><p className="form-hint">Money available in your MoMo account when you started today.</p></div>
          <div className="form-group"><label className="form-label">Starting Cash (GH&#x20B5;)</label><input type="number" step="0.01" min="0" value={openingCash || ""} onChange={(e) => setOpeningCash(parseFloat(e.target.value) || 0)} placeholder="0.00" /><p className="form-hint">Physical cash you had at the location at the start of the day.</p></div>
          <button onClick={() => setStep(2)} className="btn btn-primary w-full">Next: Daily Totals →</button>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold">Daily Business Totals</h2>
          <p className="text-sm text-gray-500">Enter the summary totals for today&apos;s operations.</p>
          <div className="form-group"><label className="form-label">Money Added to MoMo (GH&#x20B5;)</label><input type="number" step="0.01" min="0" value={totalCashIn || ""} onChange={(e) => setTotalCashIn(parseFloat(e.target.value) || 0)} placeholder="0.00" /><p className="form-hint">Total money added to your MoMo balance through customer deposits during the day.</p></div>
          <div className="form-group"><label className="form-label">Money Paid from MoMo (GH&#x20B5;)</label><input type="number" step="0.01" min="0" value={totalCashOut || ""} onChange={(e) => setTotalCashOut(parseFloat(e.target.value) || 0)} placeholder="0.00" /><p className="form-hint">Total money taken from your MoMo balance to pay customers withdrawing money.</p></div>
          <div className="form-group"><label className="form-label">Cash Received (GH&#x20B5;)</label><input type="number" step="0.01" min="0" value={totalCashReceived || ""} onChange={(e) => setTotalCashReceived(parseFloat(e.target.value) || 0)} placeholder="0.00" /><p className="form-hint">Physical cash received during the day.</p></div>
          <div className="form-group"><label className="form-label">Cash Paid Out (GH&#x20B5;)</label><input type="number" step="0.01" min="0" value={totalCashPaid || ""} onChange={(e) => setTotalCashPaid(parseFloat(e.target.value) || 0)} placeholder="0.00" /><p className="form-hint">Physical cash paid out during the day.</p></div>
          <div className="form-group"><label className="form-label">Commission Earned (GH&#x20B5;)</label><input type="number" step="0.01" min="0" value={commission || ""} onChange={(e) => setCommission(parseFloat(e.target.value) || 0)} placeholder="0.00" /><p className="form-hint">Commission earned from MoMo transactions.</p></div>
          <div className="form-group"><label className="form-label">Other Money Received (GH&#x20B5;)</label><input type="number" step="0.01" min="0" value={otherIncome || ""} onChange={(e) => setOtherIncome(parseFloat(e.target.value) || 0)} placeholder="0.00" /><p className="form-hint">Any other money received that is not already included above.</p></div>
          <div className="flex gap-3"><button onClick={() => setStep(1)} className="btn btn-secondary flex-1">← Back</button><button onClick={() => setStep(3)} className="btn btn-primary flex-1">Next: Expenses →</button></div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold">Business Expenses</h2>
          <p className="text-sm text-gray-500">Record money spent on business expenses during the day.</p>
          {expenses.map((expense, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1"><input type="text" placeholder="Description (e.g. Transport)" value={expense.description} onChange={(e) => updateExpense(index, "description", e.target.value)} /></div>
              <div className="w-32"><input type="number" step="0.01" min="0" placeholder="Amount" value={expense.amount || ""} onChange={(e) => updateExpense(index, "amount", parseFloat(e.target.value) || 0)} /></div>
              <button onClick={() => removeExpense(index)} className="text-red-500 hover:text-red-700 p-2">✕</button>
            </div>
          ))}
          <button onClick={addExpense} className="btn btn-secondary btn-sm w-full">+ Add Expense</button>
          {expenses.length > 0 && <div className="border-t pt-3"><div className="flex justify-between font-medium"><span>Total Business Expenses</span><span className="font-mono">{formatCedi(getTotalExpenses())}</span></div></div>}
          <div className="flex gap-3"><button onClick={() => setStep(2)} className="btn btn-secondary flex-1">← Back</button><button onClick={() => setStep(4)} className="btn btn-primary flex-1">Next: Ending →</button></div>
        </div>
      )}

      {step === 4 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold">Ending Balances</h2>
          <p className="text-sm text-gray-500">Count and enter what you actually have at the end of business today.</p>
          <div className="form-group"><label className="form-label">Ending Balance — MoMo (GH&#x20B5;)</label><input type="number" step="0.01" min="0" value={closingMomoFloat || ""} onChange={(e) => setClosingMomoFloat(parseFloat(e.target.value) || 0)} placeholder="0.00" /><p className="form-hint">How much MoMo money you have at the end of the day.</p></div>
          <div className="form-group"><label className="form-label">Ending Cash on Hand (GH&#x20B5;)</label><input type="number" step="0.01" min="0" value={closingCash || ""} onChange={(e) => setClosingCash(parseFloat(e.target.value) || 0)} placeholder="0.00" /><p className="form-hint">Physical cash you are holding at the end of the day.</p></div>
          <div className="flex gap-3"><button onClick={() => setStep(3)} className="btn btn-secondary flex-1">← Back</button><button onClick={() => setStep(5)} className="btn btn-primary flex-1">Next: Review →</button></div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-4">Review — Today&apos;s Account</h2>
            <div className="space-y-3">
              {/* MoMo Balance */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-blue-600 font-medium mb-2">MoMo Balance</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Starting Balance</span><span className="font-mono">{formatCedi(openingMomoFloat)}</span></div>
                  <div className="flex justify-between"><span>Money Added to MoMo</span><span className="font-mono text-green-700">+{formatCedi(totalCashIn)}</span></div>
                  <div className="flex justify-between"><span>Money Paid from MoMo</span><span className="font-mono text-red-700">-{formatCedi(totalCashOut)}</span></div>
                  <div className="flex justify-between pt-1 border-t border-blue-200 mt-1"><span className="font-medium">Expected Ending Balance</span><span className="font-mono font-medium">{formatCedi(openingMomoFloat + totalCashIn - totalCashOut)}</span></div>
                  <div className="flex justify-between"><span>Your Ending Balance</span><span className="font-mono">{formatCedi(closingMomoFloat)}</span></div>
                </div>
                <div className="mt-2 pt-2 border-t border-blue-200">
                  <div className="flex justify-between"><span className="text-sm font-medium">Difference</span><span className={`font-mono font-bold ${momoVariance === 0 ? "text-green-600" : "text-red-600"}`}>{momoVariance === 0 ? "GH\u20B5 0.00" : `${momoVariance > 0 ? "+" : "-"}${formatCedi(Math.abs(momoVariance))}`}</span></div>
                  <p className="text-xs text-blue-500 mt-1">The difference between your ending balance and the amount the system expects.</p>
                </div>
              </div>

              {/* Cash on Hand */}
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm text-green-600 font-medium mb-2">Cash on Hand</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Starting Cash</span><span className="font-mono">{formatCedi(openingCash)}</span></div>
                  <div className="flex justify-between"><span>Cash Received</span><span className="font-mono text-green-700">+{formatCedi(totalCashReceived)}</span></div>
                  <div className="flex justify-between"><span>Cash Paid Out</span><span className="font-mono text-red-700">-{formatCedi(totalCashPaid)}</span></div>
                  <div className="flex justify-between"><span>Commission Earned</span><span className="font-mono text-green-700">+{formatCedi(commission)}</span></div>
                  <div className="flex justify-between"><span>Other Money Received</span><span className="font-mono text-green-700">+{formatCedi(otherIncome)}</span></div>
                  <div className="flex justify-between"><span>Business Expenses</span><span className="font-mono text-red-700">-{formatCedi(getTotalExpenses())}</span></div>
                  <div className="flex justify-between pt-1 border-t border-green-200 mt-1"><span className="font-medium">Expected Cash</span><span className="font-mono font-medium">{formatCedi(openingCash + totalCashReceived + commission + otherIncome - totalCashPaid - getTotalExpenses())}</span></div>
                  <div className="flex justify-between"><span>Your Ending Cash</span><span className="font-mono">{formatCedi(closingCash)}</span></div>
                </div>
                <div className="mt-2 pt-2 border-t border-green-200">
                  <div className="flex justify-between"><span className="text-sm font-medium">Difference</span><span className={`font-mono font-bold ${cashVariance === 0 ? "text-green-600" : "text-red-600"}`}>{cashVariance === 0 ? "GH\u20B5 0.00" : `${cashVariance > 0 ? "+" : "-"}${formatCedi(Math.abs(cashVariance))}`}</span></div>
                </div>
              </div>

              {/* Total Difference */}
              <div className={`rounded-lg p-4 ${totalVariance === 0 ? "bg-green-100" : "bg-yellow-50 border border-yellow-300"}`}>
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Difference</span>
                  <span className={`text-xl font-bold ${totalVariance === 0 ? "text-green-700" : "text-red-700"}`}>{totalVariance === 0 ? "GH\u20B5 0.00" : `${totalVariance > 0 ? "+" : "-"}${formatCedi(Math.abs(totalVariance))}`}</span>
                </div>
                <div className="mt-1"><span className={`badge ${totalVariance === 0 ? "badge-green" : "badge-red"}`}>{totalVariance === 0 ? "Balanced" : "⚠ Check Required"}</span></div>
                {totalVariance !== 0 && (
                  <p className="text-sm text-yellow-800 mt-2">
                    The amounts you entered do not match the expected figures. Please review your entries before submitting.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-3">Quick Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Business Expenses</span><span className="font-mono">{formatCedi(getTotalExpenses())}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Commission Earned</span><span className="font-mono">{formatCedi(commission)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Other Money Received</span><span className="font-mono">{formatCedi(otherIncome)}</span></div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(4)} className="btn btn-secondary flex-1">← Back</button>
            <button onClick={handleSave} className="btn btn-secondary flex-1" disabled={saving}>{saving ? "Saving..." : "Save Draft"}</button>
            <button onClick={() => setConfirmOpen(true)} className="btn btn-primary flex-1" disabled={submitting}>Submit Today&apos;s Account</button>
          </div>
          <p className="text-xs text-gray-400 text-center">Save Draft: save your work and continue later.</p>
        </div>
      )}

      {/* Submission confirmation — the report becomes locked after submitting */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 px-4" role="dialog" aria-modal="true" aria-labelledby="submit-title">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 id="submit-title" className="text-lg font-semibold text-gray-900">Submit today&apos;s account?</h2>
            <p className="text-sm text-gray-600 mt-2">After submission, the account will become read-only.</p>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setConfirmOpen(false)} className="btn btn-secondary flex-1" disabled={submitting}>Cancel</button>
              <button type="button" onClick={handleSubmit} className="btn btn-primary flex-1" disabled={submitting}>{submitting ? "Submitting..." : "Submit Account"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
