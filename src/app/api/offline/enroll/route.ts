import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAnyAuthUser } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

/**
 * POST /api/offline/enroll
 * Register a device for offline operation.
 * Idempotent — re-enrolling the same device is safe.
 */
export async function POST(request: NextRequest) {
  try {
    const { deviceId, module: mod, deviceName } = await request.json();

    if (!deviceId || !mod) {
      return NextResponse.json({ error: "Missing deviceId or module" }, { status: 400 });
    }
    if (mod !== "momo" && mod !== "susu") {
      return NextResponse.json({ error: "Invalid module" }, { status: 400 });
    }

    const user = await getAnyAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Upsert device enrollment
    const device = await db.deviceEnrollment.upsert({
      where: { deviceId },
      create: {
        userId: user.userId,
        deviceId,
        deviceName: deviceName || null,
        module: mod,
        status: "active",
      },
      update: {
        status: "active",
        lastSyncAt: new Date(),
      },
    });

    await createAuditLog({
      userId: user.userId,
      action: "offline.device_enrolled",
      entityType: "device",
      entityId: device.id,
      details: { deviceId, module: mod },
    });

    return NextResponse.json({ success: true, deviceId: device.deviceId });
  } catch (err) {
    console.error("[offline-enroll]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/offline/enroll
 * Check if a device is enrolled.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");

  if (!deviceId) {
    return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
  }

  const user = await getAnyAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const device = await db.deviceEnrollment.findFirst({
    where: { deviceId, userId: user.userId, status: "active" },
    select: { deviceId: true, lastSyncAt: true, createdAt: true },
  });

  return NextResponse.json({ enrolled: !!device, device });
}
