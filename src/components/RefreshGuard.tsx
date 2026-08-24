"use client";

import { useEffect } from "react";
import { logout } from "@/lib/actions/auth.actions";
import { clearTabSession } from "@/components/TabSessionGuard";

/**
 * Refresh/session guard for protected pages.
 *
 * BEFORE unload (browser refresh, close, external navigation): registers a
 * browser warning. Browsers show their own generic confirmation text and may
 * ignore custom wording — the guarantee is the warning itself.
 *
 * AFTER an actual reload of a protected page (Navigation Timing reports
 * type "reload"): terminates the authenticated session and redirects to
 * login. Normal internal SPA navigation never triggers beforeunload and is
 * therefore never logged out.
 */
export default function RefreshGuard() {
  useEffect(() => {
    const HANDLED_KEY = "bik-refresh-logout-done";

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      // Arm the warning; also reset the marker so a subsequent genuine
      // reload of this page is detected as a fresh refresh.
      try { window.sessionStorage.removeItem(HANDLED_KEY); } catch {}
      event.preventDefault();
      // Legacy requirement for Chromium-based browsers
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);

    let navType = "navigate";
    try {
      const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      navType = entries[0]?.type ?? "navigate";
    } catch {
      navType = "navigate";
    }

    let alreadyHandled = false;
    try { alreadyHandled = window.sessionStorage.getItem(HANDLED_KEY) === "1"; } catch {}

    // Only the FIRST protected mount after an actual reload terminates the
    // session. Internal SPA navigation later in the same document lifetime
    // shares the original Navigation Timing entry and must NOT log out.
    if (navType === "reload" && !alreadyHandled) {
      try { window.sessionStorage.setItem(HANDLED_KEY, "1"); } catch {}
      clearTabSession();
      void logout();
    }

    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return null;
}
