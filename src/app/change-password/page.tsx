"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/lib/actions/auth.actions";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const result = await changePassword(formData);
      if (result.success) {
        setSuccess("Password changed successfully");
        setTimeout(() => router.back(), 1500);
      } else {
        setError(result.error || "Failed to change password");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="card">
          <h1 className="text-xl font-bold mb-6">Change Password</h1>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
          {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}
          <form action={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input type="password" name="currentPassword" required autoComplete="current-password" />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input type="password" name="newPassword" required autoComplete="new-password" placeholder="Min 8 chars, 1 uppercase, 1 number" />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input type="password" name="confirmPassword" required autoComplete="new-password" />
            </div>
            <div className="flex gap-3 mt-4">
              <button type="submit" className="btn btn-primary flex-1" disabled={loading}>
                {loading ? "Changing..." : "Change Password"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
