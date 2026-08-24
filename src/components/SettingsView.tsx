"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ChangePasswordForm from "@/components/ChangePasswordForm";

interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: string;
  location?: { id: string; name: string; code: string } | null;
  phone?: string | null;
}

const DASHBOARD_BY_MODULE: Record<string, string> = {
  admin: "/admin/dashboard",
  momo: "/worker/dashboard",
  susu: "/collector/dashboard",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  worker: "MoMo Worker",
  collector: "Susu Collector",
};

/**
 * Shared account settings (Profile + Change Password) rendered inside each
 * module's own authenticated area:
 *   /admin/settings, /worker/settings, /collector/settings
 */
export default function SettingsView({ module }: { module: "admin" | "momo" | "susu" }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"profile" | "password">("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadProfile() {
    try {
      const authRes = await fetch("/api/auth/me");
      if (!authRes.ok) {
        router.push("/login");
        return;
      }
      const authUser = await authRes.json();

      if (authUser?.userId) {
        const userRes = await fetch(`/api/user/${authUser.userId}`);
        if (userRes.ok) {
          const userData = await userRes.json();
          setProfile(userData);
        }
      }
    } catch {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Honor the ?tab=password deep link (used by first-login force-reset redirect).
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "password") {
      setActiveTab("password");
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="card text-center">
          <p className="text-gray-500">Unable to load profile</p>
          <button onClick={() => router.push("/login")} className="btn btn-primary mt-4">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  function handlePasswordChanged() {
    router.push(DASHBOARD_BY_MODULE[module] || "/login");
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account settings and preferences</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="card mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex gap-1 px-4" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "profile"}
              onClick={() => setActiveTab("profile")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "profile"
                  ? "border-green-500 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              👤 Profile
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "password"}
              onClick={() => setActiveTab("password")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "password"
                  ? "border-green-500 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              🔐 Change Password
            </button>
          </nav>
        </div>

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="p-6" role="tabpanel">
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-2xl font-bold text-green-700">
                    {profile.fullName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{profile.fullName}</h2>
                  <p className="text-sm text-gray-500">
                    {ROLE_LABELS[profile.role] || profile.role}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Full Name
                  </label>
                  <p className="text-gray-900 mt-1 font-medium">{profile.fullName}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Email
                  </label>
                  <p className="text-gray-900 mt-1 font-medium">{profile.email}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Phone
                  </label>
                  <p className="text-gray-900 mt-1 font-medium">
                    {profile.phone || <span className="text-gray-400">Not provided</span>}
                  </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Role
                  </label>
                  <p className="text-gray-900 mt-1 font-medium">
                    {ROLE_LABELS[profile.role] || profile.role}
                  </p>
                </div>
              </div>

              {profile.location && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Assigned Location
                  </label>
                  <p className="text-gray-900 mt-1 font-medium">
                    {profile.location.name} ({profile.location.code})
                  </p>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Profile information is read-only. Contact your administrator
                  to update your name, email, phone, or assigned location.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Change Password Tab */}
        {activeTab === "password" && (
          <div className="p-6" role="tabpanel">
            <ChangePasswordForm onSuccess={handlePasswordChanged} />
          </div>
        )}
      </div>

      {/* Footer attribution */}
      <p className="text-center text-xs text-gray-400 mt-8">
        BIK Prestige Enterprise — Built by BloomCore Technologies
      </p>
    </div>
  );
}
