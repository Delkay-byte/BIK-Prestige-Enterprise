"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logout } from "@/lib/actions/auth.actions";
import { clearTabSession } from "@/components/TabSessionGuard";

/**
 * SessionMonitor — client-side session security enforcement.
 *
 * Responsibilities:
 * - Track user activity (clicks, keypresses, scroll, touch)
 * - Poll server for session status to display inactivity warning
 * - Detect background/hidden page and start 60-second grace timer
 * - Display session expiry warnings before inactivity + absolute timeouts
 * - Force logout on background timeout or absolute expiry
 *
 * Server-side enforcement is the authoritative mechanism.  This component
 * provides UX warnings and acts on the background/hidden-page rule.
 */

const SERVER_POLL_MS = 15_000; // poll server every 15 seconds
const BACKGROUND_GRACE_MS = 60_000; // 60 seconds before background logout
const ACTIVITY_THROTTLE_MS = 30_000; // refresh session at most every 30s

/** Log the timeout reason before forcing logout. */
async function logTimeoutAndLogout(reason: string) {
  try {
    await fetch("/api/auth/session-timeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
  } catch {
    /* best-effort */
  }
  clearTabSession();
  await logout();
}

interface SessionStatus {
  authenticated: boolean;
  secondsUntilInactivity: number;
  secondsUntilAbsolute: number;
}

export default function SessionMonitor() {
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [showAbsoluteWarning, setShowAbsoluteWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const lastActivityRefreshRef = useRef(0);
  const backgroundTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHiddenRef = useRef(false);
  const countdownReasonRef = useRef<string>("inactivity");
  const warningActiveRef = useRef(false);

  // ── Activity refresh ──────────────────────────────────────────────────

  /** Tell the server we are actively using the session. */
  const refreshActivity = useCallback(async () => {
    const now = Date.now();
    if (now - lastActivityRefreshRef.current < ACTIVITY_THROTTLE_MS) return;
    lastActivityRefreshRef.current = now;
    try {
      await fetch("/api/auth/session", { method: "POST" });
    } catch {
      /* best-effort */
    }
  }, []);

  /** Meaningful user interaction handler. */
  const handleActivity = useCallback(() => {
    if (isHiddenRef.current) return;
    refreshActivity();
  }, [refreshActivity]);

  // ── Visibility / background handling ───────────────────────────────────

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      // Page became hidden — start background grace timer
      isHiddenRef.current = true;
      if (backgroundTimerRef.current) clearTimeout(backgroundTimerRef.current);
      backgroundTimerRef.current = setTimeout(() => {
        // Grace period exceeded — force logout
        void logTimeoutAndLogout("background");
      }, BACKGROUND_GRACE_MS);
    } else {
      // Page visible again — cancel background timer if still within grace
      isHiddenRef.current = false;
      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }
      // Refresh activity on return
      void refreshActivity();
    }
  }, [refreshActivity]);

  // ── Server polling ─────────────────────────────────────────────────────

  const pollServer = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      if (!res.ok) {
        // Session invalid server-side
        await logout();
        return;
      }
      const data: SessionStatus = await res.json();

      // Inactivity warning: show when under 60 seconds
      if (data.secondsUntilInactivity <= 60 && data.secondsUntilInactivity > 0) {
        setShowInactivityWarning(true);
        setCountdown(data.secondsUntilInactivity);
        countdownReasonRef.current = "inactivity";
      } else {
        setShowInactivityWarning(false);
      }

      // Absolute warning: show when under 120 seconds
      if (data.secondsUntilAbsolute <= 120 && data.secondsUntilAbsolute > 0) {
        setShowAbsoluteWarning(true);
        setCountdown(data.secondsUntilAbsolute);
        countdownReasonRef.current = "absolute";
      } else {
        setShowAbsoluteWarning(false);
      }

      // If either has expired, logout
      if (data.secondsUntilInactivity <= 0 || data.secondsUntilAbsolute <= 0) {
        await logTimeoutAndLogout(
          data.secondsUntilInactivity <= 0 ? "inactivity" : "absolute"
        );
      }
    } catch {
      /* network error — don't force logout on transient failure */
    }
  }, []);

  // ── Lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    // Activity listeners
    const events = ["click", "keypress", "scroll", "touchstart"];
    for (const evt of events) {
      document.addEventListener(evt, handleActivity, { passive: true });
    }

    // Visibility change
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Poll server periodically
    pollTimerRef.current = setInterval(pollServer, SERVER_POLL_MS);

    return () => {
      for (const evt of events) {
        document.removeEventListener(evt, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (backgroundTimerRef.current) clearTimeout(backgroundTimerRef.current);
    };
  }, [handleActivity, handleVisibilityChange, pollServer]);

  // ── Countdown timer (only active while a warning is displayed) ───────

  useEffect(() => {
    const isActive = showInactivityWarning || showAbsoluteWarning;
    warningActiveRef.current = isActive;

    if (isActive) {
      // Start a fresh countdown tick every second while warning is shown
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            void logTimeoutAndLogout(countdownReasonRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // No warning — stop any running countdown
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [showInactivityWarning, showAbsoluteWarning]);

  // ── Warning Dialogs ───────────────────────────────────────────────────

  const handleContinueWorking = async () => {
    setShowInactivityWarning(false);
    setShowAbsoluteWarning(false);
    await refreshActivity();
  };

  const handleSignOut = async () => {
    setShowInactivityWarning(false);
    setShowAbsoluteWarning(false);
    clearTabSession();
    await logout();
  };

  return (
    <>
      {/* Inactivity Warning */}
      {showInactivityWarning && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-warning-title"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2
              id="session-warning-title"
              className="text-lg font-semibold text-gray-900"
            >
              Your session is about to expire
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              You will be signed out in <strong>{countdown} second{countdown !== 1 ? "s" : ""}</strong> because
              of inactivity.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleSignOut}
                className="btn btn-secondary flex-1"
              >
                Sign Out
              </button>
              <button
                type="button"
                onClick={handleContinueWorking}
                className="btn btn-primary flex-1"
              >
                Continue Working
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Absolute Expiry Warning */}
      {showAbsoluteWarning && !showInactivityWarning && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="absolute-warning-title"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2
              id="absolute-warning-title"
              className="text-lg font-semibold text-gray-900"
            >
              For security, you need to sign in again soon.
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              Your session will expire in{" "}
              <strong>{countdown} second{countdown !== 1 ? "s" : ""}</strong>.
              Please save your work and sign in again.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleSignOut}
                className="btn btn-danger flex-1"
              >
                Sign Out Now
              </button>
              <button
                type="button"
                onClick={handleContinueWorking}
                className="btn btn-secondary flex-1"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
