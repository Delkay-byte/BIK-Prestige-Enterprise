"use server";

import { db } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { createStaffSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export interface ActionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Get all staff members (admin, worker, collector roles).
 * Unified people directory for the business.
 */
export async function getStaff() {
  await requireAdmin();
  return db.user.findMany({
    where: { role: { in: ["admin", "worker", "collector"] } },
    include: {
      location: { select: { id: true, name: true, code: true } },
      collector: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a single staff member by ID with full details.
 */
export async function getStaffById(id: string) {
  await requireAdmin();
  return db.user.findUnique({
    where: { id, role: { in: ["admin", "worker", "collector"] } },
    include: {
      location: true,
      collector: true,
    },
  });
}

/**
 * Create a new staff member.
 * Role is server-assigned from validated form data.
 * Password is securely hashed. No plaintext stored.
 */
export async function createStaff(formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const raw = {
    fullName: (formData.get("fullName") as string)?.trim(),
    email: (formData.get("email") as string)?.trim().toLowerCase(),
    phone: (formData.get("phone") as string)?.trim() || undefined,
    password: formData.get("password") as string,
    role: (formData.get("role") as string) || "worker",
    status: (formData.get("status") as string) || "active",
  };

  const validated = createStaffSchema.safeParse(raw);
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0].message };
  }

  const existing = await db.user.findUnique({ where: { email: validated.data.email } });
  if (existing) {
    return { success: false, error: "A user with this email already exists" };
  }

  const passwordHash = await hashPassword(validated.data.password);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        fullName: validated.data.fullName,
        email: validated.data.email,
        phone: validated.data.phone,
        passwordHash,
        role: validated.data.role,
        status: validated.data.status,
        forcePasswordReset: true,
        susuEnabled: validated.data.role === "collector",
      },
      select: {
        id: true, fullName: true, email: true, phone: true,
        role: true, status: true, createdAt: true,
      },
    });

    // If role is collector, create the corresponding Collector record
    if (validated.data.role === "collector") {
      await tx.collector.create({
        data: { userId: created.id, status: "active" },
      });
    }

    return created;
  });

  await createAuditLog({
    userId: admin.userId,
    action: "user.staff_created",
    entityType: "user",
    entityId: user.id,
    details: { fullName: user.fullName, email: user.email, role: user.role },
  });

  revalidatePath("/admin/staff");
  revalidatePath("/admin/dashboard");
  return { success: true, data: user };
}

/**
 * Update staff member details (name, email, phone, status).
 * Role changes are not allowed through this action — use dedicated role change.
 */
export async function updateStaff(staffId: string, formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const raw = {
    fullName: (formData.get("fullName") as string)?.trim(),
    email: (formData.get("email") as string)?.trim().toLowerCase(),
    phone: (formData.get("phone") as string)?.trim() || undefined,
    status: (formData.get("status") as string) || "active",
  };

  if (!raw.fullName || raw.fullName.length < 2) {
    return { success: false, error: "Full name must be at least 2 characters" };
  }
  if (!raw.email || !raw.email.includes("@")) {
    return { success: false, error: "Please enter a valid email" };
  }

  const existing = await db.user.findFirst({
    where: { email: raw.email, id: { not: staffId } },
  });
  if (existing) {
    return { success: false, error: "A user with this email already exists" };
  }

  const target = await db.user.findUnique({ where: { id: staffId } });
  if (!target || !["admin", "worker", "collector"].includes(target.role)) {
    return { success: false, error: "Staff member not found" };
  }

  const user = await db.user.update({
    where: { id: staffId },
    data: {
      fullName: raw.fullName,
      email: raw.email,
      phone: raw.phone,
      status: raw.status,
    },
    select: { id: true, fullName: true, email: true, phone: true, role: true, status: true },
  });

  await createAuditLog({
    userId: admin.userId,
    action: "user.staff_updated",
    entityType: "user",
    entityId: staffId,
    details: { fullName: user.fullName },
  });

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${staffId}`);
  return { success: true, data: user };
}

/**
 * Activate or deactivate a staff member.
 * Inactive staff do not appear in Received By / Recorded By selectors.
 * Historical records are preserved.
 */
export async function toggleStaffStatus(staffId: string, newStatus: string): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const target = await db.user.findUnique({ where: { id: staffId } });
  if (!target || !["admin", "worker", "collector"].includes(target.role)) {
    return { success: false, error: "Staff member not found" };
  }

  const user = await db.user.update({
    where: { id: staffId },
    data: { status: newStatus },
    select: { fullName: true, role: true },
  });

  // If deactivating a collector, also deactivate the Collector record
  if (newStatus === "inactive" && target.role === "collector") {
    const collector = await db.collector.findUnique({ where: { userId: staffId } });
    if (collector && collector.status === "active") {
      await db.collector.update({
        where: { id: collector.id },
        data: { status: "inactive" },
      });
    }
  }
  // If reactivating a collector, also reactivate the Collector record
  if (newStatus === "active" && target.role === "collector") {
    const collector = await db.collector.findUnique({ where: { userId: staffId } });
    if (collector && collector.status === "inactive") {
      await db.collector.update({
        where: { id: collector.id },
        data: { status: "active" },
      });
    }
  }

  await createAuditLog({
    userId: admin.userId,
    action: `user.staff_${newStatus === "active" ? "activated" : "deactivated"}`,
    entityType: "user",
    entityId: staffId,
    details: { fullName: user.fullName, role: user.role },
  });

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${staffId}`);
  revalidatePath("/admin/dashboard");
  return { success: true };
}

/**
 * Reset a staff member's password.
 * Invalidates existing sessions by bumping tokenVersion.
 */
export async function resetStaffPassword(staffId: string, formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const target = await db.user.findUnique({
    where: { id: staffId },
    select: { id: true, role: true },
  });
  if (!target || !["admin", "worker", "collector"].includes(target.role)) {
    return { success: false, error: "Staff member not found" };
  }

  const newPassword = formData.get("newPassword") as string;
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const passwordHash = await hashPassword(newPassword);

  await db.user.update({
    where: { id: staffId },
    data: {
      passwordHash,
      forcePasswordReset: true,
      tokenVersion: { increment: 1 },
    },
  });

  await createAuditLog({
    userId: admin.userId,
    action: "user.password_reset",
    entityType: "user",
    entityId: staffId,
    details: { sessionsInvalidated: true },
  });

  revalidatePath("/admin/staff");
  return { success: true };
}

/**
 * Search authorized staff members for SmartSearch dropdowns.
 * Returns active users with role in [admin, worker, collector].
 * Case-insensitive search on name, email, phone, and user ID.
 */
export async function searchStaffDirectory(query: string) {
  await requireAdmin();

  if (!query || query.length < 2) return [];

  const normalizedQuery = query.trim().toLowerCase();

  const candidates = await db.user.findMany({
    where: {
      status: "active",
      role: { in: ["admin", "worker", "collector"] },
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
    },
    take: 200,
    orderBy: { fullName: "asc" },
  });

  const seen = new Set<string>();
  return candidates
    .filter((u) => {
      if (seen.has(u.id)) return false;
      const nameLower = u.fullName.toLowerCase();
      const emailLower = (u.email || "").toLowerCase();
      const phoneLower = (u.phone || "").toLowerCase();
      const idLower = u.id.toLowerCase();
      const matches =
        nameLower.includes(normalizedQuery) ||
        emailLower.includes(normalizedQuery) ||
        phoneLower.includes(normalizedQuery) ||
        idLower.includes(normalizedQuery);
      if (matches) seen.add(u.id);
      return matches;
    })
    .slice(0, 20)
    .map((u) => ({
      id: u.id,
      label: u.fullName,
      subLabel: `${u.role} • ${u.email}${u.phone ? ` • ${u.phone}` : ""} • ID: ${u.id.slice(0, 12)}…`,
    }));
}
