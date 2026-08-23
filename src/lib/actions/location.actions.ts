"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { locationSchema } from "@/lib/validations";
import { createAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export interface ActionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

export async function createLocation(formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const raw = {
    name: (formData.get("name") as string)?.trim(),
    code: (formData.get("code") as string)?.trim().toUpperCase(),
    description: (formData.get("description") as string)?.trim() || undefined,
    address: (formData.get("address") as string)?.trim() || undefined,
    contactPhone: (formData.get("contactPhone") as string)?.trim() || undefined,
    status: (formData.get("status") as string) || "active",
  };

  const validated = locationSchema.safeParse(raw);
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0].message };
  }

  const existing = await db.location.findUnique({ where: { code: validated.data.code } });
  if (existing) {
    return { success: false, error: "A location with this code already exists" };
  }

  const location = await db.location.create({ data: validated.data });

  await createAuditLog({
    userId: admin.userId,
    action: "location.created",
    entityType: "location",
    entityId: location.id,
    details: { name: location.name, code: location.code },
  });

  revalidatePath("/admin/locations");
  revalidatePath("/admin/dashboard");
  return { success: true, data: location };
}

export async function updateLocation(locationId: string, formData: FormData): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const raw = {
    name: (formData.get("name") as string)?.trim(),
    code: (formData.get("code") as string)?.trim().toUpperCase(),
    description: (formData.get("description") as string)?.trim() || undefined,
    address: (formData.get("address") as string)?.trim() || undefined,
    contactPhone: (formData.get("contactPhone") as string)?.trim() || undefined,
    status: (formData.get("status") as string) || "active",
  };

  const validated = locationSchema.safeParse(raw);
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0].message };
  }

  const existing = await db.location.findFirst({
    where: { code: validated.data.code, id: { not: locationId } },
  });
  if (existing) {
    return { success: false, error: "A location with this code already exists" };
  }

  const location = await db.location.update({ where: { id: locationId }, data: validated.data });

  await createAuditLog({
    userId: admin.userId,
    action: "location.updated",
    entityType: "location",
    entityId: locationId,
    details: { name: location.name },
  });

  revalidatePath("/admin/locations");
  revalidatePath(`/admin/locations/${locationId}`);
  revalidatePath("/admin/dashboard");
  return { success: true, data: location };
}

export async function toggleLocationStatus(locationId: string, newStatus: string): Promise<ActionResponse> {
  const admin = await requireAdmin();

  const location = await db.location.update({
    where: { id: locationId },
    data: { status: newStatus },
  });

  await createAuditLog({
    userId: admin.userId,
    action: `location.${newStatus === "active" ? "activated" : "deactivated"}`,
    entityType: "location",
    entityId: locationId,
    details: { name: location.name, status: newStatus },
  });

  revalidatePath("/admin/locations");
  revalidatePath(`/admin/locations/${locationId}`);
  revalidatePath("/admin/dashboard");
  return { success: true, data: location };
}

export async function getLocations() {
  await requireAdmin();
  return db.location.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, dailyAccounts: true } } },
  });
}

export async function getActiveLocations() {
  return db.location.findMany({
    where: { status: "active" },
    orderBy: { name: "asc" },
  });
}

export async function getLocationById(id: string) {
  return db.location.findUnique({
    where: { id },
    include: {
      users: {
        select: { id: true, fullName: true, email: true, role: true, status: true },
      },
    },
  });
}
