import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getMomoSession, getSusuSession } from "@/lib/auth";

/**
 * Return the authenticated user for the given module.
 * Accepts ?module=admin|susu so dashboards don't accidentally read
 * another role's session when multiple cookies are present.
 */
export async function GET(request: NextRequest) {
  const requestedModule = request.nextUrl.searchParams.get("module");

  let user = null;
  if (requestedModule === "admin") {
    user = await getAdminSession();
  } else if (requestedModule === "momo") {
    user = await getMomoSession();
  } else if (requestedModule === "susu") {
    user = await getSusuSession();
  } else {
    // Fallback: try all, but prefer the most-specific match
    user = (await getMomoSession()) ?? (await getSusuSession()) ?? (await getAdminSession());
  }

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json(user);
}
