"use client";

import { useState } from "react";
import { login } from "@/lib/actions/auth.actions";
import PasswordInput from "@/components/PasswordInput";
import { markTabAuthenticated } from "@/components/TabSessionGuard";
import { isRedirectError } from "@/lib/errors";
import Link from "next/link";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check for password_reset reason in URL (avoids useSearchParams Suspense issue)
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
      markTabAuthenticated();
      const result = await login(formData);
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-50 to-green-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/branding/bik-prestige-logo.svg"
            alt="BIK Prestige Enterprise"
            className="h-16 w-auto mx-auto"
            width={256}
            height={128}
          />
          <p className="text-gray-600 mt-2">Business Management Platform</p>
        </div>
        <div className="card">
          <h2 className="text-xl font-semibold mb-6">Sign In</h2>
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
              <label className="form-label" htmlFor="email">Email</label>
              <input type="email" id="email" name="email" placeholder="Enter your email" required autoComplete="email" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <PasswordInput id="password" name="password" placeholder="Enter your password" required autoComplete="current-password" />
              <div className="text-right mt-1">
                <Link href="/forgot-password" className="text-xs text-green-600 hover:text-green-700">
                  Forgot password?
                </Link>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full mt-2" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="spinner"></span>
                  Signing in...
                </span>
              ) : "Sign In"}
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
