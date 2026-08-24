import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAnyAuthUser } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { randomBytes } from "crypto";

/**
 * POST /api/offline/sync-contribution
 *
 * Receives an offline contribution transaction and processes it
 * idempotently. If the idempotencyKey already exists, returns
 * the original result without creating a duplicate.
 *
 * The server validates:
 * - Device enrollment
 * - User authentication
 * - Collector authorization
 * - Customer/account existence
 * - Amount > 0
 * - Active cycle
 * - Idempotency (dedup by key)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idempotencyKey, payload, deviceId } = body;

    if (!idempotencyKey || !payload || !deviceId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 1. Authenticate
    const user = await getAnyAuthUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // 2. Verify device enrollment
    const device = await db.deviceEnrollment.findFirst({
      where: { deviceId, userId: user.userId, status: "active" },
    });
    if (!device) {
      return NextResponse.json(
        { success: false, error: "Device not enrolled or revoked" },
        { status: 403 }
      );
    }

    // 3. Check idempotency — return existing result if already processed
    const existing = await db.offlineTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing && existing.status === "synced") {
      return NextResponse.json({
        success: true,
        serverResult: existing.serverResult ? JSON.parse(existing.serverResult) : null,
        message: "Transaction already processed",
      });
    }

    // 4. Parse the transaction payload
    let txPayload: {
      accountId: string;
      amount: number;
      channel: string;
      notes?: string;
      collectorId?: string;
    };
    try {
      txPayload = JSON.parse(payload);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid transaction payload" },
        { status: 400 }
      );
    }

    const { accountId, amount, channel, notes } = txPayload;

    // 5. Validate amount
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid amount" },
        { status: 400 }
      );
    }

    // 6. Fetch and validate account
    const account = await db.susuAccount.findUnique({
      where: { id: accountId },
      include: {
        cycles: { where: { status: "active" }, take: 1 },
        customer: true,
      },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }
    if (account.status !== "active") {
      return NextResponse.json(
        { success: false, error: "Account is not active" },
        { status: 400 }
      );
    }
    if (!account.cycles.length) {
      return NextResponse.json(
        { success: false, error: "No active cycle" },
        { status: 400 }
      );
    }

    // 7. Verify collector authorization
    let effectiveCollectorId: string | null = null;
    if (channel === "collector") {
      if (user.role !== "collector") {
        return NextResponse.json(
          { success: false, error: "Not authorized for collector channel" },
          { status: 403 }
        );
      }
      const userCollector = await db.collector.findUnique({
        where: { userId: user.userId },
      });
      if (!userCollector) {
        return NextResponse.json(
          { success: false, error: "Collector record not found" },
          { status: 403 }
        );
      }
      effectiveCollectorId = userCollector.id;

      // Verify assignment
      const assignment = await db.collectorCustomerAssignment.findFirst({
        where: {
          collectorId: effectiveCollectorId,
          accountId,
          active: true,
        },
      });
      if (!assignment) {
        return NextResponse.json(
          { success: false, error: "Customer not assigned to this collector" },
          { status: 403 }
        );
      }
    }

    const cycle = account.cycles[0];
    const dailyContribution = Number(cycle.dailyContribution);

    // 8. Create contribution + allocations in a transaction
    const result = await db.$transaction(async (tx) => {
      const contribution = await tx.contribution.create({
        data: {
          accountId,
          cycleId: cycle.id,
          amount,
          collectionDate: new Date(),
          channel,
          collectorId: effectiveCollectorId,
          recordedById: user.userId,
          referenceId: idempotencyKey,
          notes,
        },
      });

      // Calculate days covered
      const daysCovered = Math.floor(amount / dailyContribution);
      const allocatedAmount = daysCovered * dailyContribution;

      // Find paid days
      const existingAllocations = await tx.contributionAllocation.findMany({
        where: { contribution: { cycleId: cycle.id } },
      });
      const paidDays = new Set(existingAllocations.map((a) => a.cycleDay));

      // Allocate to unpaid days
      const allocations: { contributionId: string; cycleDay: number; amount: number }[] = [];
      let daysAllocated = 0;
      for (let day = 1; day <= 31 && daysAllocated < daysCovered; day++) {
        if (!paidDays.has(day)) {
          allocations.push({ contributionId: contribution.id, cycleDay: day, amount: dailyContribution });
          daysAllocated++;
        }
      }
      if (allocations.length > 0) {
        await tx.contributionAllocation.createMany({ data: allocations });
      }

      return { contributionId: contribution.id, daysAllocated, allocatedAmount: Number(allocatedAmount) };
    });

    // 9. Record the offline transaction as synced
    await db.offlineTransaction.upsert({
      where: { idempotencyKey },
      create: {
        deviceId,
        userId: user.userId,
        type: "contribution",
        idempotencyKey,
        payload: JSON.stringify(txPayload),
        status: "synced",
        retryCount: 0,
        maxRetries: 5,
        localTimestamp: new Date(),
        syncedAt: new Date(),
        serverResult: JSON.stringify(result),
      },
      update: {
        status: "synced",
        syncedAt: new Date(),
        serverResult: JSON.stringify(result),
      },
    });

    // 10. Update device last sync time
    await db.deviceEnrollment.update({
      where: { id: device.id },
      data: { lastSyncAt: new Date() },
    });

    // 11. Audit
    await createAuditLog({
      userId: user.userId,
      action: "susu.contribution_recorded",
      entityType: "contribution",
      entityId: result.contributionId,
      details: {
        accountId,
        amount,
        channel,
        daysAllocated: result.daysAllocated,
        idempotencyKey,
        source: "offline_sync",
        deviceId,
      },
    });

    return NextResponse.json({
      success: true,
      contributionId: result.contributionId,
      daysAllocated: result.daysAllocated,
      allocatedAmount: result.allocatedAmount,
    });
  } catch (err) {
    console.error("[offline-sync]", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
