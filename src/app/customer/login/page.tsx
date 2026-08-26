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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/branding/bik-prestige-logo.svg"
            alt="BIK Prestige Enterprise"
            className="h-16 w-auto mx-auto"
            width={256}
            height={128}
          />
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Customer Savings Portal</h1>
          <p className="text-gray-600 mt-2">View your Susu savings, payments, withdrawals and account history.</p>
        </div>
        <div className="card">
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
          <form action={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="identifier">Customer ID, Phone or Email</label>
              <input
                type="text"
                id="identifier"
                name="identifier"
                placeholder="Enter your Customer ID, phone number or email"
                required
                autoComplete="username"
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
              />
              <div className="text-right mt-1">
                <Link href="/customer/forgot-password" className="text-xs text-blue-600 hover:text-blue-700">
                  Forgot Password?
                </Link>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full mt-2" disabled={loading}>
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