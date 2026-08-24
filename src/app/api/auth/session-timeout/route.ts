import { NextResponse } from "next/server";
import { getAnyAuthUser } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

/**
 * POST /api/auth/session-timeout — called by the client when it detects
 * a session expiry (inactivity, background, or absolute).  Logs the event
 * for the audit trail.
 */
export async function POST(request: Request) {
  const user = await getAnyAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* default to empty */
  }

  const reason = body.reason || "unknown";
  const actionMap: Record<string, string> = {
    inactivity: "auth.session_timeout",
    background: "auth.session_background",
    absolute: "auth.session_absolute",
  };

  await createAuditLog({
    userId: user.userId,
    action: actionMap[reason] || "auth.session_timeout",
    entityType: "session",
    entityId: user.userId,
    details: { reason },
  });

  return NextResponse.json({ success: true });
}
