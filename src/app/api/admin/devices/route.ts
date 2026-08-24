import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

/**
 * GET /api/admin/devices
 * List all enrolled devices (admin only).
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const devices = await db.deviceEnrollment.findMany({
    include: {
      user: {
        select: { id: true, fullName: true, email: true, role: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ devices });
}

/**
 * PATCH /api/admin/devices
 * Revoke or reactivate a device.
 */
export async function PATCH(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { deviceId, action } = await request.json();

  if (!deviceId || !action) {
    return NextResponse.json({ error: "Missing deviceId or action" }, { status: 400 });
  }

  if (action !== "revoke" && action !== "activate") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const device = await db.deviceEnrollment.findFirst({
    where: { deviceId },
  });

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const newStatus = action === "revoke" ? "revoked" : "active";

  await db.deviceEnrollment.update({
    where: { id: device.id },
    data: { status: newStatus },
  });

  // Audit the revocation/activation
  const { createAuditLog } = await import("@/lib/audit");
  await createAuditLog({
    userId: admin.userId,
    action: action === "revoke" ? "offline.device_revoked" : "offline.device_activated",
    entityType: "device",
    entityId: device.id,
    details: {
      deviceId,
      targetUserId: device.userId,
      module: device.module,
      previousStatus: device.status,
      newStatus,
    },
  });

  return NextResponse.json({ success: true, status: newStatus });
}
