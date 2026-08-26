"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const TAB_SESSION_KEY = "bik-tab-session";

/**
 * TabSessionGuard — enforces per-tab session isolation.
 *
 * Cookies are shared across all tabs on the same origin.  To prevent a
 * copied URL from opening an authenticated session in a new tab, we also
 * require a sessionStorage flag that is only set during the login flow
 * of THIS specific tab.
 *
 * sessionStorage is tab-scoped: it is NOT shared between tabs, and it
 * is cleared when the tab is closed.
 *
 * This component redirects to /login if the flag is missing — except on the
 * dedicated administrator login page, which is intentionally reachable without
 * an existing session.
 */
export default function TabSessionGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/admin/login") return;
    if (!sessionStorage.getItem(TAB_SESSION_KEY)) {
      router.replace("/login");
    }
  }, [router, pathname]);

  return null;
}

// ── Helpers used by login / logout / workspace selection ──────────────

/** Mark the current tab as authenticated.  Call after successful login. */
export function markTabAuthenticated() {
  try {
    sessionStorage.setItem(TAB_SESSION_KEY, "1");
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Clear the per-tab flag.  Call on logout. */
export function clearTabSession() {
  try {
    sessionStorage.removeItem(TAB_SESSION_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}
