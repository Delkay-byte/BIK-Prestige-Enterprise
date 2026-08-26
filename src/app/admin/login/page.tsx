"use client";

import { useState } from "react";
import { adminLogin } from "@/lib/actions/auth.actions";
import PasswordInput from "@/components/PasswordInput";
import { markTabAuthenticated } from "@/components/TabSessionGuard";
import { isRedirectError } from "@/lib/errors";
import Link from "next/link";

export default function AdminLoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [passwordReset] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("reason") === "password_reset";
    }
    return false;
  });

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    markTabAuthenticated();
    try {
      const result = await adminLogin(formData);
      if (result && !result.success) {
        setError(result.error || "Login failed");
      }
    } catch (err) {
      if (isRedirectError(err)) throw err;
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          <img
            src="/branding/bik-prestige-logo.svg"
            alt="BIK Prestige Enterprise"
            className="h-14 w-auto mx-auto"
            width={224}
            height={112}
          />
          <p className="text-emerald-200/80 mt-2 text-sm">Administrator Sign In</p>
        </div>

        <div className="card bg-white">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Administrator Sign In</h2>

          {passwordReset && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">
              ✓ Password reset successful. Please sign in with your new password.
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form action={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="Enter your administrator email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                name="password"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
              <div className="text-right mt-1">
                <Link href="/forgot-password" className="text-xs text-emerald-600 hover:text-emerald-700">
                  Forgot password?
                </Link>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="spinner" />
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <Link href="/login" className="text-xs text-gray-500 hover:text-gray-700">
              Staff &amp; customer login →
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-emerald-200/60 mt-8">
          Built by BloomCore Technologies
        </p>
      </div>
    </div>
  );
}
