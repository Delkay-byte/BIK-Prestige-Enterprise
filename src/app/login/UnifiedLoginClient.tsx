"use client";

import { use, useState } from "react";
import { unifiedLogin } from "@/lib/actions/auth.actions";
import PasswordInput from "@/components/PasswordInput";
import { markTabAuthenticated } from "@/components/TabSessionGuard";
import { isRedirectError } from "@/lib/errors";
import Link from "next/link";

type RoleKey = "customer" | "momo" | "susu";

const ROLES: {
  key: RoleKey;
  icon: string;
  label: string;
  blurb: string;
  accent: string;
}[] = [
  {
    key: "customer",
    icon: "👤",
    label: "Customer",
    blurb: "View your Susu savings and account",
    accent: "border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50",
  },
  {
    key: "momo",
    icon: "💰",
    label: "MoMo Agent",
    blurb: "Manage today's MoMo transactions",
    accent: "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50",
  },
  {
    key: "susu",
    icon: "🧑‍💼",
    label: "Susu Collector",
    blurb: "Manage customer savings collections",
    accent: "border-amber-200 hover:border-amber-400 hover:bg-amber-50",
  },
];

const ROLE_META: Record<RoleKey, (typeof ROLES)[number]> = ROLES.reduce(
  (acc, r) => ({ ...acc, [r.key]: r }),
  {} as Record<RoleKey, (typeof ROLES)[number]>
);

export default function UnifiedLoginClient({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; reason?: string }>;
}) {
  const sp = use(searchParams);
  const requested = sp.role?.trim();

  const [selectedRole, setSelectedRole] = useState<RoleKey | null>(
    requested === "customer" || requested === "momo" || requested === "susu"
      ? (requested as RoleKey)
      : null
  );
  const [invalidAdmin, setInvalidAdmin] = useState(requested === "admin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Surface the "password reset successful" notice from the ?reason deep link.
  const passwordReset = sp.reason === "password_reset";

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    // Optimistically mark this tab as authenticated; the server guards
    // (cookie + capability checks) remain the real authority.
    markTabAuthenticated();
    try {
      const result = await unifiedLogin(formData);
      if (result && !result.success) {
        if (result.adminLogin) setInvalidAdmin(true);
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-emerald-50 to-amber-50 px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-7">
          <img
            src="/branding/bik-prestige-logo.svg"
            alt="BIK Prestige Enterprise"
            className="h-14 w-auto mx-auto"
            width={224}
            height={112}
          />
          <p className="text-gray-500 mt-2 text-sm">Business Management Platform</p>
        </div>

        {/* Invalid admin role */}
        {invalidAdmin && (
          <div className="card">
            <div className="text-center">
              <div className="text-4xl mb-3">🔒</div>
              <h2 className="text-xl font-semibold text-gray-900">Please use the administrator login.</h2>
              <p className="text-gray-500 mt-2 text-sm">
                The administrator sign-in is kept separate for security.
              </p>
              <Link href="/admin/login" className="btn btn-primary w-full mt-5 inline-block text-center">
                Go to Admin Login
              </Link>
              <button
                type="button"
                onClick={() => {
                  setInvalidAdmin(false);
                  setSelectedRole(null);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 mt-4 underline"
              >
                Back to login
              </button>
            </div>
          </div>
        )}

        {/* Role selection */}
        {!invalidAdmin && !selectedRole && (
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 text-center mb-1">Who are you?</h2>
            <p className="text-gray-500 text-center text-sm mb-6">
              Select your role to continue
            </p>
            <div className="space-y-3">
              {ROLES.map((role) => (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => setSelectedRole(role.key)}
                  className={`w-full card flex items-center gap-4 text-left transition-colors border-2 ${role.accent}`}
                >
                  <span className="text-3xl" aria-hidden="true">{role.icon}</span>
                  <span>
                    <span className="block text-lg font-semibold text-gray-900">{role.label}</span>
                    <span className="block text-sm text-gray-500">{role.blurb}</span>
                  </span>
                  <span className="ml-auto text-gray-400 font-bold text-xl">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected role + form */}
        {!invalidAdmin && selectedRole && (
          <div className="card">
            {/* Selected banner */}
            <div
              className={`rounded-lg px-4 py-3 mb-5 flex items-center gap-3 ${
                selectedRole === "customer"
                  ? "bg-indigo-50 border border-indigo-100"
                  : selectedRole === "momo"
                  ? "bg-emerald-50 border border-emerald-100"
                  : "bg-amber-50 border border-amber-100"
              }`}
            >
              <span className="text-2xl" aria-hidden="true">{ROLE_META[selectedRole].icon}</span>
              <span className="text-sm font-medium text-gray-700">
                You selected: <span className="font-semibold">{ROLE_META[selectedRole].label}</span>
              </span>
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-5">
              {selectedRole === "customer" ? "Customer Sign In" : "Sign In"}
            </h2>

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
              <input type="hidden" name="role" value={selectedRole} />

              <div className="form-group">
                <label className="form-label" htmlFor="identifier">
                  {selectedRole === "customer"
                    ? "Customer ID, Phone or Email"
                    : "Email or Phone"}
                </label>
                <input
                  type="text"
                  id="identifier"
                  name="identifier"
                  autoComplete={selectedRole === "customer" ? "username" : "username"}
                  placeholder={
                    selectedRole === "customer"
                      ? "Enter your Customer ID, phone or email"
                      : "Enter your email or phone"
                  }
                  required
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
                  <Link
                    href={selectedRole === "customer" ? "/customer/forgot-password" : "/forgot-password"}
                    className="text-xs text-emerald-600 hover:text-emerald-700"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
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

            <button
              type="button"
              onClick={() => {
                setError("");
                setSelectedRole(null);
              }}
              className="text-sm text-gray-500 hover:text-gray-700 mt-5 inline-flex items-center gap-1"
            >
              ← Change role
            </button>
          </div>
        )}

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
