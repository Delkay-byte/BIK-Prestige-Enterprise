import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const [
      users, locations, customers, susuCycles, susuAccounts,
      cardFees, dailyAccounts, collectors, assignments,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.location.count(),
      prisma.customer.count(),
      prisma.susuCycle.count(),
      prisma.susuAccount.count(),
      prisma.cardFee.count(),
      prisma.dailyAccount.count(),
      prisma.collector.count(),
      prisma.collectorCustomerAssignment.count(),
    ]);

    const adminUser = await (prisma as any).user.findUnique({
      where: { email: "admin@bikprestige.com" },
      select: { id: true, role: true, status: true },
    });

    return NextResponse.json({
      database: "connected",
      rowCounts: { users, locations, customers, susuCycles, susuAccounts, cardFees, dailyAccounts, collectors, assignments },
      adminUser: adminUser ? { role: adminUser.role, status: adminUser.status } : null,
    });
  } catch (error: any) {
    return NextResponse.json({ database: "error", error: error?.message?.substring(0, 200) }, { status: 500 });
  }
}
