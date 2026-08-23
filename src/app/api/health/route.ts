import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    app: "bik-prestige",
    env: process.env.APP_ENV || process.env.NODE_ENV || "unknown",
  });
}
