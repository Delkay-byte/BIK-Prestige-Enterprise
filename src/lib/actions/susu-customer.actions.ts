"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export interface ActionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

// Generate unique customer ID: BIK-C-XXXXXX
function generateCustomerId(counter: number): string {
  return `BIK-C-${String(counter).padStart(6, "0")}`;
}

// Generate unique account ID: BIK-S-XXXXXX
function generateAccountId(counter: number): string {
  return `BIK-S-${String(counter).padStart(6, "0")}`;
}

export async function createCustomer(formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const fullName = (formData.get("fullName") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || undefined;
  const address = (formData.get("address") as string)?.trim() || undefined;
  const dailyContribution = parseFloat(formData.get("dailyContribution") as string);
  const cardFee = parseFloat(formData.get("cardFee") as string) || 10;

  if (!fullName || fullName.length < 2) {
    return { success: false, error: "Full name must be at least 2 characters" };
  }
  if (!dailyContribution || dailyContribution <= 0) {
    return { success: false, error: "Daily contribution must be greater than 0" };
  }

  // Generate IDs
  const customerCount = await db.customer.count();
  const customerId = generateCustomerId(customerCount + 1);
  const accountId = generateAccountId(customerCount + 1);

  const customer = await db.customer.create({
    data: {
      customerId,
      fullName,
      phone,
      address,
      status: "active",
    },
  });

  const susuAccount = await db.susuAccount.create({
    data: {
      accountId,
      customerId: customer.id,
      dailyContribution,
      status: "active",
      cardCustody: "customer",
    },
  });

  // Record card fee
  await db.cardFee.create({
    data: {
      accountId: susuAccount.id,
      amount: cardFee,
      recordedById: admin.userId,
      notes: "Initial card purchase",
    },
  });

  // Create first cycle
  const now = new Date();
  const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const cycleEnd = new Date(now.getFullYear(), now.getMonth(), 31);

  await db.susuCycle.create({
    data: {
      accountId: susuAccount.id,
      cycleNumber: 1,
      startDate: cycleStart,
      endDate: cycleEnd,
      dailyContribution,
      status: "active",
      commissionCharged: false,
    },
  });

  await createAuditLog({
    userId: admin.userId,
    action: "susu.customer_created",
    entityType: "customer",
    entityId: customer.id,
    details: { customerId, fullName, dailyContribution },
  });

  revalidatePath("/susu/admin/customers");
  return { success: true, data: { customer, susuAccount } };
}

export async function updateCustomer(customerId: string, formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const fullName = (formData.get("fullName") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || undefined;
  const address = (formData.get("address") as string)?.trim() || undefined;
  const dailyContribution = parseFloat(formData.get("dailyContribution") as string);

  if (!fullName || fullName.length < 2) {
    return { success: false, error: "Full name must be at least 2 characters" };
  }

  const customer = await db.customer.update({
    where: { id: customerId },
    data: { fullName, phone, address },
  });

  // Update daily contribution on the account if provided
  if (dailyContribution && dailyContribution > 0) {
    await db.susuAccount.updateMany({
      where: { customerId, status: "active" },
      data: { dailyContribution },
    });
  }

  await createAuditLog({
    userId: admin.userId,
    action: "susu.customer_updated",
    entityType: "customer",
    entityId: customerId,
    details: { fullName },
  });

  revalidatePath("/susu/admin/customers");
  return { success: true, data: customer };
}

export async function toggleCustomerStatus(customerId: string, newStatus: string): Promise<ActionResponse> {
  const admin = await requireAdmin();

  await db.customer.update({
    where: { id: customerId },
    data: { status: newStatus },
  });

  await createAuditLog({
    userId: admin.userId,
    action: `susu.customer_${newStatus === "active" ? "activated" : "deactivated"}`,
    entityType: "customer",
    entityId: customerId,
  });

  revalidatePath("/susu/admin/customers");
  return { success: true };
}

export async function getCustomers(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  collectorId?: string;
}) {
  await requireAdmin();

  const page = params?.page || 1;
  const limit = params?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (params?.status) where.status = params.status;

  if (params?.search) {
    where.OR = [
      { fullName: { contains: params.search } },
      { customerId: { contains: params.search } },
      { phone: { contains: params.search } },
    ];
  }

  if (params?.collectorId) {
    where.assignments = {
      some: { collectorId: params.collectorId, active: true },
    };
  }

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: {
        accounts: {
          where: { status: "active" },
          include: {
            cycles: { where: { status: "active" }, take: 1 },
          },
        },
        assignments: {
          where: { active: true },
          include: { collector: { include: { user: { select: { fullName: true } } } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.customer.count({ where }),
  ]);

  return {
    customers,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getCustomerById(id: string) {
  await requireAdmin();

  return db.customer.findUnique({
    where: { id },
    include: {
      accounts: {
        include: {
          cycles: {
            orderBy: { cycleNumber: "desc" },
            include: {
              contributions: {
                orderBy: { collectionDate: "asc" },
                include: { allocations: true },
              },
              withdrawals: { orderBy: { createdAt: "desc" } },
              commissions: true,
            },
          },
          cardFees: true,
        },
      },
      assignments: {
        include: { collector: { include: { user: { select: { fullName: true, id: true } } } } },
        orderBy: { assignedAt: "desc" },
      },
    },
  });
}

export async function reassignCustomer(params: {
  customerId: string;
  accountId: string;
  newCollectorId: string;
}): Promise<ActionResponse> {
  const admin = await requireAdmin();
  const { customerId, accountId, newCollectorId } = params;

  // 1. Verify customer exists
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    return { success: false, error: "Customer not found" };
  }

  // 2. Verify new collector exists and is active
  const newCollector = await db.collector.findUnique({
    where: { id: newCollectorId },
    include: { user: { select: { fullName: true, status: true } } },
  });
  if (!newCollector || newCollector.user.status !== "active") {
    return { success: false, error: "Selected collector is not available" };
  }

  // 3. Find current active assignment
  const currentAssignment = await db.collectorCustomerAssignment.findFirst({
    where: { customerId, accountId, active: true },
    include: { collector: { include: { user: { select: { fullName: true } } } } },
  });

  // 4. Prevent no-op reassignment
  if (currentAssignment && currentAssignment.collectorId === newCollectorId) {
    return { success: false, error: "Customer is already assigned to this collector" };
  }

  const previousCollectorName = currentAssignment?.collector?.user?.fullName || "None";

  // 5. Atomic reassignment
  await db.$transaction(async (tx) => {
    // Deactivate old assignment
    if (currentAssignment) {
      await tx.collectorCustomerAssignment.update({
        where: { id: currentAssignment.id },
        data: { active: false, unassignedAt: new Date() },
      });
    }

    // Check if new collector already has an assignment for this account
    const existingNew = await tx.collectorCustomerAssignment.findUnique({
      where: { collectorId_accountId: { collectorId: newCollectorId, accountId } },
    });

    if (existingNew) {
      // Reactivate existing assignment
      await tx.collectorCustomerAssignment.update({
        where: { id: existingNew.id },
        data: { active: true, unassignedAt: null },
      });
    } else {
      // Create new assignment
      await tx.collectorCustomerAssignment.create({
        data: {
          collectorId: newCollectorId,
          customerId,
          accountId,
          active: true,
        },
      });
    }
  });

  // 6. Audit
  await createAuditLog({
    userId: admin.userId,
    action: "susu.customer_reassigned",
    entityType: "customer",
    entityId: customerId,
    details: {
      customerId: customer.customerId,
      customerName: customer.fullName,
      previousCollector: previousCollectorName,
      newCollector: newCollector.user.fullName,
    },
  });

  revalidatePath("/susu/admin/customers");
  revalidatePath(`/susu/admin/customers/${customerId}`);
  revalidatePath("/susu/admin/collectors");
  return { success: true };
}

export async function searchCustomers(query: string) {
  await requireAuth();

  if (!query || query.length < 2) return [];

  return db.customer.findMany({
    where: {
      OR: [
        { fullName: { contains: query } },
        { customerId: { contains: query } },
        { phone: { contains: query } },
      ],
      status: "active",
    },
    include: {
      accounts: {
        where: { status: "active" },
        include: {
          cycles: { where: { status: "active" }, take: 1 },
        },
      },
    },
    take: 10,
  });
}
