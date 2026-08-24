"use server";

import { db } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  setModuleSession,
  setSelectionSession,
  clearAllSessions,
  clearModuleSession,
  getAdminSession,
  getMomoSession,
  getSusuSession,
  getSelectionUser,
  isSessionCurrent,
  createSelectionToken,
  SELECTION_COOKIE_NAME,
  type JwtPayload,
  type ModuleName,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export interface ActionResponse {
  success: boolean;
  error?: string;
}

function dashboardPathFor(module: ModuleName): string {
  if (module === "admin") return "/admin/dashboard";
  if (module === "momo") return "/worker/dashboard";
  return "/collector/dashboard";
}

export async function login(
  formData: FormData
): Promise<ActionResponse | void> {
  // Rate limiting: 5 attempts per 15 minutes per IP
  const hdrs = await headers();
  const clientIp = getClientIp(hdrs);
  const rateLimitResult = checkRateLimit(`login:${clientIp}`);

  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: "Too many login attempts. Please try again later.",
    };
  }

  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  const validated = loginSchema.safeParse({ email, password });
  if (!validated.success) {
    return { success: false, error: "Invalid email or password" };
  }

  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    return { success: false, error: "Invalid email or password" };
  }

  if (user.status === "inactive") {
    return {
      success: false,
      error: "Your account has been deactivated. Please contact the administrator.",
    };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { success: false, error: "Invalid email or password" };
  }

  const modules: ("momo" | "susu")[] = [];
  if (user.momoEnabled) modules.push("momo");
  if (user.susuEnabled) modules.push("susu");

  await createAuditLog({
    userId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
  });

  // Administrators sign into the administration module.
  if (user.role === "admin") {
    await issueModuleSession(user.id, "admin");
    redirect("/admin/dashboard");
  }

  if (modules.length === 0) {
    return {
      success: false,
      error: "Your account is not registered for any module. Please contact the administrator.",
    };
  }

  if (modules.length === 1) {
    const mod = modules[0];
    const payload = await issueModuleSession(user.id, mod);

    if (payload.forcePasswordReset) {
      redirect(`${settingsPathFor(mod)}?tab=password`);
    }
    redirect(dashboardPathFor(mod));
  }

  // Dual-role: let the person choose their workspace. No arbitrary default.
  const selectionToken = await createSelectionToken({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    modules,
  });
  await setSelectionSession(selectionToken);
  redirect("/select-workspace");
}

function settingsPathFor(module: ModuleName): string {
  return `/${module === "admin" ? "admin" : module === "momo" ? "worker" : "collector"}/settings`;
}

async function buildSessionPayload(userId: string): Promise<JwtPayload> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const modules: ("momo" | "susu")[] = [];
  if (user.momoEnabled) modules.push("momo");
  if (user.susuEnabled) modules.push("susu");
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as "admin" | "worker" | "collector",
    modules,
    locationId: user.locationId ?? undefined,
    forcePasswordReset: user.forcePasswordReset,
    tokenVersion: user.tokenVersion,
  };
}

/** Issue a fresh JWT for `userId` into the given module's cookie. */
export async function issueModuleSession(userId: string, module: ModuleName): Promise<JwtPayload> {
  const payload = await buildSessionPayload(userId);
  await setModuleSession(module, payload);
  return payload;
}

export async function selectWorkspace(
  module: "momo" | "susu"
): Promise<ActionResponse> {
  const selection = await getSelectionUser();
  if (!selection) {
    return { success: false, error: "Workspace selection expired. Please sign in again." };
  }
  if (!selection.modules.includes(module)) {
    return { success: false, error: "You are not authorized for this module." };
  }

  await issueModuleSession(selection.userId, module);

  // The selection token is single-use.
  (await cookies()).delete(SELECTION_COOKIE_NAME);

  await createAuditLog({
    userId: selection.userId,
    action: "auth.workspace_selected",
    entityType: "user",
    entityId: selection.userId,
    details: { module },
  });

  return { success: true };
}

/**
 * Switch between the modules this person is registered for.
 * Requires an active session in any module belonging to the same account.
 */
export async function switchWorkspace(
  target: "momo" | "susu"
): Promise<ActionResponse> {
  const sources: Array<[ModuleName, Awaited<ReturnType<typeof getMomoSession>>]> = [
    ["momo", await getMomoSession()],
    ["susu", await getSusuSession()],
    ["admin", null],
  ];

  let userId: string | null = null;
  let sourceModule: ModuleName | null = null;
  for (const [mod, session] of sources) {
    if (session && (await isSessionCurrent(session))) {
      userId = session.userId;
      sourceModule = mod;
      break;
    }
  }

  if (!userId || !sourceModule || sourceModule === "admin") {
    return { success: false, error: "Not authenticated" };
  }
  if (sourceModule === target) {
    return { success: true };
  }

  // Verify the account is genuinely registered for the target module.
  const payload = await buildSessionPayload(userId);
  if (!(payload.modules ?? []).includes(target)) {
    return { success: false, error: "You are not authorized for this module." };
  }

  await setModuleSession(target, payload);
  await clearModuleSession(sourceModule);

  await createAuditLog({
    userId,
    action: "auth.workspace_switched",
    entityType: "user",
    entityId: userId,
    details: { from: sourceModule, to: target },
  });

  return { success: true };
}

export async function logout(): Promise<void> {
  const sessions = [await getAdminSession(), await getMomoSession(), await getSusuSession()];
  const active = sessions.find(Boolean);
  if (active) {
    await createAuditLog({
      userId: active.userId,
      action: "auth.logout",
      entityType: "user",
      entityId: active.userId,
    });
  }
  await clearAllSessions();
  redirect("/login");
}

/**
 * Verify the current user's password (for step-up reauthentication).
 * Does not log the password.  Only checks against the active session.
 */
export async function verifyPasswordAction(
  password: string
): Promise<ActionResponse> {
  const contexts: Array<{ module: ModuleName; user: JwtPayload | null }> = [
    { module: "admin", user: await getAdminSession() },
    { module: "momo", user: await getMomoSession() },
    { module: "susu", user: await getSusuSession() },
  ];
  const context = contexts.find((c) => c.user !== null);
  if (!context || !context.user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await isSessionCurrent(context.user))) {
    await clearAllSessions();
    return { success: false, error: "Session expired. Please sign in again." };
  }

  const dbUser = await db.user.findUnique({ where: { id: context.user.userId } });
  if (!dbUser) {
    return { success: false, error: "User not found" };
  }

  const valid = await verifyPassword(password, dbUser.passwordHash);
  if (!valid) {
    await createAuditLog({
      userId: context.user.userId,
      action: "auth.reauth_failed",
      entityType: "user",
      entityId: context.user.userId,
    });
    return { success: false, error: "Incorrect password" };
  }

  await createAuditLog({
    userId: context.user.userId,
    action: "auth.reauth_success",
    entityType: "user",
    entityId: context.user.userId,
  });

  return { success: true };
}

export async function changePassword(
  formData: FormData
): Promise<ActionResponse> {
  // Determine which module session is making the request — identity always
  // comes from the authenticated session, never from browser-supplied IDs.
  const contexts: Array<{ module: ModuleName; user: JwtPayload | null }> = [
    { module: "admin", user: await getAdminSession() },
    { module: "momo", user: await getMomoSession() },
    { module: "susu", user: await getSusuSession() },
  ];
  const context = contexts.find((c) => c.user !== null);
  if (!context || !context.user) {
    return { success: false, error: "Not authenticated" };
  }
  const session = context.user;

  if (!(await isSessionCurrent(session))) {
    await clearAllSessions();
    return { success: false, error: "Session expired. Please sign in again." };
  }

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (newPassword !== confirmPassword) {
    return { success: false, error: "Passwords don't match" };
  }

  if (newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const dbUser = await db.user.findUnique({ where: { id: session.userId } });
  if (!dbUser) {
    return { success: false, error: "User not found" };
  }

  const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!valid) {
    return { success: false, error: "Current password is incorrect" };
  }

  const wasForced = !!session.forcePasswordReset;

  const newHash = await hashPassword(newPassword);
  // Bump tokenVersion to invalidate ALL existing sessions across all modules
  await db.user.update({
    where: { id: session.userId },
    data: {
      passwordHash: newHash,
      forcePasswordReset: false,
      tokenVersion: { increment: 1 },
    },
  });

  // Re-issue THIS module's session with the new tokenVersion
  const refreshed = await buildSessionPayload(session.userId);
  await setModuleSession(context.module, refreshed);

  await createAuditLog({
    userId: session.userId,
    action: wasForced ? "auth.first_login_password_changed" : "auth.password_changed",
    entityType: "user",
    entityId: session.userId,
  });

  return { success: true };
}
