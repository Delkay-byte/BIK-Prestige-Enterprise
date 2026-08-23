/**
 * BIK Prestige Enterprise — Susu Business Logic Tests
 *
 * Covers all mandatory financial scenarios:
 * - Commission amounts (GH₵1, GH₵50, GH₵1,000)
 * - First withdrawal commission charged exactly once
 * - Second withdrawal no commission
 * - New cycle commission reset
 * - Partial withdrawal
 * - Multi-day allocation
 * - Remainder credit
 * - Insufficient withdrawal rejection
 * - Idempotency
 * - Financial invariants
 * - Card fee separation
 * - Concurrency safety
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  prisma,
  cleanDatabase,
  createTestAdmin,
  createTestCustomer,
  recordContribution,
  processWithdrawal,
  calculateCycleBalance,
} from "./setup";

let adminId: string;

beforeEach(async () => {
  await cleanDatabase();
  const admin = await createTestAdmin();
  adminId = admin.id;
});

// ============================================================
// COMMISSION TESTS
// ============================================================

describe("Commission", () => {
  it("charges exactly GH₵1 for GH₵1/day customer", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 1, "COM1");
    await recordContribution(account.id, cycle.id, 5, adminId);

    const result = await processWithdrawal(account.id, cycle.id, 4, adminId);
    expect(result.commissionAmount).toBe(1);
  });

  it("charges exactly GH₵50 for GH₵50/day customer", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "COM50");
    await recordContribution(account.id, cycle.id, 250, adminId);

    const result = await processWithdrawal(account.id, cycle.id, 200, adminId);
    expect(result.commissionAmount).toBe(50);
  });

  it("charges exactly GH₵1,000 for GH₵1,000/day customer", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 1000, "COM1K");
    await recordContribution(account.id, cycle.id, 2000, adminId);

    const result = await processWithdrawal(account.id, cycle.id, 1000, adminId);
    expect(result.commissionAmount).toBe(1000);
  });
});

// ============================================================
// FIRST WITHDRAWAL
// ============================================================

describe("First withdrawal", () => {
  it("charges commission exactly once on first withdrawal", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "FW1");
    await recordContribution(account.id, cycle.id, 500, adminId);

    const result = await processWithdrawal(account.id, cycle.id, 200, adminId);
    expect(result.commissionAmount).toBe(50);
    expect(result.netAmount).toBe(200);

    const commissionCount = await prisma.commission.count({ where: { cycleId: cycle.id } });
    expect(commissionCount).toBe(1);
  });

  it("creates exactly one commission record", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "FW2");
    await recordContribution(account.id, cycle.id, 250, adminId);

    await processWithdrawal(account.id, cycle.id, 100, adminId);

    const commissions = await prisma.commission.findMany({ where: { cycleId: cycle.id } });
    expect(commissions).toHaveLength(1);
    expect(Number(commissions[0].amount)).toBe(50);
    expect(commissions[0].basis).toBe("one_day_contribution");
    expect(commissions[0].triggeredBy).toBe("first_withdrawal");
  });
});

// ============================================================
// SECOND WITHDRAWAL
// ============================================================

describe("Second withdrawal in same cycle", () => {
  it("charges no additional commission", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "SW1");
    await recordContribution(account.id, cycle.id, 500, adminId);

    const first = await processWithdrawal(account.id, cycle.id, 100, adminId);
    expect(first.commissionAmount).toBe(50);

    const second = await processWithdrawal(account.id, cycle.id, 100, adminId);
    expect(second.commissionAmount).toBe(0);
    expect(second.netAmount).toBe(100);

    // Total commission count remains 1
    const commissionCount = await prisma.commission.count({ where: { cycleId: cycle.id } });
    expect(commissionCount).toBe(1);
  });

  it("maintains correct balance after two withdrawals", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "SW2");
    await recordContribution(account.id, cycle.id, 500, adminId);

    await processWithdrawal(account.id, cycle.id, 100, adminId);
    await processWithdrawal(account.id, cycle.id, 100, adminId);

    // Balance = 500 - 50 (commission) - 100 - 100 = 250
    const balance = await calculateCycleBalance(cycle.id);
    expect(balance.balance).toBe(250);
  });
});

// ============================================================
// NEW CYCLE — COMMISSION RESET
// ============================================================

describe("New cycle commission reset", () => {
  it("resets commission eligibility on new cycle", async () => {
    const { account, cycle: cycle1 } = await createTestCustomer(adminId, 50, "NC1");
    await recordContribution(account.id, cycle1.id, 250, adminId);

    // First withdrawal in cycle 1 — commission charged
    const first = await processWithdrawal(account.id, cycle1.id, 100, adminId);
    expect(first.commissionAmount).toBe(50);

    // Create cycle 2
    const now = new Date();
    const cycle2 = await prisma.susuCycle.create({
      data: {
        accountId: account.id,
        cycleNumber: 2,
        startDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 31),
        dailyContribution: 50,
        status: "active",
        commissionCharged: false,
      },
    });

    await recordContribution(account.id, cycle2.id, 250, adminId);

    // First withdrawal in cycle 2 — commission charged again
    const second = await processWithdrawal(account.id, cycle2.id, 100, adminId);
    expect(second.commissionAmount).toBe(50);

    // Total commissions across both cycles = 2
    const totalCommissions = await prisma.commission.count({ where: { accountId: account.id } });
    expect(totalCommissions).toBe(2);
  });
});

// ============================================================
// PARTIAL WITHDRAWAL
// ============================================================

describe("Partial withdrawal", () => {
  it("deducts commission separately from withdrawal amount", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "PW1");
    // 10 days = GH₵500
    await recordContribution(account.id, cycle.id, 500, adminId);

    // Withdraw GH₵200 — commission GH₵50 is separate
    const result = await processWithdrawal(account.id, cycle.id, 200, adminId);

    expect(result.commissionAmount).toBe(50);
    expect(result.netAmount).toBe(200);
    expect(result.remainingBalance).toBe(250);

    // Independent check: 500 - 50 - 200 = 250
    const balance = await calculateCycleBalance(cycle.id);
    expect(balance.balance).toBe(250);
  });

  it("customer receives full requested amount when valid", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "PW2");
    await recordContribution(account.id, cycle.id, 250, adminId);

    const result = await processWithdrawal(account.id, cycle.id, 200, adminId);
    expect(result.netAmount).toBe(200);
  });
});

// ============================================================
// MULTI-DAY ALLOCATION
// ============================================================

describe("Multi-day allocation", () => {
  it("allocates GH₵700 across exactly 14 days at GH₵50/day", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "MA1");
    const { daysAllocated, allocatedAmount } = await recordContribution(account.id, cycle.id, 700, adminId);

    expect(daysAllocated).toBe(14);
    expect(allocatedAmount).toBe(700);

    // Verify allocation records
    const allocations = await prisma.contributionAllocation.findMany({
      where: { contribution: { cycleId: cycle.id } },
    });
    expect(allocations).toHaveLength(14);

    // Verify days 1-14 are allocated
    const allocatedDays = allocations.map((a) => a.cycleDay).sort((a, b) => a - b);
    expect(allocatedDays).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("does not double-allocate days across multiple contributions", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "MA2");

    // First contribution: GH₵100 = 2 days
    await recordContribution(account.id, cycle.id, 100, adminId);
    // Second contribution: GH₵100 = 2 days (should allocate days 3-4, not 1-2)
    await recordContribution(account.id, cycle.id, 100, adminId);

    const allocations = await prisma.contributionAllocation.findMany({
      where: { contribution: { cycleId: cycle.id } },
    });
    expect(allocations).toHaveLength(4);
    const allocatedDays = allocations.map((a) => a.cycleDay).sort((a, b) => a - b);
    expect(allocatedDays).toEqual([1, 2, 3, 4]);
  });
});

// ============================================================
// REMAINDER CREDIT
// ============================================================

describe("Remainder credit", () => {
  it("GH₵725 at GH₵50/day allocates 14 days, GH₵25 unallocated", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "RC1");
    const { daysAllocated, allocatedAmount, unallocatedAmount } = await recordContribution(
      account.id,
      cycle.id,
      725,
      adminId
    );

    expect(daysAllocated).toBe(14);
    expect(allocatedAmount).toBe(700);
    expect(unallocatedAmount).toBe(25);

    // Verify exactly 14 allocation records (not 15)
    const allocations = await prisma.contributionAllocation.findMany({
      where: { contribution: { cycleId: cycle.id } },
    });
    expect(allocations).toHaveLength(14);

    // The GH₵25 remains as contribution amount (not lost, not consumed)
    const contribution = await prisma.contribution.findFirst({
      where: { cycleId: cycle.id },
    });
    expect(Number(contribution!.amount)).toBe(725);
  });

  it("remainder does not silently disappear from the ledger", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "RC2");
    await recordContribution(account.id, cycle.id, 725, adminId);

    // Gross contributions = GH₵725 (the full amount is recorded)
    const gross = await prisma.contribution.aggregate({
      where: { cycleId: cycle.id },
      _sum: { amount: true },
    });
    expect(Number(gross._sum.amount)).toBe(725);

    // But only 14 days worth (GH₵700) is allocated
    const allocated = await prisma.contributionAllocation.aggregate({
      where: { contribution: { cycleId: cycle.id } },
      _sum: { amount: true },
    });
    expect(Number(allocated._sum.amount)).toBe(700);
  });
});

// ============================================================
// INSUFFICIENT WITHDRAWAL
// ============================================================

describe("Insufficient withdrawal", () => {
  it("rejects withdrawal exceeding available balance", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "IW1");
    await recordContribution(account.id, cycle.id, 100, adminId); // 2 days = GH₵100

    await expect(
      processWithdrawal(account.id, cycle.id, 200, adminId)
    ).rejects.toThrow("Insufficient balance");
  });

  it("rejects withdrawal when only commission amount is available", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "IW2");
    await recordContribution(account.id, cycle.id, 50, adminId); // 1 day = GH₵50

    // Available after commission: 50 - 50 = 0
    await expect(
      processWithdrawal(account.id, cycle.id, 1, adminId)
    ).rejects.toThrow("Insufficient balance");
  });
});

// ============================================================
// IDEMPOTENCY
// ============================================================

describe("Idempotency", () => {
  it("prevents duplicate contribution with same referenceId", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "ID1");
    const referenceId = "CON-IDEMPOTENCY-UNIQUE-001";

    await prisma.contribution.create({
      data: {
        accountId: account.id,
        cycleId: cycle.id,
        amount: 50,
        collectionDate: new Date(),
        channel: "direct_office",
        recordedById: adminId,
        referenceId,
      },
    });

    await expect(
      prisma.contribution.create({
        data: {
          accountId: account.id,
          cycleId: cycle.id,
          amount: 50,
          collectionDate: new Date(),
          channel: "direct_office",
          recordedById: adminId,
          referenceId,
        },
      })
    ).rejects.toThrow();
  });

  it("prevents duplicate withdrawal with same referenceId", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "ID2");
    await recordContribution(account.id, cycle.id, 250, adminId);

    const referenceId = "WDR-IDEMPOTENCY-UNIQUE-001";
    await prisma.withdrawal.create({
      data: {
        accountId: account.id,
        cycleId: cycle.id,
        requestedAmount: 100,
        commissionAmount: 50,
        netAmount: 100,
        remainingBalance: 100,
        status: "completed",
        authorizedById: adminId,
        referenceId,
      },
    });

    await expect(
      prisma.withdrawal.create({
        data: {
          accountId: account.id,
          cycleId: cycle.id,
          requestedAmount: 100,
          commissionAmount: 50,
          netAmount: 100,
          remainingBalance: 100,
          status: "completed",
          authorizedById: adminId,
          referenceId,
        },
      })
    ).rejects.toThrow();
  });

  it("prevents duplicate remittance with same referenceId", async () => {
    const referenceId = "REM-IDEMPOTENCY-UNIQUE-001";

    await prisma.collector.create({
      data: { userId: adminId, status: "active" },
    });
    const collector = await prisma.collector.findFirst({ where: { userId: adminId } });

    await prisma.collectorRemittance.create({
      data: {
        collectorId: collector!.id,
        expectedAmount: 100,
        remittedAmount: 100,
        variance: 0,
        status: "reconciled",
        recordedById: adminId,
        referenceId,
      },
    });

    await expect(
      prisma.collectorRemittance.create({
        data: {
          collectorId: collector!.id,
          expectedAmount: 100,
          remittedAmount: 100,
          variance: 0,
          status: "reconciled",
          recordedById: adminId,
          referenceId,
        },
      })
    ).rejects.toThrow();
  });
});

// ============================================================
// CARD FEE SEPARATION
// ============================================================

describe("Card fee", () => {
  it("records GH₵10 card fee separate from contributions", async () => {
    const { account } = await createTestCustomer(adminId, 50, "CF1");

    const cardFees = await prisma.cardFee.findMany({ where: { accountId: account.id } });
    expect(cardFees).toHaveLength(1);
    expect(Number(cardFees[0].amount)).toBe(10);
  });

  it("card fee does not appear in contribution totals", async () => {
    const { account } = await createTestCustomer(adminId, 50, "CF2");

    const totalContributions = await prisma.contribution.aggregate({
      where: { accountId: account.id },
      _sum: { amount: true },
    });
    expect(Number(totalContributions._sum.amount || 0)).toBe(0);
  });
});

// ============================================================
// FINANCIAL INVARIANTS
// ============================================================

describe("Financial invariants", () => {
  it("remaining savings = gross - commissions - withdrawals (simple case)", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "FI1");
    await recordContribution(account.id, cycle.id, 500, adminId);

    await processWithdrawal(account.id, cycle.id, 200, adminId);

    const balance = await calculateCycleBalance(cycle.id);
    // 500 - 50 (commission) - 200 (withdrawal) = 250
    expect(balance.gross).toBe(500);
    expect(balance.commissions).toBe(50);
    expect(balance.withdrawn).toBe(200);
    expect(balance.balance).toBe(250);
  });

  it("remaining savings after multiple withdrawals", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "FI2");
    await recordContribution(account.id, cycle.id, 1000, adminId);

    await processWithdrawal(account.id, cycle.id, 200, adminId);
    await processWithdrawal(account.id, cycle.id, 200, adminId);
    await processWithdrawal(account.id, cycle.id, 200, adminId);

    const balance = await calculateCycleBalance(cycle.id);
    // 1000 - 50 (commission) - 200 - 200 - 200 = 350
    expect(balance.balance).toBe(350);
  });

  it("full withdrawal leaves zero balance", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "FI3");
    await recordContribution(account.id, cycle.id, 250, adminId);

    // Available: 250 - 50 (commission) = 200
    await processWithdrawal(account.id, cycle.id, 200, adminId);

    const balance = await calculateCycleBalance(cycle.id);
    expect(balance.balance).toBe(0);
  });

  it("balance is consistent with remainingBalance field on withdrawal", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "FI4");
    await recordContribution(account.id, cycle.id, 500, adminId);

    const result = await processWithdrawal(account.id, cycle.id, 200, adminId);

    const balance = await calculateCycleBalance(cycle.id);
    expect(balance.balance).toBe(result.remainingBalance);
  });

  it("accounting equation holds across many operations", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "FI5");

    // Multiple contributions
    await recordContribution(account.id, cycle.id, 200, adminId);
    await recordContribution(account.id, cycle.id, 300, adminId);

    // Multiple withdrawals
    await processWithdrawal(account.id, cycle.id, 100, adminId);
    await processWithdrawal(account.id, cycle.id, 100, adminId);

    const balance = await calculateCycleBalance(cycle.id);
    // Gross: 500, Commission: 50, Withdrawn: 200, Balance: 250
    expect(balance.gross - balance.commissions - balance.withdrawn).toBe(balance.balance);
    expect(balance.balance).toBe(250);
  });
});

// ============================================================
// CONCURRENCY SAFETY
// ============================================================

describe("Concurrency safety", () => {
  it("two sequential contributions allocate to different days", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "CONC1");

    // Submit two contributions sequentially (as the application does)
    await recordContribution(account.id, cycle.id, 100, adminId);
    await recordContribution(account.id, cycle.id, 100, adminId);

    // Should have 4 allocations (2 days × 2 contributions, days 1-4)
    const allocations = await prisma.contributionAllocation.findMany({
      where: { contribution: { cycleId: cycle.id } },
    });
    expect(allocations).toHaveLength(4);

    // No duplicate cycle days (each day covered only once)
    const cycleDays = allocations.map((a) => a.cycleDay);
    const uniqueDays = new Set(cycleDays);
    expect(uniqueDays.size).toBe(cycleDays.length);
  });

  it("duplicate idempotency references are rejected", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "CONC2");
    const referenceId = "CON-SAME-REF";

    const first = prisma.contribution.create({
      data: {
        accountId: account.id,
        cycleId: cycle.id,
        amount: 50,
        collectionDate: new Date(),
        channel: "direct_office",
        recordedById: adminId,
        referenceId,
      },
    });

    const second = prisma.contribution.create({
      data: {
        accountId: account.id,
        cycleId: cycle.id,
        amount: 50,
        collectionDate: new Date(),
        channel: "direct_office",
        recordedById: adminId,
        referenceId,
      },
    });

    const results = await Promise.allSettled([first, second]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
  });
});

// ============================================================
// DAILY CONTRIBUTION VARIATIONS
// ============================================================

describe("Different contribution rates", () => {
  it("GH₵1/day customer: 5 days contribution, full withdrawal", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 1, "VAR1");
    await recordContribution(account.id, cycle.id, 5, adminId);

    const result = await processWithdrawal(account.id, cycle.id, 4, adminId);
    expect(result.commissionAmount).toBe(1);
    expect(result.netAmount).toBe(4);
    expect(result.remainingBalance).toBe(0);
  });

  it("GH₵100/day customer: 3 days contribution, partial withdrawal", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 100, "VAR2");
    await recordContribution(account.id, cycle.id, 300, adminId);

    const result = await processWithdrawal(account.id, cycle.id, 150, adminId);
    expect(result.commissionAmount).toBe(100);
    expect(result.netAmount).toBe(150);
    expect(result.remainingBalance).toBe(50);

    // Verify: 300 - 100 - 150 = 50
    const balance = await calculateCycleBalance(cycle.id);
    expect(balance.balance).toBe(50);
  });

  it("GH₵1,000/day customer: 5 days contribution, full withdrawal after commission", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 1000, "VAR3");
    await recordContribution(account.id, cycle.id, 5000, adminId);

    const result = await processWithdrawal(account.id, cycle.id, 4000, adminId);
    expect(result.commissionAmount).toBe(1000);
    expect(result.netAmount).toBe(4000);
    expect(result.remainingBalance).toBe(0);
  });
});

// ============================================================
// EDGE CASES
// ============================================================

describe("Edge cases", () => {
  it("contribution smaller than one day creates no allocations", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "EDGE1");
    const { daysAllocated, unallocatedAmount } = await recordContribution(
      account.id,
      cycle.id,
      25,
      adminId
    );

    expect(daysAllocated).toBe(0);
    expect(unallocatedAmount).toBe(25);
  });

  it("exact daily contribution allocates exactly 1 day", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "EDGE2");
    const { daysAllocated, allocatedAmount } = await recordContribution(
      account.id,
      cycle.id,
      50,
      adminId
    );

    expect(daysAllocated).toBe(1);
    expect(allocatedAmount).toBe(50);
  });

  it("large contribution allocates up to 31 days", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "EDGE3");
    const { daysAllocated } = await recordContribution(account.id, cycle.id, 31 * 50, adminId);

    expect(daysAllocated).toBe(31);
  });

  it("contribution exceeding 31 days caps at 31", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "EDGE4");
    const { daysAllocated, unallocatedAmount } = await recordContribution(
      account.id,
      cycle.id,
      40 * 50, // 40 days worth, but cycle is 31 days
      adminId
    );

    expect(daysAllocated).toBe(31);
    expect(unallocatedAmount).toBe(9 * 50); // 9 days unallocated
  });
});
