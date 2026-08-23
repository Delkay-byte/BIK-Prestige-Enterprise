"use server";

import { db } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  createToken,
  setAuthCookie,
  removeAuthCookie,
  getAuthUser,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export interface ActionResponse {
  success: boolean;
  error?: string;
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

  const token = await createToken({
    userId: user.id,
    email: user.email,
    role: user.role as "admin" | "worker" | "collector",
    locationId: user.locationId ?? undefined,
  });

  await setAuthCookie(token);

  await createAuditLog({
    userId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
  });

  if (user.role === "admin") {
    redirect("/admin/dashboard");
  } else if (user.role === "collector") {
    redirect("/collector/dashboard");
  } else {
    redirect("/worker/dashboard");
  }
}

export async function logout(): Promise<void> {
  const user = await getAuthUser();
  if (user) {
    await createAuditLog({
      userId: user.userId,
      action: "auth.logout",
      entityType: "user",
      entityId: user.userId,
    });
  }
  await removeAuthCookie();
  redirect("/login");
}

export async function changePassword(
  formData: FormData
): Promise<ActionResponse> {
  const user = await getAuthUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
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

  const dbUser = await db.user.findUnique({ where: { id: user.userId } });
  if (!dbUser) {
    return { success: false, error: "User not found" };
  }

  const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!valid) {
    return { success: false, error: "Current password is incorrect" };
  }

  const newHash = await hashPassword(newPassword);
  await db.user.update({
    where: { id: user.userId },
    data: { passwordHash: newHash, forcePasswordReset: false },
  });

  await createAuditLog({
    userId: user.userId,
    action: "auth.password_changed",
    entityType: "user",
    entityId: user.userId,
  });

  return { success: true };
}
