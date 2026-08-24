"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin, hashPassword } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";

export interface ActionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Create a new collector user and collector record.
 */
export async function createCollector(formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const fullName = (formData.get("fullName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const phone = (formData.get("phone") as string)?.trim() || undefined;
  const password = formData.get("password") as string;

  if (!fullName || fullName.length < 2) {
    return { success: false, error: "Full name is required" };
  }
  if (!email) {
    return { success: false, error: "Email is required" };
  }
  if (!password || password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "A user with this email already exists" };
  }

  const passwordHash = await hashPassword(password);

  const user = await db.user.create({
    data: {
      fullName,
      email,
      phone,
      role: "collector",
      status: "active",
      passwordHash,
      susuEnabled: true,
      forcePasswordReset: true,
    },
  });

  const collector = await db.collector.create({
    data: { userId: user.id, status: "active" },
  });

  await createAuditLog({
    userId: admin.userId,
    action: "susu.collector_created",
    entityType: "collector",
    entityId: collector.id,
    details: { fullName, email },
  });

  revalidatePath("/susu/admin/collectors");
  return { success: true, data: { user, collector } };
}

/**
 * Admin password reset for a collector's account.
 * Invalidates the collector's existing sessions and forces a password
 * change at next login. The temporary password is never displayed again.
 */
export async function resetCollectorPassword(collectorId: string, formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const collector = await db.collector.findUnique({
    where: { id: collectorId },
    select: { userId: true },
  });
  if (!collector) {
    return { success: false, error: "Collector not found" };
  }

  const newPassword = formData.get("newPassword") as string;
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const passwordHash = await hashPassword(newPassword);

  await db.user.update({
    where: { id: collector.userId },
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
    entityId: collector.userId,
    details: { sessionsInvalidated: true, viaCollectorId: collectorId },
  });

  revalidatePath("/susu/admin/collectors");
  return { success: true };
}

/**
 * Toggle a person's MoMo module capability from the collectors page.
 * Enabling requires an assigned MoMo location; one account gains both modules.
 */
export async function setMomoCapability(
  userId: string,
  enabled: boolean,
  locationId?: string
): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, momoEnabled: true },
  });
  if (!target || target.role === "admin") {
    return { success: false, error: "User not found" };
  }
  if (target.momoEnabled === enabled) {
    return { success: true };
  }
  if (enabled) {
    if (!locationId) {
      return { success: false, error: "An assigned location is required to enable MoMo" };
    }
    const location = await db.location.findUnique({ where: { id: locationId } });
    if (!location || location.status !== "active") {
      return { success: false, error: "Selected location does not exist or is inactive" };
    }
  }

  await db.user.update({
    where: { id: userId },
    data: { momoEnabled: enabled, ...(enabled ? { locationId } : {}) },
  });

  // Bump token version so capability changes take effect on next request.
  await db.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });

  await createAuditLog({
    userId: admin.userId,
    action: "user.module_assignment_changed",
    entityType: "user",
    entityId: userId,
    details: { module: "momo", enabled, ...(locationId ? { locationId } : {}) },
  });

  revalidatePath("/susu/admin/collectors");
  revalidatePath("/admin/workers");
  return { success: true };
}

/**
 * Toggle collector status (activate/deactivate).
 */
export async function toggleCollectorStatus(collectorId: string, newStatus: string): Promise<ActionResponse> {
  const admin = await requireAdmin();

  await db.collector.update({
    where: { id: collectorId },
    data: { status: newStatus },
  });

  await db.user.update({
    where: { id: (await db.collector.findUnique({ where: { id: collectorId } }))!.userId },
    data: { status: newStatus },
  });

  await createAuditLog({
    userId: admin.userId,
    action: `susu.collector_${newStatus === "active" ? "activated" : "deactivated"}`,
    entityType: "collector",
    entityId: collectorId,
  });

  revalidatePath("/susu/admin/collectors");
  return { success: true };
}

/**
 * Assign a customer to a collector.
 */
export async function assignCustomerToCollector(params: {
  collectorId: string;
  customerId: string;
  accountId: string;
}): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const { collectorId, customerId, accountId } = params;

  // Check if already assigned
  const existing = await db.collectorCustomerAssignment.findUnique({
    where: { collectorId_accountId: { collectorId, accountId } },
  });

  if (existing) {
    if (existing.active) {
      return { success: false, error: "Customer is already assigned to this collector" };
    }
    // Reactivate assignment
    await db.collectorCustomerAssignment.update({
      where: { id: existing.id },
      data: { active: true },
    });
  } else {
    await db.collectorCustomerAssignment.create({
      data: { collectorId, customerId, accountId },
    });
  }

  await createAuditLog({
    userId: admin.userId,
    action: "susu.customer_assigned_to_collector",
    entityType: "collector_assignment",
    entityId: collectorId,
    details: { customerId, accountId },
  });

  revalidatePath("/susu/admin/customers");
  revalidatePath("/susu/admin/collectors");
  return { success: true };
}

/**
 * Remove customer from collector.
 */
export async function removeCustomerFromCollector(assignmentId: string): Promise<ActionResponse> {
  const admin = await requireAdmin();

  await db.collectorCustomerAssignment.update({
    where: { id: assignmentId },
    data: { active: false },
  });

  await createAuditLog({
    userId: admin.userId,
    action: "susu.customer_removed_from_collector",
    entityType: "collector_assignment",
    entityId: assignmentId,
  });

  revalidatePath("/susu/admin/customers");
  revalidatePath("/susu/admin/collectors");
  return { success: true };
}

/**
 * Record a collector remittance (bringing collected money to office).
 */
export async function recordRemittance(params: {
  collectorId: string;
  remittedAmount: number;
  notes?: string;
}): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const { collectorId, remittedAmount, notes } = params;

  if (remittedAmount <= 0) {
    return { success: false, error: "Remitted amount must be greater than 0" };
  }

  // Calculate expected amount from unremitted contributions
  const collector = await db.collector.findUnique({ where: { id: collectorId } });
  if (!collector) return { success: false, error: "Collector not found" };

  const assignments = await db.collectorCustomerAssignment.findMany({
    where: { collectorId, active: true },
  });

  const accountIds = assignments.map((a) => a.accountId);

  // Get all contributions by this collector that haven't been remitted yet
  const existingRemittances = await db.collectorRemittance.findMany({
    where: { collectorId },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  const lastRemittanceDate = existingRemittances.length > 0 ? existingRemittances[0].createdAt : new Date(0);

  const unremittedContributions = await db.contribution.findMany({
    where: {
      collectorId,
      collectionDate: { gt: lastRemittanceDate },
    },
  });

  const expectedAmount = unremittedContributions.reduce((sum, c) => sum + Number(c.amount), 0);
  const variance = expectedAmount - remittedAmount;

  const referenceId = `REM-${randomBytes(8).toString("hex")}`;

  const remittance = await db.collectorRemittance.create({
    data: {
      collectorId,
      expectedAmount,
      remittedAmount,
      variance,
      status: variance === 0 ? "reconciled" : "discrepancy",
      recordedById: admin.userId,
      referenceId,
      notes,
    },
  });

  await createAuditLog({
    userId: admin.userId,
    action: "susu.remittance_recorded",
    entityType: "remittance",
    entityId: remittance.id,
    details: { collectorId, expectedAmount, remittedAmount, variance },
  });

  revalidatePath("/susu/admin/remittances");
  revalidatePath("/susu/admin/collectors");
  return { success: true, data: remittance };
}

/**
 * Get all collectors with their stats.
 */
export async function getCollectors() {
  await requireAdmin();

  const collectors = await db.collector.findMany({
    include: {
      user: { select: { id: true, fullName: true, email: true, phone: true, status: true } },
      assignments: { where: { active: true } },
      contributions: {
        where: {
          collectionDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      },
      remittances: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  return collectors;
}

/**
 * Get collector by ID with full details.
 */
export async function getCollectorById(id: string) {
  await requireAdmin();

  return db.collector.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, fullName: true, email: true, phone: true, status: true } },
      assignments: {
        where: { active: true },
        include: {
          customer: true,
          account: true,
        },
      },
      contributions: {
        orderBy: { collectionDate: "desc" },
        take: 20,
        include: {
          account: { include: { customer: { select: { fullName: true, customerId: true } } } },
        },
      },
      remittances: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
}

/**
 * Get remittances with filters.
 */
export async function getRemittances(params?: {
  page?: number;
  limit?: number;
  collectorId?: string;
  status?: string;
}) {
  await requireAdmin();

  const page = params?.page || 1;
  const limit = params?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (params?.collectorId) where.collectorId = params.collectorId;
  if (params?.status) where.status = params.status;

  const [remittances, total] = await Promise.all([
    db.collectorRemittance.findMany({
      where,
      include: {
        collector: {
          include: { user: { select: { fullName: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.collectorRemittance.count({ where }),
  ]);

  return {
    remittances,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
