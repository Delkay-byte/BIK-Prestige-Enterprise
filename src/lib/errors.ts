/**
 * Check if an error is a Next.js redirect error (from `redirect()` in Server Actions).
 * These must be re-thrown so the router handles the redirect.
 */
export function isRedirectError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
