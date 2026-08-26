"use server";

import { db } from "@/lib/db";
import { getAnyAuthUser, requireAdmin } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";

export interface ActionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Record a contribution and allocate it across outstanding days in the cycle.
 *
 * Identity is derived server-side from the authenticated session:
 * - Admin → can record for any account (channel = "direct_office")
 * - Collector → can only record for assigned customers (channel = "collector")
 *
 * The client must NOT supply collectorId — it is always resolved from the
 * authenticated user's session to prevent impersonation.
 *
 * For direct_office channel, admin can optionally specify receivedById (the staff
 * member who physically received the money). If not provided, recordedById is used.
 */
export async function recordContribution(params: {
  accountId: string;
  amount: number;
  channel: "collector" | "direct_office";
  collectorId?: string; // Admin-only: manually selected collector. Ignored for collector role.
  receivedById?: string; // Admin-only for direct_office: staff who received the money
  notes?: string;
}): Promise<ActionResponse> {
  const { accountId, amount, channel, collectorId, receivedById, notes } = params;

  // ── 1. Authenticate ─────────────────────────────────────────────────
  const user = await getAnyAuthUser();
  if (!user) {
    return { success: false, error: "Not authenticated. Please sign in again." };
  }
  if (user.role !== "admin" && user.role !== "collector") {
    return { success: false, error: "Not authorized to record contributions" };
  }

  // ── 2. Validate amount ──────────────────────────────────────────────
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Contribution amount must be greater than 0" };
  }

  // ── 3. Derive collector identity from session ───────────────────────
  let effectiveCollectorId: string | null = null;

  if (channel === "collector") {
    if (user.role === "collector") {
      // Collector: always derive from session (never trust client input)
      const userCollector = await db.collector.findUnique({
        where: { userId: user.userId },
      });
      if (!userCollector) {
        return { success: false, error: "Collector record not found for your account" };
      }
      effectiveCollectorId = userCollector.id;
    } else if (user.role === "admin" && params.collectorId) {
      // Admin recording on behalf of a collector: trust the admin-selected ID
      const collector = await db.collector.findUnique({ where: { id: params.collectorId } });
      if (!collector) {
        return { success: false, error: "Selected collector not found" };
      }
      effectiveCollectorId = params.collectorId;
    } else {
      return { success: false, error: "Collector identity is required for collector-channel contributions" };
    }
  }

  // ── 4. Fetch account and verify ─────────────────────────────────────
  const account = await db.susuAccount.findUnique({
    where: { id: accountId },
    include: {
      cycles: { where: { status: "active" }, take: 1 },
      customer: true,
    },
  });

  if (!account) {
    return { success: false, error: "Susu account not found" };
  }
  if (account.status !== "active") {
    return { success: false, error: "Account is not active" };
  }
  if (!account.cycles.length) {
    return { success: false, error: "No active cycle found for this account" };
  }

  // ── 5. Authorize: collector can only record for assigned customers ───
  if (effectiveCollectorId) {
    const assignment = await db.collectorCustomerAssignment.findFirst({
      where: {
        collectorId: effectiveCollectorId,
        accountId: accountId,
        active: true,
      },
    });
    if (!assignment) {
      return {
        success: false,
        error: "This customer is not assigned to the collector.",
      };
    }
  }

  const cycle = account.cycles[0];
  const dailyContribution = Number(cycle.dailyContribution);

  // ── 6. Determine receivedById for direct_office channel ──────────────
  let effectiveReceivedById: string | null = null;
  if (channel === "direct_office") {
    if (user.role === "admin" && receivedById) {
      // Verify the receivedById is an authorized staff member
      const receivedByUser = await db.user.findUnique({
        where: { id: receivedById },
      });
      if (!receivedByUser) {
        return { success: false, error: "Selected staff member not found" };
      }
      if (receivedByUser.status !== "active") {
        return { success: false, error: "Selected staff member is not active" };
      }
      effectiveReceivedById = receivedById;
    } else {
      // Default to the recording user
      effectiveReceivedById = user.userId;
    }
  }

  // ── 7. Generate idempotency key ─────────────────────────────────────
  const referenceId = `CON-${randomBytes(8).toString("hex")}`;

  // ── 8. Database transaction (financial integrity) ───────────────────
  const result = await db.$transaction(async (tx) => {
    // Create the contribution record
    const contribution = await tx.contribution.create({
      data: {
        accountId: account.id,
        cycleId: cycle.id,
        amount,
        collectionDate: new Date(),
        channel,
        collectorId: effectiveCollectorId,
        recordedById: user.userId,
        receivedById: effectiveReceivedById,
        referenceId,
        notes,
      },
    });

    // Calculate days covered
    const daysCovered = Math.floor(amount / dailyContribution);
    const allocatedAmount = daysCovered * dailyContribution;

    // Find already-paid days in this cycle
    const existingAllocations = await tx.contributionAllocation.findMany({
      where: {
        contribution: { cycleId: cycle.id },
      },
    });
    const paidDays = new Set(existingAllocations.map((a) => a.cycleDay));

    // Allocate to first N unpaid days
    const allocations: { contributionId: string; cycleDay: number; amount: number }[] = [];
    let daysAllocated = 0;

    for (let day = 1; day <= 31 && daysAllocated < daysCovered; day++) {
      if (!paidDays.has(day)) {
        allocations.push({
          contributionId: contribution.id,
          cycleDay: day,
          amount: dailyContribution,
        });
        daysAllocated++;
      }
    }

    if (allocations.length > 0) {
      await tx.contributionAllocation.createMany({ data: allocations });
    }

    return {
      contribution,
      daysAllocated,
      allocatedAmount,
      totalDaysPaid: paidDays.size + daysAllocated,
    };
  });

  // ── 8. Audit log ────────────────────────────────────────────────────
  await createAuditLog({
    userId: user.userId,
    action: "susu.contribution_recorded",
    entityType: "contribution",
    entityId: result.contribution.id,
    details: {
      accountId,
      amount,
      channel,
      collectorId: effectiveCollectorId,
      receivedById: effectiveReceivedById,
      daysAllocated: result.daysAllocated,
      allocatedAmount: result.allocatedAmount,
      referenceId,
    },
  });

  // ── 9. Revalidate relevant pages ────────────────────────────────────
  revalidatePath("/susu/admin/contributions");
  revalidatePath("/susu/admin/customers");
  revalidatePath("/susu/admin");
  revalidatePath("/collector/dashboard");

  return {
    success: true,
    data: {
      contributionId: result.contribution.id,
      daysAllocated: result.daysAllocated,
      allocatedAmount: Number(result.allocatedAmount),
      referenceId,
      receivedById: effectiveReceivedById,
    },
  };
}

export async function getContributions(params?: {
  page?: number;
  limit?: number;
  accountId?: string;
  cycleId?: string;
  channel?: string;
  dateFrom?: string;
  dateTo?: string;
  collectorId?: string;
}) {
  await requireAdmin();

  const page = params?.page || 1;
  const limit = params?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (params?.accountId) where.accountId = params.accountId;
  if (params?.cycleId) where.cycleId = params.cycleId;
  if (params?.channel) where.channel = params.channel;
  if (params?.collectorId) where.collectorId = params.collectorId;

  if (params?.dateFrom || params?.dateTo) {
    where.collectionDate = {};
    const dateRange = where.collectionDate as Record<string, Date>;
    if (params.dateFrom) dateRange.gte = new Date(params.dateFrom + "T00:00:00.000Z");
    if (params.dateTo) dateRange.lte = new Date(params.dateTo + "T23:59:59.999Z");
  }

  const [contributions, total] = await Promise.all([
    db.contribution.findMany({
      where,
      include: {
        account: {
          include: { customer: { select: { customerId: true, fullName: true } } },
        },
        allocations: true,
        collector: { include: { user: { select: { fullName: true } } } },
        recordedBy: { select: { fullName: true } },
        receivedBy: { select: { fullName: true } },
      },
      orderBy: { collectionDate: "desc" },
      skip,
      take: limit,
    }),
    db.contribution.count({ where }),
  ]);

  return {
    contributions,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Get contribution summary for a specific cycle
 */
export async function getCycleContributionSummary(cycleId: string) {
  await requireAdmin();

  const cycle = await db.susuCycle.findUnique({
    where: { id: cycleId },
    include: {
      contributions: {
        include: { allocations: true },
        orderBy: { collectionDate: "asc" },
      },
    },
  });

  if (!cycle) return null;

  const totalContributed = cycle.contributions.reduce((sum, c) => sum + Number(c.amount), 0);
  const totalAllocated = cycle.contributions.reduce(
    (sum, c) => sum + c.allocations.reduce((aSum, a) => aSum + Number(a.amount), 0),
    0
  );
  const allocatedDays = new Set(
    cycle.contributions.flatMap((c) => c.allocations.map((a) => a.cycleDay))
  ).size;

  return {
    cycle,
    totalContributed,
    totalAllocated,
    allocatedDays,
    remainingDays: 31 - allocatedDays,
  };
}
