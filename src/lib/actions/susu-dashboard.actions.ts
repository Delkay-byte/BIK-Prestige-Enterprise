"use server";

import { db } from "@/lib/db";
import { requireAdmin, resolveAuthenticatedCollector } from "@/lib/auth";

/**
 * Get Susu dashboard overview stats for admin.
 */
export async function getSusuDashboardStats() {
  await requireAdmin();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  // Today's contributions (all channels)
  const todayContributions = await db.contribution.aggregate({
    where: { collectionDate: { gte: today, lt: tomorrow } },
    _sum: { amount: true },
    _count: true,
  });

  // Collector-channel contributions only
  const todayCollectorContributions = await db.contribution.aggregate({
    where: {
      channel: "collector",
      collectionDate: { gte: today, lt: tomorrow },
    },
    _sum: { amount: true },
    _count: true,
  });

  // Office contributions only
  const todayOfficeContributions = await db.contribution.aggregate({
    where: {
      channel: "direct_office",
      collectionDate: { gte: today, lt: tomorrow },
    },
    _sum: { amount: true },
    _count: true,
  });

  const [
    activeCustomers,
    activeCollectors,
    todayWithdrawals,
    todayCommissions,
    todayCardFees,
    totalCustomers,
    paidTodayCustomers,
  ] = await Promise.all([
    db.customer.count({ where: { status: "active" } }),
    db.collector.count({ where: { status: "active" } }),
    db.withdrawal.aggregate({
      where: { createdAt: { gte: today, lt: tomorrow }, status: "completed" },
      _sum: { requestedAmount: true, commissionAmount: true, netAmount: true },
      _count: true,
    }),
    db.commission.aggregate({
      where: { createdAt: { gte: today, lt: tomorrow } },
      _sum: { amount: true },
    }),
    db.cardFee.aggregate({
      _sum: { amount: true },
    }),
    db.customer.count(),
    db.contribution.findMany({
      where: { collectionDate: { gte: today, lt: tomorrow } },
      select: { accountId: true },
      distinct: ["accountId"],
    }),
  ]);

  // Pending Money Handed In: SUM of max(Expected to Bring In - Amount Handed In, 0) across collectors
  // This represents money from collector collections that has not yet been recorded as handed in
  // Per collector: Expected to Bring In = today's collector-channel contributions
  // Amount Handed In = today's remittances
  // Difference = Expected to Bring In - Amount Handed In
  // Admin sum = SUM of max(Difference, 0) across collectors (don't offset shortages with overages)
  const collectors = await db.collector.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  let pendingMoneyHandedIn = 0;
  for (const collector of collectors) {
    const todayContributions = await db.contribution.findMany({
      where: {
        collectorId: collector.id,
        channel: "collector",
        collectionDate: { gte: today, lt: tomorrow },
      },
      select: { amount: true },
    });
    const todayContributionsAmount = todayContributions.reduce(
      (sum, c) => sum + Number(c.amount),
      0
    );

    const todayRemittances = await db.collectorRemittance.findMany({
      where: {
        collectorId: collector.id,
        createdAt: { gte: today, lt: tomorrow },
      },
      select: { remittedAmount: true },
    });
    const amountHandedInToday = todayRemittances.reduce(
      (sum, r) => sum + Number(r.remittedAmount),
      0
    );

    const difference = todayContributionsAmount - amountHandedInToday;
    if (difference > 0) {
      pendingMoneyHandedIn += difference;
    }
  }

  const outstandingToday = activeCustomers - paidTodayCustomers.length;

  return {
    activeCustomers,
    activeCollectors,
    totalCustomers,
    paidToday: paidTodayCustomers.length,
    outstandingToday,
    todayContributions: Number(todayContributions._sum.amount || 0),
    todayContributionCount: todayContributions._count,
    todayCollectorContributions: Number(todayCollectorContributions._sum.amount || 0),
    todayCollectorContributionCount: todayCollectorContributions._count,
    todayOfficeContributions: Number(todayOfficeContributions._sum.amount || 0),
    todayOfficeContributionCount: todayOfficeContributions._count,
    todayWithdrawals: Number(todayWithdrawals._sum.requestedAmount || 0),
    todayWithdrawalCount: todayWithdrawals._count,
    todayCommission: Number(todayCommissions._sum.amount || 0),
    todayNetPaid: Number(todayWithdrawals._sum.netAmount || 0),
    totalCardFees: Number(todayCardFees._sum.amount || 0),
    pendingMoneyHandedIn: Math.max(0, pendingMoneyHandedIn),
    pendingRemittanceCount: 0,
  };
}

/**
 * Get collector-specific dashboard stats with TO VISIT and COLLECTED TODAY.
 * Only accessible by users with the collector role.
 */
export async function getCollectorDashboardStats(collectorUserId: string) {
  // Resolve the authenticated collector canonically (Susu module session +
  // active Collector record). The primary User.role is not used because the
  // platform grants Susu capability to worker-role accounts via susuEnabled.
  const resolved = await resolveAuthenticatedCollector();
  if (!resolved) return null;

  // Verify the requested userId matches the authenticated user
  if (resolved.user.userId !== collectorUserId) {
    return null;
  }

  const collector = resolved.collector;

  // Use start-of-day in UTC (consistent with the rest of the app)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const assignments = await db.collectorCustomerAssignment.findMany({
    where: { collectorId: collector.id, active: true },
    include: {
      customer: true,
      account: {
        include: {
          cycles: { where: { status: "active" }, take: 1 },
        },
      },
    },
  });

  // Fetch today's contributions for this collector (collector channel only for cash accountability)
  const todayCollectorContributions = await db.contribution.findMany({
    where: {
      collectorId: collector.id,
      channel: "collector",
      collectionDate: { gte: today, lt: tomorrow },
    },
    include: {
      allocations: true,
    },
    orderBy: { collectionDate: "desc" },
  });

  // Also fetch all today's contributions for TO VISIT / COLLECTED TODAY display (any channel)
  const todayAllContributions = await db.contribution.findMany({
    where: {
      collectionDate: { gte: today, lt: tomorrow },
    },
    include: {
      allocations: true,
    },
    orderBy: { collectionDate: "desc" },
  });

  // Index today's all contributions by accountId for quick lookup
  const todayByAccount = new Map<string, typeof todayAllContributions>();
  for (const c of todayAllContributions) {
    const existing = todayByAccount.get(c.accountId) || [];
    existing.push(c);
    todayByAccount.set(c.accountId, existing);
  }

  const toVisit: Array<{
    accountId: string;
    customerName: string;
    customerIdCode: string;
    dailyContribution: number;
    outstandingDays: number;
    expectedAmount: number;
  }> = [];

  const collectedToday: Array<{
    accountId: string;
    customerName: string;
    customerIdCode: string;
    amountCollected: number;
    daysCovered: number;
    collectedAt: string;
  }> = [];

  let totalCollectedToday = 0;

  for (const assignment of assignments) {
    const cycle = assignment.account.cycles[0];
    if (!cycle) continue;

    // Check if this customer has been collected today (any channel)
    const todayContribs = todayByAccount.get(assignment.account.id);
    if (todayContribs && todayContribs.length > 0) {
      // Customer has been collected today — show in COLLECTED TODAY
      const latestContrib = todayContribs[0];
      const daysCovered = latestContrib.allocations.length;
      const amountCollected = todayContribs.reduce((sum, c) => sum + Number(c.amount), 0);
      totalCollectedToday += amountCollected;

      collectedToday.push({
        accountId: assignment.account.id,
        customerName: assignment.customer.fullName,
        customerIdCode: assignment.customer.customerId,
        amountCollected,
        daysCovered,
        collectedAt: latestContrib.collectionDate.toISOString(),
      });
    } else {
      // Customer has NOT been collected today — show in TO VISIT
      const allocations = await db.contributionAllocation.findMany({
        where: { contribution: { cycleId: cycle.id } },
      });
      const paidDays = new Set(allocations.map((a) => a.cycleDay));
      const outstandingDays: number[] = [];
      for (let d = 1; d <= 31; d++) {
        if (!paidDays.has(d)) outstandingDays.push(d);
      }

      // Only include customers who actually have outstanding days
      if (outstandingDays.length > 0) {
        toVisit.push({
          accountId: assignment.account.id,
          customerName: assignment.customer.fullName,
          customerIdCode: assignment.customer.customerId,
          dailyContribution: Number(cycle.dailyContribution),
          outstandingDays: outstandingDays.length,
          expectedAmount: outstandingDays.length * Number(cycle.dailyContribution),
        });
      }
    }
  }

  // Calculate cash accountability metrics
  const todayContributionsAmount = todayCollectorContributions.reduce(
    (sum, c) => sum + Number(c.amount),
    0
  );

  // Amount Handed In today (remittances recorded today)
  const todayRemittances = await db.collectorRemittance.findMany({
    where: {
      collectorId: collector.id,
      createdAt: { gte: today, lt: tomorrow },
    },
  });
  const amountHandedInToday = todayRemittances.reduce(
    (sum, r) => sum + Number(r.remittedAmount),
    0
  );

  const expectedToBringIn = todayContributionsAmount;
  const difference = expectedToBringIn - amountHandedInToday;

  // Fetch recent money handed in (last 5)
  const recentRemittances = await db.collectorRemittance.findMany({
    where: { collectorId: collector.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return {
    assignedCustomers: assignments.length,
    todayCollected: totalCollectedToday,
    todayCollectionCount: collectedToday.length,
    toVisit,
    collectedToday,
    recentRemittances: recentRemittances.map((r) => ({
      id: r.id,
      expectedAmount: Number(r.expectedAmount),
      remittedAmount: Number(r.remittedAmount),
      variance: Number(r.variance),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    // Cash accountability
    todayContributions: todayContributionsAmount,
    expectedToBringIn,
    amountHandedInToday,
    difference,
    customersCollected: collectedToday.length,
    customersRemaining: toVisit.length,
  };
}

/**
 * Get collector breakdown for admin dashboard.
 * Returns cash accountability metrics per collector.
 */
export async function getAdminCollectorBreakdown() {
  await requireAdmin();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const collectors = await db.collector.findMany({
    where: { status: "active" },
    include: {
      user: { select: { id: true, fullName: true } },
    },
  });

  const breakdown = await Promise.all(
    collectors.map(async (collector) => {
      // Today's collector contributions
      const todayContributions = await db.contribution.findMany({
        where: {
          collectorId: collector.id,
          channel: "collector",
          collectionDate: { gte: today, lt: tomorrow },
        },
        select: { amount: true },
      });

      const todayContributionsAmount = todayContributions.reduce(
        (sum, c) => sum + Number(c.amount),
        0
      );

      // Amount Handed In today
      const todayRemittances = await db.collectorRemittance.findMany({
        where: {
          collectorId: collector.id,
          createdAt: { gte: today, lt: tomorrow },
        },
        select: { remittedAmount: true },
      });
      const amountHandedInToday = todayRemittances.reduce(
        (sum, r) => sum + Number(r.remittedAmount),
        0
      );

      // Expected to Bring In = today's collector contributions
      const expectedToBringIn = todayContributionsAmount;
      const difference = expectedToBringIn - amountHandedInToday;

      return {
        collectorId: collector.id,
        collectorName: collector.user.fullName,
        todayContributions: todayContributionsAmount,
        expectedToBringIn,
        amountHandedInToday,
        difference,
      };
    })
  );

  return breakdown;
}
