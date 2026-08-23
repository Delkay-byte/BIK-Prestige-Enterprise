"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
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
 * Multi-day allocation logic:
 * - Customer's daily plan = GH₵X/day
 * - Collection event = GH₵Y total
 * - System calculates: Y / X = number of days covered (integer division)
 * - Allocates to the first N unpaid days in the cycle
 * - Any remainder less than one day stays as unallocated credit
 */
export async function recordContribution(params: {
  accountId: string;
  amount: number;
  channel: "collector" | "direct_office";
  collectorId?: string;
  notes?: string;
}): Promise<ActionResponse> {
  // Admins can record any contribution; collectors can only record their own
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "collector") {
    return { success: false, error: "Not authorized to record contributions" };
  }

  const { accountId, amount, channel, collectorId, notes } = params;

  if (amount <= 0) {
    return { success: false, error: "Contribution amount must be greater than 0" };
  }

  // Fetch the account with active cycle
  const account = await db.susuAccount.findUnique({
    where: { id: accountId },
    include: {
      cycles: { where: { status: "active" }, take: 1 },
      customer: true,
    },
  });

  if (!account) return { success: false, error: "Susu account not found" };
  if (account.status !== "active") return { success: false, error: "Account is not active" };
  if (!account.cycles.length) return { success: false, error: "No active cycle found" };

  const cycle = account.cycles[0];
  const dailyContribution = Number(cycle.dailyContribution);

  // Validate channel-specific requirements
  if (channel === "collector" && !collectorId) {
    return { success: false, error: "Collector ID is required for collector-channel contributions" };
  }

  // Verify collector exists and is the authenticated user (if collector role)
  if (collectorId) {
    const collector = await db.collector.findUnique({ where: { id: collectorId } });
    if (!collector) return { success: false, error: "Collector not found" };
    // If the user is a collector, they can only record for themselves
    if (user.role === "collector") {
      const userCollector = await db.collector.findUnique({ where: { userId: user.userId } });
      if (!userCollector || userCollector.id !== collectorId) {
        return { success: false, error: "You can only record collections for yourself" };
      }
    }
  }
  // If user is a collector, auto-assign their collector ID
  let effectiveCollectorId = collectorId;
  if (user.role === "collector" && !effectiveCollectorId) {
    const userCollector = await db.collector.findUnique({ where: { userId: user.userId } });
    if (userCollector) effectiveCollectorId = userCollector.id;
  }

  // Generate idempotency key
  const referenceId = `CON-${randomBytes(8).toString("hex")}`;

  // Use a database transaction for financial integrity
  const result = await db.$transaction(async (tx) => {
    // 1. Create the contribution record
    const contribution = await tx.contribution.create({
      data: {
        accountId: account.id,
        cycleId: cycle.id,
        amount,
        collectionDate: new Date(),
        channel,
        collectorId: effectiveCollectorId || null,
        recordedById: user.userId,
        referenceId,
        notes,
      },
    });

    // 2. Calculate how many days this covers
    const daysCovered = Math.floor(amount / dailyContribution);
    const allocatedAmount = daysCovered * dailyContribution;
    const unallocatedAmount = amount - allocatedAmount;

    // 3. Find already-paid days in this cycle
    const existingAllocations = await tx.contributionAllocation.findMany({
      where: {
        contribution: { cycleId: cycle.id },
      },
    });
    const paidDays = new Set(existingAllocations.map((a) => a.cycleDay));

    // 4. Allocate to first N unpaid days (max 31 days in cycle)
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

    // Create allocations
    if (allocations.length > 0) {
      await tx.contributionAllocation.createMany({ data: allocations });
    }

    // Check if all 31 days are now paid
    const allDaysPaid = paidDays.size + daysAllocated >= 31;

    return {
      contribution,
      daysAllocated,
      allocatedAmount,
      unallocatedAmount,
      totalDaysPaid: paidDays.size + daysAllocated,
      allDaysPaid,
    };
  });

  await createAuditLog({
    userId: user.userId,
    action: "susu.contribution_recorded",
    entityType: "contribution",
    entityId: result.contribution.id,
    details: {
      accountId,
      amount,
      channel,
      daysAllocated: result.daysAllocated,
      allocatedAmount: result.allocatedAmount,
    },
  });

  revalidatePath("/susu/admin/contributions");
  revalidatePath("/susu/admin/customers");
  revalidatePath("/susu/admin");
  return { success: true, data: result };
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
