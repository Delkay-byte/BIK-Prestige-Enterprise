/**
 * BIK Prestige — PostgreSQL Susu Tests
 * 
 * Runs the same financial invariant tests against real PostgreSQL
 * to verify the application works correctly in production-like environment.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma, cleanDatabase, createTestAdmin, createTestCustomer, recordContribution, processWithdrawal, calculateCycleBalance } from "./pg-setup";

let adminId: string;

beforeEach(async () => {
  await cleanDatabase();
  const admin = await createTestAdmin();
  adminId = admin.id;
});

describe("PostgreSQL: Commission", () => {
  it("GH₵1/day → GH₵1 commission", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 1, "C1");
    await recordContribution(account.id, cycle.id, 5, adminId);
    const r = await processWithdrawal(account.id, cycle.id, 4, adminId);
    expect(r.commissionAmount).toBe(1);
  });

  it("GH₵50/day → GH₵50 commission", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "C50");
    await recordContribution(account.id, cycle.id, 250, adminId);
    const r = await processWithdrawal(account.id, cycle.id, 200, adminId);
    expect(r.commissionAmount).toBe(50);
  });

  it("GH₵1,000/day → GH₵1,000 commission", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 1000, "C1K");
    await recordContribution(account.id, cycle.id, 2000, adminId);
    const r = await processWithdrawal(account.id, cycle.id, 1000, adminId);
    expect(r.commissionAmount).toBe(1000);
  });
});

describe("PostgreSQL: First/Second withdrawal", () => {
  it("charges commission exactly once", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "FW1");
    await recordContribution(account.id, cycle.id, 500, adminId);
    const w1 = await processWithdrawal(account.id, cycle.id, 100, adminId);
    expect(w1.commissionAmount).toBe(50);
    const w2 = await processWithdrawal(account.id, cycle.id, 100, adminId);
    expect(w2.commissionAmount).toBe(0);
    const commCount = await prisma.commission.count({ where: { cycleId: cycle.id } });
    expect(commCount).toBe(1);
  });
});

describe("PostgreSQL: Partial withdrawal", () => {
  it("500-50-200=250", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "PW1");
    await recordContribution(account.id, cycle.id, 500, adminId);
    const r = await processWithdrawal(account.id, cycle.id, 200, adminId);
    expect(r.commissionAmount).toBe(50);
    expect(r.netAmount).toBe(200);
    expect(r.remainingBalance).toBe(250);
  });
});

describe("PostgreSQL: Multi-day allocation", () => {
  it("GH₵700 / GH₵50 = 14 days", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "MA1");
    const r = await recordContribution(account.id, cycle.id, 700, adminId);
    expect(r.daysAllocated).toBe(14);
    expect(r.allocatedAmount).toBe(700);
  });

  it("GH₵725 / GH₵50 = 14 days + GH₵25 remainder", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "RC1");
    const r = await recordContribution(account.id, cycle.id, 725, adminId);
    expect(r.daysAllocated).toBe(14);
    expect(r.allocatedAmount).toBe(700);
    expect(r.unallocatedAmount).toBe(25);
  });
});

describe("PostgreSQL: Insufficient balance", () => {
  it("rejects withdrawal exceeding balance", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "IW1");
    await recordContribution(account.id, cycle.id, 100, adminId);
    await expect(processWithdrawal(account.id, cycle.id, 200, adminId)).rejects.toThrow("Insufficient");
  });
});

describe("PostgreSQL: Idempotency", () => {
  it("rejects duplicate referenceId", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "ID1");
    const ref = "CON-IDEMP-UNIQUE";
    await prisma.contribution.create({
      data: { accountId: account.id, cycleId: cycle.id, amount: 50, collectionDate: new Date(), channel: "direct_office", recordedById: adminId, referenceId: ref },
    });
    await expect(
      prisma.contribution.create({
        data: { accountId: account.id, cycleId: cycle.id, amount: 50, collectionDate: new Date(), channel: "direct_office", recordedById: adminId, referenceId: ref },
      })
    ).rejects.toThrow();
  });
});

describe("PostgreSQL: Financial invariants", () => {
  it("balance = gross - commissions - withdrawals", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "FI1");
    await recordContribution(account.id, cycle.id, 500, adminId);
    await processWithdrawal(account.id, cycle.id, 200, adminId);
    const bal = await calculateCycleBalance(cycle.id);
    expect(bal.balance).toBe(250); // 500-50-200
  });

  it("accounting equation holds", async () => {
    const { account, cycle } = await createTestCustomer(adminId, 50, "FI2");
    await recordContribution(account.id, cycle.id, 200, adminId);
    await recordContribution(account.id, cycle.id, 300, adminId);
    await processWithdrawal(account.id, cycle.id, 100, adminId);
    await processWithdrawal(account.id, cycle.id, 100, adminId);
    const bal = await calculateCycleBalance(cycle.id);
    expect(bal.gross - bal.commissions - bal.withdrawn).toBe(bal.balance);
    expect(bal.balance).toBe(250); // 500-50-200
  });
});

describe("PostgreSQL: New cycle commission reset", () => {
  it("resets on new cycle", async () => {
    const { account, cycle: c1 } = await createTestCustomer(adminId, 50, "NC1");
    await recordContribution(account.id, c1.id, 250, adminId);
    await processWithdrawal(account.id, c1.id, 100, adminId);
    const c2 = await prisma.susuCycle.create({
      data: { accountId: account.id, cycleNumber: 2, startDate: new Date(2026, 9, 1), endDate: new Date(2026, 9, 31), dailyContribution: 50, status: "active", commissionCharged: false },
    });
    await recordContribution(account.id, c2.id, 250, adminId);
    const w2 = await processWithdrawal(account.id, c2.id, 100, adminId);
    expect(w2.commissionAmount).toBe(50);
    const totalComm = await prisma.commission.count({ where: { accountId: account.id } });
    expect(totalComm).toBe(2);
  });
});
