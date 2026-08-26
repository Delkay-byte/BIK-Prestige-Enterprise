/**
 * BIK Prestige Enterprise — Unified Login Capability Tests
 *
 * Validates the CRITICAL security requirement that the browser-selected role
 * (the "requested workspace") is NEVER trusted as proof of access.  The server
 * must re-check the requested workspace against the account's actual
 * capabilities before issuing any session.
 *
 * Covers the security test matrix in the pilot spec:
 *  - Customer credentials + MoMo role  → denied
 *  - MoMo credentials + Susu role      → denied unless Susu enabled
 *  - Susu credentials + Customer role   → denied
 *  - Worker credentials + Customer role → denied
 *  - Admin credentials on shared login  → denied
 *  - Dual-role accounts can use either module they are enabled for
 */

import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { prisma, cleanDatabase } from "./setup";
import { resolveCustomerAuth, resolveStaffAuth } from "@/lib/actions/auth.actions";

const PASS = "Test1234!";

async function makeUser(overrides: {
  email: string;
  role: string;
  momoEnabled?: boolean;
  susuEnabled?: boolean;
}) {
  return prisma.user.create({
    data: {
      email: overrides.email,
      fullName: "Test User",
      role: overrides.role,
      status: "active",
      passwordHash: await bcrypt.hash(PASS, 12),
      momoEnabled: overrides.momoEnabled ?? false,
      susuEnabled: overrides.susuEnabled ?? false,
    },
  });
}

async function makeCustomer(identifier: string) {
  return prisma.customer.create({
    data: {
      customerId: identifier,
      fullName: "Test Customer",
      phone: "+233240000001",
      status: "active",
      portalEnabled: true,
      portalPasswordHash: await bcrypt.hash(PASS, 12),
    },
  });
}

beforeEach(async () => {
  await cleanDatabase();
});

describe("Unified login — capability enforcement", () => {
  it("MoMo-only user CANNOT open the Susu workspace", async () => {
    const user = await makeUser({
      email: "momo@bik.com",
      role: "worker",
      momoEnabled: true,
      susuEnabled: false,
    });

    const ok = await resolveStaffAuth(user.email, PASS, "momo");
    expect("payload" in ok).toBe(true);

    const denied = await resolveStaffAuth(user.email, PASS, "susu");
    expect("error" in denied).toBe(true);
  });

  it("Susu-only user CANNOT open the MoMo workspace", async () => {
    const user = await makeUser({
      email: "susu@bik.com",
      role: "collector",
      momoEnabled: false,
      susuEnabled: true,
    });

    const ok = await resolveStaffAuth(user.email, PASS, "susu");
    expect("payload" in ok).toBe(true);

    const denied = await resolveStaffAuth(user.email, PASS, "momo");
    expect("error" in denied).toBe(true);
  });

  it("Dual-role user CAN open both MoMo and Susu workspaces", async () => {
    const user = await makeUser({
      email: "dual@bik.com",
      role: "worker",
      momoEnabled: true,
      susuEnabled: true,
    });

    expect("payload" in (await resolveStaffAuth(user.email, PASS, "momo"))).toBe(true);
    expect("payload" in (await resolveStaffAuth(user.email, PASS, "susu"))).toBe(true);
  });

  it("Customer credentials CANNOT open the MoMo workspace", async () => {
    const customer = await makeCustomer("BIK-C-1001");
    // A customer record is not a staff user, so staff lookup must fail.
    const denied = await resolveStaffAuth(customer.customerId, PASS, "momo");
    expect("error" in denied).toBe(true);
    const deniedSusu = await resolveStaffAuth(customer.customerId, PASS, "susu");
    expect("error" in deniedSusu).toBe(true);
  });

  it("Worker credentials CANNOT open the Customer workspace", async () => {
    const user = await makeUser({
      email: "worker@bik.com",
      role: "worker",
      momoEnabled: true,
      susuEnabled: false,
    });
    // Staff are not customers → customer auth must fail.
    const denied = await resolveCustomerAuth(user.email, PASS);
    expect("error" in denied).toBe(true);
  });

  it("Admin credentials are rejected by the shared (non-admin) login", async () => {
    const admin = await makeUser({
      email: "admin@bik.com",
      role: "admin",
      momoEnabled: false,
      susuEnabled: false,
    });
    const deniedMomo = await resolveStaffAuth(admin.email, PASS, "momo");
    expect("error" in deniedMomo).toBe(true);
    const deniedSusu = await resolveStaffAuth(admin.email, PASS, "susu");
    expect("error" in deniedSusu).toBe(true);
  });

  it("Customer can sign in via the Customer workspace", async () => {
    const customer = await makeCustomer("BIK-C-2002");
    const result = await resolveCustomerAuth(customer.customerId, PASS);
    expect("payload" in result).toBe(true);
    if ("payload" in result) {
      expect(result.payload.role).toBe("customer");
      expect(result.payload.modules).toContain("customer");
    }
  });

  it("Wrong password is denied for every workspace", async () => {
    const user = await makeUser({
      email: "dual2@bik.com",
      role: "worker",
      momoEnabled: true,
      susuEnabled: true,
    });
    expect("error" in (await resolveStaffAuth(user.email, "wrong-password", "momo"))).toBe(true);
    expect("error" in (await resolveStaffAuth(user.email, "wrong-password", "susu"))).toBe(true);
  });

  it("Deactivated staff accounts are denied", async () => {
    const user = await prisma.user.create({
      data: {
        email: "inactive@bik.com",
        fullName: "Inactive",
        role: "worker",
        status: "inactive",
        passwordHash: await bcrypt.hash(PASS, 12),
        momoEnabled: true,
        susuEnabled: false,
      },
    });
    const denied = await resolveStaffAuth(user.email, PASS, "momo");
    expect("error" in denied).toBe(true);
  });
});
