"use client";

import { useState } from "react";
import { logout } from "@/lib/actions/auth.actions";
import { clearTabSession } from "@/components/TabSessionGuard";

/**
 * Sign-out button with an explicit confirmation step.
 * Logout only happens after the user confirms in the dialog.
 */
export default function ConfirmSignOutButton({
  className = "",
  label = "Sign Out",
  icon = "🚪",
}: {
  className?: string;
  label?: string;
  icon?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmSignOut() {
    setBusy(true);
    try {
      clearTabSession();
      await logout();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {icon && <span className="text-lg">{icon}</span>}
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-title"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 id="signout-title" className="text-lg font-semibold text-gray-900">
              Sign out?
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              Are you sure you want to sign out of BIK Prestige Enterprise?
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-secondary flex-1"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSignOut}
                className="btn btn-danger flex-1"
                disabled={busy}
              >
                {busy ? "Signing out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
