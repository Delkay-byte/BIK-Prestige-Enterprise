import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "./db";
import { redirect } from "next/navigation";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable is required. " +
      "Set it in your .env file. See .env.example for details."
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * MODULE-SCOPED SESSION ARCHITECTURE
 *
 * Each business module keeps its own independent auth cookie:
 *
 *   bik-admin-session     → /admin/*   (administrators)
 *   bik-worker-session    → /worker/*  (MoMo workers)
 *   bik-collector-session → /collector/* (Susu collectors)
 *
 * Because every login only writes ITS OWN module cookie, signing in as a
 * worker in one tab can never overwrite an administrator session in another
 * tab — the two cookies are independent browser state.
 *
 * Standard-cookie limitation (documented deliberately): tabs of the SAME
 * origin share cookie storage, so copying a protected URL into another tab
 * still inherits that module's session. The isolation guarantee is per
 * module, not per tab — no superficial workaround is applied.
 */

export type ModuleName = "admin" | "momo" | "susu";

const LEGACY_COOKIE_NAME = "bik-prestige-token";
export const SESSION_COOKIES: Record<ModuleName, string> = {
  admin: "bik-admin-session",
  momo: "bik-worker-session",
  susu: "bik-collector-session",
};
export const SELECTION_COOKIE_NAME = "bik-workspace-select";

const TOKEN_EXPIRY = "24h";

export interface JwtPayload {
  userId: string;
  email: string;
  fullName?: string;
  role: "admin" | "worker" | "collector"; // primary role (kept for compatibility)
  modules?: ("momo" | "susu")[];          // authorized business modules
  locationId?: string;
  collectorId?: string;
  forcePasswordReset?: boolean;
  tokenVersion?: number;
}

/** Short-lived token issued after login when the user must pick a workspace. */
export interface SelectionPayload {
  userId: string;
  email: string;
  fullName: string;
  modules: ("momo" | "susu")[];
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

export async function createSelectionToken(payload: SelectionPayload): Promise<string> {
  return new SignJWT({ ...payload, kind: "workspace-selection" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getJwtSecret());
}

export async function verifyToken<T = JwtPayload>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie management
// ---------------------------------------------------------------------------

async function setSessionCookie(name: string, token: string) {
  const cookieStore = await cookies();
  cookieStore.set(name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export async function setModuleSession(module: ModuleName, payload: JwtPayload) {
  await setSessionCookie(SESSION_COOKIES[module], await createToken(payload));
}

export async function setSelectionSession(token: string) {
  await setSessionCookie(SELECTION_COOKIE_NAME, token);
}

export async function clearModuleSession(module: ModuleName) {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIES[module]);
}

/** Terminate every known session for this browser (full logout). */
export async function clearAllSessions() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIES.admin);
  cookieStore.delete(SESSION_COOKIES.momo);
  cookieStore.delete(SESSION_COOKIES.susu);
  cookieStore.delete(SELECTION_COOKIE_NAME);
  // Legacy single-cookie sessions (pre hardening)
  cookieStore.delete(LEGACY_COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Session readers (per module)
// ---------------------------------------------------------------------------

function legacyRoleMatchesModule(role: string, module: ModuleName): boolean {
  if (module === "admin") return role === "admin";
  if (module === "momo") return role === "worker";
  return role === "collector";
}

function normalizePayload(payload: JwtPayload): JwtPayload {
  return {
    ...payload,
    modules: Array.isArray(payload.modules)
      ? payload.modules
      : payload.role === "worker"
        ? ["momo"]
        : payload.role === "collector"
          ? ["susu"]
          : [],
    tokenVersion: typeof payload.tokenVersion === "number" ? payload.tokenVersion : 0,
  };
}

async function readModuleCookie(module: ModuleName): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const name = SESSION_COOKIES[module];

  const scoped = cookieStore.get(name)?.value;
  if (scoped) {
    const payload = await verifyToken<JwtPayload>(scoped);
    return payload?.userId ? normalizePayload(payload) : null;
  }

  // Graceful fallback to pre-hardening sessions until the next login.
  const legacy = cookieStore.get(LEGACY_COOKIE_NAME)?.value;
  if (!legacy) return null;
  const payload = await verifyToken<JwtPayload>(legacy);
  if (!payload?.userId || !legacyRoleMatchesModule(payload.role, module)) return null;
  return normalizePayload(payload);
}

export async function getAdminSession(): Promise<JwtPayload | null> {
  return readModuleCookie("admin");
}

export async function getMomoSession(): Promise<JwtPayload | null> {
  return readModuleCookie("momo");
}

export async function getSusuSession(): Promise<JwtPayload | null> {
  return readModuleCookie("susu");
}

/** Any authenticated module session (used by shared APIs such as /api/auth/me). */
export async function getAnyAuthUser(): Promise<JwtPayload | null> {
  return (await getAdminSession()) ?? (await getMomoSession()) ?? (await getSusuSession());
}

export async function getSelectionUser(): Promise<SelectionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SELECTION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken<SelectionPayload & { kind?: string }>(token);
  if (!payload || payload.kind !== "workspace-selection") return null;
  return { userId: payload.userId, email: payload.email, fullName: payload.fullName, modules: payload.modules };
}

/** True when the stored session matches the user's current tokenVersion. */
export async function isSessionCurrent(payload: JwtPayload): Promise<boolean> {
  try {
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { tokenVersion: true, status: true },
    });
    if (!user || user.status !== "active") return false;
    return user.tokenVersion === (payload.tokenVersion ?? 0);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export async function requireAuth(): Promise<JwtPayload> {
  const user = await getAnyAuthUser();
  if (!user) redirect("/login");
  if (!(await isSessionCurrent(user))) {
    await clearAllSessions();
    redirect("/login?reason=session_expired");
  }
  return user;
}

export async function requireAdmin(): Promise<JwtPayload> {
  const user = await getAdminSession();
  if (!user) redirect("/login");
  if (!(await isSessionCurrent(user))) {
    await clearAllSessions();
    redirect("/login?reason=session_expired");
  }
  if (user.role !== "admin") redirect("/unauthorized");
  return user;
}

/** Guard for MoMo worker pages/actions: requires an active momo capability. */
export async function requireWorker(): Promise<JwtPayload> {
  const user = await getMomoSession();
  if (!user) redirect("/login");
  if (!(await isSessionCurrent(user))) {
    await clearAllSessions();
    redirect("/login?reason=session_expired");
  }
  if (!(user.modules ?? []).includes("momo")) redirect("/unauthorized");
  return user;
}

/** Guard for Susu collector pages/actions: requires an active susu capability. */
export async function requireCollector(): Promise<JwtPayload> {
  const user = await getSusuSession();
  if (!user) redirect("/login");
  if (!(await isSessionCurrent(user))) {
    await clearAllSessions();
    redirect("/login?reason=session_expired");
  }
  if (!(user.modules ?? []).includes("susu")) redirect("/unauthorized");
  return user;
}

// Legacy alias retained for existing call sites.
export const getAuthUser = getAnyAuthUser;

export async function getFullUser(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    include: { location: true },
  });
}
