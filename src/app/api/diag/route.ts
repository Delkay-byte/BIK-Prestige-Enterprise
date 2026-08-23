import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;

    // Check admin user (no secrets exposed)
    const adminUser = await (prisma as any).user.findUnique({
      where: { email: "admin@bikprestige.com" },
      select: { id: true, role: true, status: true, passwordHash: true },
    });

    return NextResponse.json({
      database: "connected",
      adminExists: !!adminUser,
      adminRole: adminUser?.role || null,
      adminStatus: adminUser?.status || null,
      adminHasPasswordHash: !!adminUser?.passwordHash,
      passwordHashLength: adminUser?.passwordHash?.length || 0,
    });
  } catch (error: any) {
    return NextResponse.json({
      database: "error",
      error: error?.message?.substring(0, 200) || "unknown",
    }, { status: 500 });
  }
}
