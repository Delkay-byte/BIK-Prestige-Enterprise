"use client";

import { useState } from "react";
import { login } from "@/lib/actions/auth.actions";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    try {
      const result = await login(formData);
      if (result && !result.success) {
        setError(result.error || "Login failed");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-green-700">BIK Prestige Enterprise</h1>
          <p className="text-gray-600 mt-2">Business Management Platform</p>
        </div>
        <div className="card">
          <h2 className="text-xl font-semibold mb-6">Sign In</h2>
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
              <input type="password" id="password" name="password" placeholder="Enter your password" required autoComplete="current-password" />
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
        <p className="text-center text-xs text-gray-400 mt-6">
          Built by BloomCore Technologies
        </p>
        <p className="text-center text-sm text-gray-500 mt-2">
          Contact your administrator for account access
        </p>
      </div>
    </div>
  );
}
