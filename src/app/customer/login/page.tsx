"use client";

import { useState } from "react";
import { customerLogin } from "@/lib/actions/auth.actions";
import PasswordInput from "@/components/PasswordInput";
import { isRedirectError } from "@/lib/errors";
import Link from "next/link";

export default function CustomerLoginPage() {
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
    try {
      const result = await customerLogin(formData);
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50 to-amber-50 px-4 py-10">
      <div className="w-full max-w-md">
        {/* Distinct customer brand block */}
        <div className="text-center mb-6">
          <img
            src="/branding/bik-prestige-logo.svg"
            alt="BIK Prestige Enterprise"
            className="h-14 w-auto mx-auto"
            width={224}
            height={112}
          />
          <span className="inline-block mt-4 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold tracking-wide uppercase">
            Customer Portal
          </span>
          <h1 className="text-3xl font-extrabold text-gray-900 mt-3">Welcome back 👋</h1>
          <p className="text-gray-500 mt-1">Sign in to view your Susu savings, payments and history.</p>
        </div>

        {/* Distinct card styling (rounded-2xl, indigo accents) */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-7">
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
              <label className="form-label" htmlFor="identifier">Customer ID, Phone or Email</label>
              <input
                type="text"
                id="identifier"
                name="identifier"
                placeholder="Enter your Customer ID, phone number or email"
                required
                autoComplete="username"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
              <div className="text-right mt-1">
                <Link href="/customer/forgot-password" className="text-xs text-indigo-600 hover:text-indigo-700">
                  Forgot Password?
                </Link>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-3 px-4 transition disabled:opacity-60"
              disabled={loading}
            >
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
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Contact your administrator for account access
        </p>
      </div>
      <p className="text-center text-xs text-gray-400 mt-8">
        Built by BloomCore Technologies
      </p>
    </div>
  );
}
