"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";

/**
 * Get Susu dashboard overview stats for admin.
 */
export async function getSusuDashboardStats() {
  await requireAdmin();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const [
    activeCustomers,
    activeCollectors,
    todayContributions,
    todayWithdrawals,
    todayCommissions,
    todayCardFees,
    pendingRemittances,
    totalCustomers,
    paidTodayCustomers,
  ] = await Promise.all([
    db.customer.count({ where: { status: "active" } }),
    db.collector.count({ where: { status: "active" } }),
    db.contribution.aggregate({
      where: { collectionDate: { gte: today, lt: tomorrow } },
      _sum: { amount: true },
      _count: true,
    }),
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
    db.collectorRemittance.aggregate({
      where: { status: "pending" },
      _sum: { expectedAmount: true, remittedAmount: true },
      _count: true,
    }),
    db.customer.count(),
    db.contribution.findMany({
      where: { collectionDate: { gte: today, lt: tomorrow } },
      select: { accountId: true },
      distinct: ["accountId"],
    }),
  ]);

  const outstandingToday = activeCustomers - paidTodayCustomers.length;

  return {
    activeCustomers,
    activeCollectors,
    totalCustomers,
    paidToday: paidTodayCustomers.length,
    outstandingToday,
    todayContributions: Number(todayContributions._sum.amount || 0),
    todayContributionCount: todayContributions._count,
    todayWithdrawals: Number(todayWithdrawals._sum.requestedAmount || 0),
    todayWithdrawalCount: todayWithdrawals._count,
    todayCommission: Number(todayCommissions._sum.amount || 0),
    todayNetPaid: Number(todayWithdrawals._sum.netAmount || 0),
    totalCardFees: Number(todayCardFees._sum.amount || 0),
    pendingRemittances: Number(pendingRemittances._sum.expectedAmount || 0) - Number(pendingRemittances._sum.remittedAmount || 0),
    pendingRemittanceCount: pendingRemittances._count,
  };
}

/**
 * Get collector-specific dashboard stats.
 * Only accessible by users with the collector role.
 */
export async function getCollectorDashboardStats(collectorUserId: string) {
  const user = await requireAuth();

  // Verify the user is actually a collector
  if (user.role !== "collector") {
    return null;
  }

  // Verify the requested userId matches the authenticated user
  if (user.userId !== collectorUserId) {
    return null;
  }

  const collector = await db.collector.findUnique({
    where: { userId: collectorUserId },
  });

  if (!collector) return null;

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

  const [todayCollections, recentRemittances] = await Promise.all([
    db.contribution.aggregate({
      where: {
        collectorId: collector.id,
        collectionDate: { gte: today, lt: tomorrow },
      },
      _sum: { amount: true },
      _count: true,
    }),
    db.collectorRemittance.findMany({
      where: { collectorId: collector.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  // Calculate outstanding obligations per customer
  const outstandingObligations = [];
  for (const assignment of assignments) {
    const cycle = assignment.account.cycles[0];
    if (!cycle) continue;

    const allocations = await db.contributionAllocation.findMany({
      where: { contribution: { cycleId: cycle.id } },
    });
    const paidDays = new Set(allocations.map((a) => a.cycleDay));
    const outstandingDays: number[] = [];
    for (let d = 1; d <= 31; d++) {
      if (!paidDays.has(d)) outstandingDays.push(d);
    }

    outstandingObligations.push({
      accountId: assignment.account.id, // Correct: this is the SusuAccount ID, used for recording contributions
      customerName: assignment.customer.fullName,
      customerIdCode: assignment.customer.customerId,
      dailyContribution: Number(cycle.dailyContribution),
      outstandingDays: outstandingDays.length,
      expectedAmount: outstandingDays.length * Number(cycle.dailyContribution),
    });
  }

  return {
    assignedCustomers: assignments.length,
    todayCollected: Number(todayCollections._sum.amount || 0),
    todayCollectionCount: todayCollections._count,
    outstandingObligations,
    recentRemittances: recentRemittances.map((r) => ({
      id: r.id,
      expectedAmount: Number(r.expectedAmount),
      remittedAmount: Number(r.remittedAmount),
      variance: Number(r.variance),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
