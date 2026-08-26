"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin, requireCustomer, hashPassword } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { normalizeGhanaPhone } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export interface ActionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

// Generate unique customer ID: BIK-C-XXXXXX
function generateCustomerId(counter: number): string {
  return `BIK-C-${String(counter).padStart(6, "0")}`;
}

// Generate unique account ID: BIK-S-XXXXXX
function generateAccountId(counter: number): string {
  return `BIK-S-${String(counter).padStart(6, "0")}`;
}

export async function createCustomer(formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const fullName = (formData.get("fullName") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || undefined;
  const address = (formData.get("address") as string)?.trim() || undefined;
  const dailyContribution = parseFloat(formData.get("dailyContribution") as string);
  const cardFee = parseFloat(formData.get("cardFee") as string) || 10;
  const temporaryPassword = (formData.get("temporaryPassword") as string)?.trim() || undefined;

  if (!fullName || fullName.length < 2) {
    return { success: false, error: "Full name must be at least 2 characters" };
  }
  if (!dailyContribution || dailyContribution <= 0) {
    return { success: false, error: "Daily contribution must be greater than 0" };
  }
  if (temporaryPassword && temporaryPassword.length < 8) {
    return { success: false, error: "Temporary password must be at least 8 characters" };
  }

  // Generate IDs
  const customerCount = await db.customer.count();
  const customerId = generateCustomerId(customerCount + 1);
  const accountId = generateAccountId(customerCount + 1);

  const customer = await db.customer.create({
    data: {
      customerId,
      fullName,
      phone,
      address,
      status: "active",
    },
  });

  const susuAccount = await db.susuAccount.create({
    data: {
      accountId,
      customerId: customer.id,
      dailyContribution,
      status: "active",
      cardCustody: "customer",
    },
  });

  // Record card fee
  await db.cardFee.create({
    data: {
      accountId: susuAccount.id,
      amount: cardFee,
      recordedById: admin.userId,
      notes: "Initial card purchase",
    },
  });

  // Create first cycle
  const now = new Date();
  const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const cycleEnd = new Date(now.getFullYear(), now.getMonth(), 31);

  await db.susuCycle.create({
    data: {
      accountId: susuAccount.id,
      cycleNumber: 1,
      startDate: cycleStart,
      endDate: cycleEnd,
      dailyContribution,
      status: "active",
      commissionCharged: false,
    },
  });

  // Optional: enable portal access with a temporary password at creation time
  let portalCreated = false;
  if (temporaryPassword) {
    const portalPasswordHash = await hashPassword(temporaryPassword);
    await db.customer.update({
      where: { id: customer.id },
      data: {
        portalEnabled: true,
        portalPasswordHash,
        forcePortalPasswordReset: true,
      },
    });
    portalCreated = true;
    await createAuditLog({
      userId: admin.userId,
      action: "susu.customer_portal_created",
      entityType: "customer",
      entityId: customer.id,
      details: { customerId, method: "create_customer", forcePasswordReset: true },
    });
  }

  await createAuditLog({
    userId: admin.userId,
    action: "susu.customer_created",
    entityType: "customer",
    entityId: customer.id,
    details: { customerId, fullName, dailyContribution },
  });

  revalidatePath("/susu/admin/customers");
  return { success: true, data: { customer, susuAccount, portalEnabled: portalCreated } };
}

export async function updateCustomer(customerId: string, formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const fullName = (formData.get("fullName") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || undefined;
  const address = (formData.get("address") as string)?.trim() || undefined;
  const dailyContribution = parseFloat(formData.get("dailyContribution") as string);

  if (!fullName || fullName.length < 2) {
    return { success: false, error: "Full name must be at least 2 characters" };
  }

  const customer = await db.customer.update({
    where: { id: customerId },
    data: { fullName, phone, address },
  });

  // Update daily contribution on the account if provided
  if (dailyContribution && dailyContribution > 0) {
    await db.susuAccount.updateMany({
      where: { customerId, status: "active" },
      data: { dailyContribution },
    });
  }

  await createAuditLog({
    userId: admin.userId,
    action: "susu.customer_updated",
    entityType: "customer",
    entityId: customerId,
    details: { fullName },
  });

  revalidatePath("/susu/admin/customers");
  return { success: true, data: customer };
}

export async function toggleCustomerStatus(customerId: string, newStatus: string): Promise<ActionResponse> {
  const admin = await requireAdmin();

  await db.customer.update({
    where: { id: customerId },
    data: { status: newStatus },
  });

  await createAuditLog({
    userId: admin.userId,
    action: `susu.customer_${newStatus === "active" ? "activated" : "deactivated"}`,
    entityType: "customer",
    entityId: customerId,
  });

  revalidatePath("/susu/admin/customers");
  return { success: true };
}

export async function getCustomers(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  collectorId?: string;
}) {
  await requireAdmin();

  const page = params?.page || 1;
  const limit = params?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (params?.status) where.status = params.status;

  if (params?.search) {
    where.OR = [
      { fullName: { contains: params.search } },
      { customerId: { contains: params.search } },
      { phone: { contains: params.search } },
    ];
  }

  if (params?.collectorId) {
    where.assignments = {
      some: { collectorId: params.collectorId, active: true },
    };
  }

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: {
        accounts: {
          where: { status: "active" },
          include: {
            cycles: { where: { status: "active" }, take: 1 },
          },
        },
        assignments: {
          where: { active: true },
          include: { collector: { include: { user: { select: { fullName: true } } } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.customer.count({ where }),
  ]);

  return {
    customers,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getCustomerById(id: string) {
  await requireAdmin();

  return db.customer.findUnique({
    where: { id },
    include: {
      accounts: {
        include: {
          cycles: {
            orderBy: { cycleNumber: "desc" },
            include: {
               contributions: {
                 orderBy: { collectionDate: "asc" },
                 include: { allocations: true, recordedBy: { select: { fullName: true } }, receivedBy: { select: { fullName: true } } },
               },
              withdrawals: { orderBy: { createdAt: "desc" } },
              commissions: true,
            },
          },
          cardFees: true,
        },
      },
      assignments: {
        include: { collector: { include: { user: { select: { fullName: true, id: true } } } } },
        orderBy: { assignedAt: "desc" },
      },
    },
  });
}

export async function reassignCustomer(params: {
  customerId: string;
  accountId: string;
  newCollectorId: string;
}): Promise<ActionResponse> {
  const admin = await requireAdmin();
  const { customerId, accountId, newCollectorId } = params;

  // 1. Verify customer exists
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return { success: false, error: "Customer not found" };
  }

  // 2. Verify new collector exists and is active
  const newCollector = await db.collector.findUnique({
    where: { id: newCollectorId },
    include: { user: { select: { fullName: true, status: true } } },
  });
  if (!newCollector || newCollector.user.status !== "active") {
    return { success: false, error: "Selected collector is not available" };
  }

  // 3. Find current active assignment
  const currentAssignment = await db.collectorCustomerAssignment.findFirst({
    where: { customerId, accountId, active: true },
    include: { collector: { include: { user: { select: { fullName: true } } } } },
  });

  // 4. Prevent no-op reassignment
  if (currentAssignment && currentAssignment.collectorId === newCollectorId) {
    return { success: false, error: "Customer is already assigned to this collector" };
  }

  const previousCollectorName = currentAssignment?.collector?.user?.fullName || "None";

  // 5. Atomic reassignment
  await db.$transaction(async (tx) => {
    // Deactivate old assignment
    if (currentAssignment) {
      await tx.collectorCustomerAssignment.update({
        where: { id: currentAssignment.id },
        data: { active: false, unassignedAt: new Date() },
      });
    }

    // Check if new collector already has an assignment for this account
    const existingNew = await tx.collectorCustomerAssignment.findUnique({
      where: { collectorId_accountId: { collectorId: newCollectorId, accountId } },
    });

    if (existingNew) {
      // Reactivate existing assignment
      await tx.collectorCustomerAssignment.update({
        where: { id: existingNew.id },
        data: { active: true, unassignedAt: null },
      });
    } else {
      // Create new assignment
      await tx.collectorCustomerAssignment.create({
        data: {
          collectorId: newCollectorId,
          customerId,
          accountId,
          active: true,
        },
      });
    }
  });

  // 6. Audit
  await createAuditLog({
    userId: admin.userId,
    action: "susu.customer_reassigned",
    entityType: "customer",
    entityId: customerId,
    details: {
      customerId: customer.customerId,
      customerName: customer.fullName,
      previousCollector: previousCollectorName,
      newCollector: newCollector.user.fullName,
    },
  });

  revalidatePath("/susu/admin/customers");
  revalidatePath(`/susu/admin/customers/${customerId}`);
  revalidatePath("/susu/admin/collectors");
  return { success: true };
}

export async function searchCustomers(query: string) {
  await requireAuth();

  if (!query || query.length < 2) return [];

  // For SQLite, contains() is case-sensitive. We fetch more results
  // and filter in-memory for case-insensitive matching.
  const normalizedQuery = query.trim().toLowerCase();
  const phoneCandidates = normalizeGhanaPhone(query);

  // Fetch candidates with a broader match (lowercase the query for SQLite LIKE)
  const candidates = await db.customer.findMany({
    where: {
      OR: [
        { fullName: { contains: normalizedQuery } },
        { customerId: { contains: normalizedQuery } },
        { phone: { contains: normalizedQuery } },
        // Also try uppercase variant for SQLite case sensitivity
        { fullName: { contains: normalizedQuery.toUpperCase() } },
        { customerId: { contains: normalizedQuery.toUpperCase() } },
        // Match phone in any canonical Ghanaian form (024... / +233...)
        ...(phoneCandidates.length ? [{ phone: { in: phoneCandidates } }] : []),
      ],
      status: "active",
    },
    include: {
      accounts: {
        where: { status: "active" },
        include: {
          cycles: { where: { status: "active" }, take: 1 },
        },
      },
    },
    take: 20,
  });

  // Deduplicate and apply case-insensitive filter
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.id)) return false;
    const nameLower = c.fullName.toLowerCase();
    const idLower = c.customerId.toLowerCase();
    const phoneLower = (c.phone || "").toLowerCase();
    const matches =
      nameLower.includes(normalizedQuery) ||
      idLower.includes(normalizedQuery) ||
      phoneLower.includes(normalizedQuery);
    if (matches) seen.add(c.id);
    return matches;
  }).slice(0, 10);
}

export async function getCustomerAccount() {
  const session = await requireCustomer();

  return db.customer.findUnique({
    where: { id: session.userId },
    include: {
      accounts: {
        where: { status: "active" },
        take: 1,
        include: {
          cycles: {
            where: { status: "active" },
            take: 1,
            include: {
               contributions: {
                 orderBy: { collectionDate: "desc" },
                 take: 20,
                 include: {
                   allocations: true,
                   receivedBy: { select: { fullName: true } },
                   collector: { include: { user: { select: { fullName: true } } } },
                 },
               },
              withdrawals: { orderBy: { createdAt: "desc" }, take: 20 },
              commissions: { orderBy: { createdAt: "desc" } },
            },
          },
        },
      },
      assignments: {
        where: { active: true },
        include: { collector: { include: { user: { select: { fullName: true } } } } },
      },
    },
  });
}

export async function getCustomerPayments() {
  const session = await requireCustomer();

  return db.contribution.findMany({
    where: {
      account: {
        customerId: session.userId,
      },
    },
    include: {
      cycle: { select: { cycleNumber: true } },
      collector: { include: { user: { select: { fullName: true } } } },
      receivedBy: { select: { fullName: true } },
      allocations: true,
    },
    orderBy: { collectionDate: "desc" },
  });
}

export async function getCustomerCycles() {
  const session = await requireCustomer();

  const customer = await db.customer.findUnique({
    where: { id: session.userId },
    include: {
      accounts: {
        where: { status: "active" },
        take: 1,
        include: {
          cycles: {
            orderBy: { cycleNumber: "desc" },
            include: {
              contributions: {
                include: { allocations: true },
              },
              withdrawals: true,
              commissions: true,
            },
          },
        },
      },
    },
  });

  if (!customer || !customer.accounts[0]) return [];

  const account = customer.accounts[0];

  return account.cycles.map((cycle) => {
    const totalContributed = cycle.contributions.reduce((sum, c) => sum + Number(c.amount), 0);
    const totalWithdrawn = cycle.withdrawals.reduce((sum, w) => sum + Number(w.netAmount), 0);
    const totalCommissions = cycle.commissions.reduce((sum, c) => sum + Number(c.amount), 0);
    const paidDays = new Set(
      cycle.contributions.flatMap((c) => c.allocations.map((a) => a.cycleDay))
    ).size;
    const balance = totalContributed - totalWithdrawn - totalCommissions;

    return {
      id: cycle.id,
      cycleNumber: cycle.cycleNumber,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      dailyContribution: Number(cycle.dailyContribution),
      status: cycle.status,
      totalContributed,
      totalWithdrawn,
      totalCommissions,
      paidDays,
      balance,
    };
  });
}

export async function getCustomerWithdrawals() {
  const session = await requireCustomer();

  return db.withdrawal.findMany({
    where: {
      account: {
        customerId: session.userId,
      },
    },
    include: {
      cycle: { select: { cycleNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCustomerStatement() {
  const session = await requireCustomer();

  // Get contributions
  const contributions = await db.contribution.findMany({
    where: {
      account: {
        customerId: session.userId,
      },
    },
      include: {
        cycle: { select: { cycleNumber: true } },
        receivedBy: { select: { fullName: true } },
      },
      orderBy: { collectionDate: "asc" },
    });

  // Get withdrawals
  const withdrawals = await db.withdrawal.findMany({
    where: {
      account: {
        customerId: session.userId,
      },
    },
    include: {
      cycle: { select: { cycleNumber: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Get commissions
  const commissions = await db.commission.findMany({
    where: {
      account: {
        customerId: session.userId,
      },
    },
    include: {
      cycle: { select: { cycleNumber: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Build chronological statement
  const entries: Array<{
    date: Date;
    type: "contribution" | "withdrawal" | "commission";
    amount: number;
    balance?: number;
    channel: string;
    receivedBy?: string;
    cycleNumber: number;
    notes?: string;
  }> = [];

  let runningBalance = 0;

  contributions.forEach((c) => {
    runningBalance += Number(c.amount);
    entries.push({
      date: new Date(c.collectionDate),
      type: "contribution",
      amount: Number(c.amount),
      balance: runningBalance,
       channel: c.channel,
       receivedBy: (c as { receivedByName?: string | null }).receivedByName ?? c.receivedBy?.fullName,
       cycleNumber: c.cycle.cycleNumber,
    });
  });

  withdrawals.forEach((w) => {
    runningBalance -= Number(w.netAmount);
    entries.push({
      date: new Date(w.createdAt),
      type: "withdrawal",
      amount: Number(w.netAmount),
      balance: runningBalance,
      channel: "withdrawal",
      cycleNumber: w.cycle.cycleNumber,
      notes: w.notes || undefined,
    });

    if (Number(w.commissionAmount) > 0) {
      runningBalance -= Number(w.commissionAmount);
      entries.push({
        date: new Date(w.createdAt),
        type: "commission",
        amount: Number(w.commissionAmount),
        balance: runningBalance,
        channel: "commission",
        cycleNumber: w.cycle.cycleNumber,
      });
    }
  });

  commissions.forEach((c) => {
    runningBalance -= Number(c.amount);
    entries.push({
      date: new Date(c.createdAt),
      type: "commission",
      amount: Number(c.amount),
      balance: runningBalance,
      channel: "commission",
      cycleNumber: c.cycle.cycleNumber,
    });
  });

  return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function getCustomerProfile() {
  const session = await requireCustomer();

  return db.customer.findUnique({
    where: { id: session.userId },
    include: {
      accounts: {
        where: { status: "active" },
        take: 1,
        include: {
          cycles: {
            where: { status: "active" },
            take: 1,
          },
        },
      },
      assignments: {
        where: { active: true },
        include: { collector: { include: { user: { select: { fullName: true } } } } },
      },
    },
  });
}

// ===================================================================
// ADMIN CUSTOMER PORTAL PROVISIONING
// ===================================================================

/**
 * Admin creates customer portal login credentials.
 * Sets a temporary password and forces password change on first login.
 */
export async function createCustomerPortalAccess(
  customerId: string,
  formData: FormData
): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const loginIdentifier = (formData.get("loginIdentifier") as string)?.trim();
  const temporaryPassword = formData.get("temporaryPassword") as string;

  if (!loginIdentifier) {
    return { success: false, error: "Login identifier is required" };
  }
  if (!temporaryPassword || temporaryPassword.length < 8) {
    return { success: false, error: "Temporary password must be at least 8 characters" };
  }

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return { success: false, error: "Customer not found" };
  }

  if (customer.portalEnabled && customer.portalPasswordHash) {
    return { success: false, error: "Customer already has portal access. Use password reset instead." };
  }

  const passwordHash = await hashPassword(temporaryPassword);

  await db.customer.update({
    where: { id: customerId },
    data: {
      portalEnabled: true,
      portalPasswordHash: passwordHash,
      forcePortalPasswordReset: true,
    },
  });

  // Invalidate any existing customer sessions
  // (tokenVersion isn't on Customer model, but portalPasswordReset flag suffices)

  await createAuditLog({
    userId: admin.userId,
    action: "susu.customer_portal_created",
    entityType: "customer",
    entityId: customerId,
    details: {
      customerId: customer.customerId,
      customerName: customer.fullName,
      loginIdentifier,
    },
  });

  revalidatePath(`/susu/admin/customers/${customerId}`);
  revalidatePath("/susu/admin/customers");
  return { success: true };
}

/**
 * Admin resets a customer's portal password.
 * Invalidates existing sessions and forces password change.
 */
export async function resetCustomerPassword(
  customerId: string,
  formData: FormData
): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const newPassword = formData.get("newPassword") as string;
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return { success: false, error: "Customer not found" };
  }

  const passwordHash = await hashPassword(newPassword);

  await db.customer.update({
    where: { id: customerId },
    data: {
      portalPasswordHash: passwordHash,
      forcePortalPasswordReset: true,
      tokenVersion: { increment: 1 },
    },
  });

  await createAuditLog({
    userId: admin.userId,
    action: "susu.customer_portal_password_reset",
    entityType: "customer",
    entityId: customerId,
    details: {
      customerId: customer.customerId,
      customerName: customer.fullName,
      sessionsInvalidated: true,
    },
  });

  revalidatePath(`/susu/admin/customers/${customerId}`);
  return { success: true };
}

/**
 * Admin enables or disables customer portal access.
 * Disabling does NOT delete financial records.
 */
export async function toggleCustomerPortal(
  customerId: string,
  enabled: boolean
): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return { success: false, error: "Customer not found" };
  }

  if (!enabled && !customer.portalEnabled) {
    return { success: false, error: "Customer portal is already disabled" };
  }

  if (enabled && !customer.portalPasswordHash) {
    return { success: false, error: "Cannot enable portal without creating login credentials first" };
  }

  await db.customer.update({
    where: { id: customerId },
    data: { portalEnabled: enabled },
  });

  await createAuditLog({
    userId: admin.userId,
    action: enabled ? "susu.customer_portal_enabled" : "susu.customer_portal_disabled",
    entityType: "customer",
    entityId: customerId,
    details: {
      customerId: customer.customerId,
      customerName: customer.fullName,
    },
  });

  revalidatePath(`/susu/admin/customers/${customerId}`);
  revalidatePath("/susu/admin/customers");
  return { success: true };
}
