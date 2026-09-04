"use server";

import { db } from "@/lib/db";
import {
  getAdminSession,
  getSusuSession,
  getAnyAuthUser,
  requireAdmin,
  resolveAuthenticatedCollector,
} from "@/lib/auth";
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
 * - Admin → can record for any account (channel = "direct_office", or
 *   channel = "collector" with an explicit collectorId for the on-behalf flow)
 * - Collector → can only record for assigned customers (channel = "collector")
 *
 * Admin sessions are resolved from the ADMIN cookie first so that a leftover
 * Susu collector session (e.g. a browser that previously signed in a collector)
 * can never shadow the admin account entering an office payment. Collector
 * identity is always resolved via the canonical resolveAuthenticatedCollector()
 * (Susu module session + active Collector record) — never from browser input.
 *
 * For direct_office channel, admin can optionally specify receivedById (the staff
 * member who physically received the money). If not provided, recordedById is used.
 */
export async function recordContribution(params: {
  accountId: string;
  amount: number;
  channel: "collector" | "direct_office";
  collectorId?: string; // Admin-only: manually selected collector. Ignored for collector role.
  receivedById?: string; // Admin-only for direct_office: staff (User) who received the money
  receivedByName?: string; // Free-text name of the staff who physically received the money (office)
  recordedById?: string; // Admin-only for direct_office: staff (User) who recorded the payment
  recordedByName?: string; // Free-text display name of the person recording the payment
  notes?: string;
}): Promise<ActionResponse> {
  const { accountId, amount, channel, collectorId, receivedById, receivedByName, recordedById: clientRecordedById, recordedByName, notes } = params;

  // ── 1. Authenticate ─────────────────────────────────────────────────
  // Admin cookie first, then the Susu collector session. The account that
  // enters the payment is the one recorded as recordedById.
  const admin = await getAdminSession();
  const susu = await getSusuSession();
  const isAdmin = !!admin && admin.role === "admin";
  const user = admin ?? susu;
  if (!user) {
    return { success: false, error: "Not authenticated. Please sign in again." };
  }

  // ── 2. Validate amount ──────────────────────────────────────────────
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Contribution amount must be greater than 0" };
  }

  // ── 3. Derive collector identity from session ───────────────────────
  let effectiveCollectorId: string | null = null;
  let recordedById: string;

  if (channel === "collector") {
    if (isAdmin && collectorId) {
      // Admin recording on behalf of a collector: trust the admin-selected ID
      const collector = await db.collector.findUnique({ where: { id: collectorId } });
      if (!collector) {
        return { success: false, error: "Selected collector not found" };
      }
      effectiveCollectorId = collectorId;
      recordedById = admin!.userId;
    } else {
      // Collector: always derive from the canonical session resolution
      // (never trust client input for collectorId)
      const resolved = await resolveAuthenticatedCollector();
      if (!resolved) {
        const anyUser = await getAnyAuthUser();
        if (!anyUser) {
          return { success: false, error: "Not authenticated. Please sign in again." };
        }
        return { success: false, error: "Collector identity is required for collector-channel contributions" };
      }
      effectiveCollectorId = resolved.collector.id;
      recordedById = resolved.user.userId;
    }
  } else {
    // channel === "direct_office" — office payments are entered by admins only
    if (!isAdmin) {
      return { success: false, error: "Only administrators can record office contributions" };
    }
    // Use the selected staff recorder if provided, otherwise default to the authenticated admin
    if (clientRecordedById) {
      const recordedByUser = await db.user.findUnique({ where: { id: clientRecordedById } });
      if (!recordedByUser) {
        return { success: false, error: "Selected recorder staff member not found" };
      }
      if (recordedByUser.status !== "active") {
        return { success: false, error: "Selected recorder staff member is not active" };
      }
      if (!["admin", "worker", "collector"].includes(recordedByUser.role)) {
        return { success: false, error: "Selected recorder is not an authorized staff member" };
      }
      recordedById = clientRecordedById;
    } else {
      recordedById = admin!.userId;
    }
  }

  // ── 3b. Resolve authoritative recordedByName from validated recordedById ──
  // Never trust free-text client input for identity resolution.
  const recorderUser = await db.user.findUnique({
    where: { id: recordedById },
    select: { fullName: true },
  });
  const effectiveRecordedByName = recorderUser?.fullName || recordedByName?.trim() || null;

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
  let effectiveReceivedByName: string | null = null;
  if (channel === "direct_office") {
    if (receivedById) {
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
      if (!["admin", "worker", "collector"].includes(receivedByUser.role)) {
        return { success: false, error: "Selected receiver is not an authorized staff member" };
      }
      effectiveReceivedById = receivedById;
      // Resolve authoritative name from validated user — never trust free-text input
      effectiveReceivedByName = receivedByUser.fullName;
    } else {
      // Default to the recording user (the admin entering the payment)
      effectiveReceivedById = recordedById;
      // Resolve the name from the recordedBy user
      const defaultReceiver = await db.user.findUnique({
        where: { id: recordedById },
        select: { fullName: true },
      });
      effectiveReceivedByName = defaultReceiver?.fullName || null;
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
        recordedById,
        recordedByName: effectiveRecordedByName,
        receivedById: effectiveReceivedById,
        receivedByName: effectiveReceivedByName,
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
  // The audit log preserves the authenticated actor (who submitted the request)
  // separately from the business attribution (who received/recorded the payment).
  await createAuditLog({
    userId: user.userId, // Authenticated actor — always from the session
    action: "susu.contribution_recorded",
    entityType: "contribution",
    entityId: result.contribution.id,
    details: {
      accountId,
      amount,
      channel,
      collectorId: effectiveCollectorId,
      receivedById: effectiveReceivedById,
      receivedByName: effectiveReceivedByName,
      recordedById, // Business attribution — the staff selected as recorder
      recordedByName: effectiveRecordedByName,
      authenticatedActorId: user.userId, // Explicit audit trail
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
