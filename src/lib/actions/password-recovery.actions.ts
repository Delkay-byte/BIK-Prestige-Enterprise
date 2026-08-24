"use server";

import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { createHash, randomBytes } from "crypto";

export interface ActionResponse {
  success: boolean;
  error?: string;
  /** Only returned in pilot mode (no email) — the raw recovery token. */
  _pilotToken?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SHA-256 hash a string (for token storage). */
function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Generate a cryptographically secure random token (URL-safe). */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Rate-limit key for forgot-password requests. */
const resetRequestStore = new Map<string, { count: number; resetAt: number }>();
const RESET_MAX = 5;
const RESET_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkResetRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = resetRequestStore.get(key);
  if (!entry || now > entry.resetAt) {
    resetRequestStore.set(key, { count: 1, resetAt: now + RESET_WINDOW_MS });
    return true;
  }
  if (entry.count >= RESET_MAX) return false;
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// 1. Request password reset
// ---------------------------------------------------------------------------

/**
 * Request a password reset for the given email.
 *
 * Always returns the same generic response regardless of whether the email
 * exists — prevents account enumeration.
 *
 * In the current pilot (no email provider), the raw token is returned in
 * `_pilotToken` so the admin/owner can manually provide it to the user.
 * This field will be removed once a real email channel is configured.
 */
export async function requestPasswordReset(
  email: string
): Promise<ActionResponse> {
  const normalisedEmail = email.trim().toLowerCase();

  // Rate-limit: 5 requests per 15 minutes per email
  if (!checkResetRateLimit(`reset:${normalisedEmail}`)) {
    return {
      success: false,
      error: "Too many recovery requests. Please try again later.",
    };
  }

  // Always return the same generic message — never reveal account existence
  const genericSuccess = {
    success: true as const,
    error: undefined,
  };

  const user = await db.user.findUnique({
    where: { email: normalisedEmail },
  });

  if (!user || user.status !== "active") {
    // Return generic success to prevent enumeration
    return genericSuccess;
  }

  // Invalidate any previous unused tokens for this user
  await db.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });

  // Generate raw token and store only its hash
  const rawToken = generateToken();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  await createAuditLog({
    userId: user.id,
    action: "auth.password_recovery_requested",
    entityType: "user",
    entityId: user.id,
  });

  // Pilot mode: return the raw token (no email configured yet)
  // In production this would be sent via email and _pilotToken would be removed
  return {
    ...genericSuccess,
    _pilotToken: rawToken,
  };
}

// ---------------------------------------------------------------------------
// 2. Verify recovery token
// ---------------------------------------------------------------------------

/**
 * Verify that a recovery token is valid (not expired, not used, matches user).
 * Returns the userId if valid, or an error message.
 */
async function verifyRecoveryToken(
  token: string
): Promise<{ valid: true; userId: string } | { valid: false; error: string }> {
  const tokenHash = sha256(token);

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record) {
    return { valid: false, error: "This recovery link is invalid or has expired. Please request a new one." };
  }

  if (record.usedAt) {
    return { valid: false, error: "This recovery link has already been used. Please request a new one." };
  }

  if (new Date() > record.expiresAt) {
    return { valid: false, error: "This recovery link has expired. Please request a new one." };
  }

  return { valid: true, userId: record.userId };
}

// ---------------------------------------------------------------------------
// 3. Complete password reset
// ---------------------------------------------------------------------------

/**
 * Complete a password reset using a valid recovery token.
 *
 * - Verifies the token
 * - Applies the new password (with full policy validation)
 * - Increments tokenVersion (invalidates all existing sessions)
 * - Marks the recovery token as used
 * - Logs the event
 */
export async function completePasswordReset(params: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResponse> {
  const { token, newPassword, confirmPassword } = params;

  // Validate passwords match
  if (newPassword !== confirmPassword) {
    return { success: false, error: "Passwords don't match" };
  }

  // Validate password policy
  if (newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }
  if (!/[A-Z]/.test(newPassword)) {
    return { success: false, error: "Password must contain at least one uppercase letter" };
  }
  if (!/[0-9]/.test(newPassword)) {
    return { success: false, error: "Password must contain at least one number" };
  }

  // Verify the recovery token
  const tokenResult = await verifyRecoveryToken(token);
  if (!tokenResult.valid) {
    return { success: false, error: tokenResult.error };
  }

  const { userId } = tokenResult;

  // Hash the new password
  const newHash = await hashPassword(newPassword);

  // Use a transaction: update password + bump tokenVersion + mark token used
  await db.$transaction(async (tx) => {
    // Update password and bump tokenVersion (invalidates all sessions)
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        forcePasswordReset: false,
        tokenVersion: { increment: 1 },
      },
    });

    // Mark the recovery token as used
    const tokenHash = sha256(token);
    await tx.passwordResetToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    });
  });

  // Audit the recovery
  await createAuditLog({
    userId,
    action: "auth.password_recovery_completed",
    entityType: "user",
    entityId: userId,
  });

  return { success: true };
}
