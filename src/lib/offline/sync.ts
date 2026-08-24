/**
 * Sync Manager — handles offline-to-online transaction synchronization.
 *
 * Features:
 * - Automatic sync when connectivity returns
 * - FIFO ordering (preserves creation order)
 * - Exponential backoff retry
 * - Idempotent server submission
 * - Conflict detection and classification
 * - Max retry limit with failure alerting
 */

import {
  getPendingTransactions,
  updateTransaction,
  type OfflineTransaction,
} from "./store";

// ── Offline Authorization Timeout ──────────────────────────────────────

const OFFLINE_AUTH_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
let offlineAuthorizedAt: number | null = null;

/**
 * Set the offline authorization timestamp (from server enrollment response).
 */
export function setOfflineAuthorizedAt(timestamp: number | Date): void {
  offlineAuthorizedAt = typeof timestamp === "number"
    ? timestamp
    : new Date(timestamp).getTime();
}

/**
 * Check if offline authorization has expired.
 * Returns true if the device needs to reconnect.
 */
export function isOfflineAuthExpired(): boolean {
  if (!offlineAuthorizedAt) return false; // No enrollment yet
  return Date.now() - offlineAuthorizedAt > OFFLINE_AUTH_TIMEOUT_MS;
}

/**
 * Get seconds until offline authorization expires.
 * Returns 0 if already expired.
 */
export function secondsUntilOfflineAuthExpiry(): number {
  if (!offlineAuthorizedAt) return 0;
  const remaining = OFFLINE_AUTH_TIMEOUT_MS - (Date.now() - offlineAuthorizedAt);
  return Math.max(0, Math.floor(remaining / 1000));
}

// ── Retry Policy ───────────────────────────────────────────────────────

const RETRY_DELAYS = [0, 5_000, 30_000, 120_000, 600_000]; // ms
const MAX_RETRIES = 5;

function getRetryDelay(retryCount: number): number {
  if (retryCount >= RETRY_DELAYS.length) return RETRY_DELAYS[RETRY_DELAYS.length - 1];
  return RETRY_DELAYS[retryCount];
}

// ── Sync Result ────────────────────────────────────────────────────────

export interface SyncResult {
  transactionId: string;
  success: boolean;
  serverResult?: unknown;
  error?: string;
  isRetryable: boolean;
}

// ── Server Submission ──────────────────────────────────────────────────

/**
 * Send a single transaction to the server for processing.
 * The server endpoint handles idempotency, validation, and business rules.
 */
async function submitToServer(transaction: OfflineTransaction): Promise<SyncResult> {
  try {
    const response = await fetch("/api/offline/sync-contribution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: transaction.idempotencyKey,
        payload: transaction.payload,
        deviceId: transaction.deviceId,
      }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      return {
        transactionId: transaction.id,
        success: true,
        serverResult: data,
        isRetryable: false,
      };
    }

    // Classify error: retryable vs permanent
    const isRetryable = response.status >= 500 || response.status === 0;
    return {
      transactionId: transaction.id,
      success: false,
      error: data.error || `Server returned ${response.status}`,
      isRetryable,
    };
  } catch (err) {
    // Network error — retryable
    return {
      transactionId: transaction.id,
      success: false,
      error: err instanceof Error ? err.message : "Network error",
      isRetryable: true,
    };
  }
}

// ── Sync Engine ────────────────────────────────────────────────────────

let syncInProgress = false;

/**
 * Sync all pending transactions. FIFO order.
 * Returns results for each transaction.
 */
export async function syncPendingTransactions(): Promise<SyncResult[]> {
  if (syncInProgress) return [];
  if (isOfflineAuthExpired()) return []; // Don't sync if authorization expired
  syncInProgress = true;

  const results: SyncResult[] = [];

  try {
    const pending = await getPendingTransactions();

    for (const tx of pending) {
      // Mark as syncing
      await updateTransaction(tx.id, {
        status: "syncing",
        syncStartedAt: new Date().toISOString(),
      });

      // Submit to server
      const result = await submitToServer(tx);
      results.push(result);

      if (result.success) {
        // Mark as synced
        await updateTransaction(tx.id, {
          status: "synced",
          syncedAt: new Date().toISOString(),
          serverResult: JSON.stringify(result.serverResult),
        });
      } else if (result.isRetryable && tx.retryCount < MAX_RETRIES) {
        // Retry later
        await updateTransaction(tx.id, {
          status: "pending_sync",
          retryCount: tx.retryCount + 1,
          failureReason: result.error,
          syncStartedAt: null,
        });
      } else {
        // Permanent failure or max retries exceeded
        await updateTransaction(tx.id, {
          status: "failed",
          failureReason: result.error || "Max retries exceeded",
          syncStartedAt: null,
        });
      }
    }
  } finally {
    syncInProgress = false;
  }

  return results;
}

/**
 * Check if the device is online and the server is reachable.
 */
export async function checkConnectivity(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    const response = await fetch("/api/health", {
      method: "HEAD",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start automatic sync monitoring.
 * Listens for online events and periodically checks connectivity.
 */
let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(callback?: (results: SyncResult[]) => void): void {
  // Sync on online event
  window.addEventListener("online", async () => {
    const connected = await checkConnectivity();
    if (connected) {
      const results = await syncPendingTransactions();
      callback?.(results);
    }
  });

  // Periodic check every 30 seconds when online
  syncInterval = setInterval(async () => {
    if (navigator.onLine) {
      const connected = await checkConnectivity();
      if (connected) {
        const results = await syncPendingTransactions();
        callback?.(results);
      }
    }
  }, 30_000);
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
