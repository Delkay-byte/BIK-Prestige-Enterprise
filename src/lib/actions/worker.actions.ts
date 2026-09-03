"use server";

import { db } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { createWorkerSchema, editWorkerSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export interface ActionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

export async function createWorker(formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const raw = {
    fullName: (formData.get("fullName") as string)?.trim(),
    email: (formData.get("email") as string)?.trim().toLowerCase(),
    phone: (formData.get("phone") as string)?.trim() || undefined,
    password: formData.get("password") as string,
    locationId: formData.get("locationId") as string,
    status: (formData.get("status") as string) || "active",
  };

  const validated = createWorkerSchema.safeParse(raw);
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0].message };
  }

  const existing = await db.user.findUnique({ where: { email: validated.data.email } });
  if (existing) {
    return { success: false, error: "A user with this email already exists" };
  }

  const location = await db.location.findUnique({ where: { id: validated.data.locationId } });
  if (!location) {
    return { success: false, error: "Selected location does not exist" };
  }
  if (location.status === "inactive") {
    return { success: false, error: "Cannot assign worker to an inactive location" };
  }

  const passwordHash = await hashPassword(validated.data.password);

  const worker = await db.user.create({
    data: {
      fullName: validated.data.fullName,
      email: validated.data.email,
      phone: validated.data.phone,
      passwordHash,
      role: "worker",
      momoEnabled: true,
      locationId: validated.data.locationId,
      status: validated.data.status,
      forcePasswordReset: true,
    },
    select: { id: true, fullName: true, email: true, role: true, status: true, locationId: true, createdAt: true },
  });

  await createAuditLog({
    userId: admin.userId,
    action: "user.worker_created",
    entityType: "user",
    entityId: worker.id,
    details: { fullName: worker.fullName, email: worker.email },
  });

  revalidatePath("/admin/workers");
  revalidatePath("/admin/dashboard");
  return { success: true, data: worker };
}

export async function updateWorker(workerId: string, formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const raw = {
    fullName: (formData.get("fullName") as string)?.trim(),
    email: (formData.get("email") as string)?.trim().toLowerCase(),
    phone: (formData.get("phone") as string)?.trim() || undefined,
    locationId: formData.get("locationId") as string,
    status: (formData.get("status") as string) || "active",
  };

  const validated = editWorkerSchema.safeParse(raw);
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0].message };
  }

  const existing = await db.user.findFirst({
    where: { email: validated.data.email, id: { not: workerId } },
  });
  if (existing) {
    return { success: false, error: "A user with this email already exists" };
  }

  // Module capability: optional Susu collector registration for this person.
  // One person, one account — capabilities are assignments, not new users.
  const wantsSusu = formData.get("susuCollector") === "on";
  const target = await db.user.findUnique({
    where: { id: workerId },
    include: { collector: true },
  });
  if (!target) {
    return { success: false, error: "Worker not found" };
  }
  const susuChanged = target.susuEnabled !== wantsSusu;

  const worker = await db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: workerId },
      data: {
        fullName: validated.data.fullName,
        email: validated.data.email,
        phone: validated.data.phone,
        locationId: validated.data.locationId,
        status: validated.data.status,
        susuEnabled: wantsSusu,
      },
      select: { id: true, fullName: true, email: true, role: true, status: true, locationId: true },
    });

    if (wantsSusu && !target.collector) {
      await tx.collector.create({ data: { userId: workerId, status: "active" } });
    }
    if (!wantsSusu && target.collector && target.collector.status === "active") {
      await tx.collector.update({ where: { id: target.collector.id }, data: { status: "inactive" } });
    }

    return updated;
  });

  if (susuChanged) {
    await createAuditLog({
      userId: admin.userId,
      action: "user.module_assignment_changed",
      entityType: "user",
      entityId: workerId,
      details: { module: "susu", enabled: wantsSusu },
    });
  }

  await createAuditLog({
    userId: admin.userId,
    action: "user.worker_updated",
    entityType: "user",
    entityId: workerId,
    details: { fullName: worker.fullName },
  });

  revalidatePath("/admin/workers");
  revalidatePath(`/admin/workers/${workerId}`);
  return { success: true, data: worker };
}

export async function resetWorkerPassword(workerId: string, formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  // Target user is resolved server-side from the admin's request context —
  // never from arbitrary browser-supplied role/ID combinations.
  const target = await db.user.findUnique({
    where: { id: workerId },
    select: { id: true, role: true },
  });
  if (!target || (target.role !== "worker" && target.role !== "collector")) {
    return { success: false, error: "Worker not found" };
  }

  const newPassword = formData.get("newPassword") as string;
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const passwordHash = await hashPassword(newPassword);

  await db.user.update({
    where: { id: workerId },
    data: {
      passwordHash,
      forcePasswordReset: true,
      tokenVersion: { increment: 1 }, // invalidate the user's existing sessions
    },
  });

  await createAuditLog({
    userId: admin.userId,
    action: "user.password_reset",
    entityType: "user",
    entityId: workerId,
    details: { sessionsInvalidated: true },
  });

  revalidatePath("/admin/workers");
  return { success: true };
}

export async function toggleWorkerStatus(workerId: string, newStatus: string): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const worker = await db.user.update({
    where: { id: workerId },
    data: { status: newStatus },
    select: { fullName: true },
  });

  await createAuditLog({
    userId: admin.userId,
    action: `user.worker_${newStatus === "active" ? "activated" : "deactivated"}`,
    entityType: "user",
    entityId: workerId,
    details: { fullName: worker.fullName },
  });

  revalidatePath("/admin/workers");
  revalidatePath(`/admin/workers/${workerId}`);
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function getWorkers() {
  await requireAdmin();
  return db.user.findMany({
    where: { role: "worker" },
    include: { location: { select: { id: true, name: true, code: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWorkerById(id: string) {
  await requireAdmin();
  return db.user.findUnique({
    where: { id, role: "worker" },
    include: {
      location: true,
      dailyAccounts: {
        orderBy: { businessDate: "desc" },
        take: 10,
        include: { location: { select: { name: true } } },
      },
    },
  });
}

/**
 * Search authorized staff members for "Received By" dropdown.
 * Only returns active internal staff (admin, worker, collector roles).
 * Case-insensitive search on name, email, and phone.
 */
export async function searchStaff(query: string) {
  await requireAdmin();

  if (!query || query.length < 2) return [];

  const normalizedQuery = query.trim().toLowerCase();

  // Fetch all active staff and filter in-memory for case-insensitive matching.
  // Prisma `contains` is case-sensitive LIKE on PostgreSQL (SQLite's LIKE is
  // ASCII case-insensitive), and `mode: "insensitive"` is rejected by the
  // SQLite connector, so a DB-level prefilter would miss mixed-case matches in
  // production. Pilot scale is small — filtering in memory is safe.
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
      const matches =
        nameLower.includes(normalizedQuery) ||
        emailLower.includes(normalizedQuery) ||
        phoneLower.includes(normalizedQuery);
      if (matches) seen.add(u.id);
      return matches;
    })
    .slice(0, 10);
}
