/**
 * BIK Prestige Enterprise — Shared Core Tests
 *
 * Tests for:
 * - Currency formatting
 * - Date formatting
 * - Status colors
 * - Authentication helpers (hashing, token creation)
 */

import { describe, it, expect } from "vitest";
import { formatCedi, formatDate, formatDateTime, getTodayString, getGreeting, getStatusColor } from "@/lib/utils";
import { hashPassword, verifyPassword, createToken, verifyToken } from "@/lib/auth";

// ============================================================
// CURRENCY FORMATTING
// ============================================================

describe("formatCedi", () => {
  it("formats a number with GH₵ prefix", () => {
    const result = formatCedi(100);
    expect(result).toContain("GH₵");
    expect(result).toContain("100");
  });

  it("formats with 2 decimal places", () => {
    const result = formatCedi(50.5);
    expect(result).toContain("50.50");
  });

  it("handles string input", () => {
    const result = formatCedi("25.75");
    expect(result).toContain("GH₵");
    expect(result).toContain("25.75");
  });

  it("handles zero", () => {
    const result = formatCedi(0);
    expect(result).toContain("GH₵");
    expect(result).toContain("0.00");
  });

  it("handles large numbers", () => {
    const result = formatCedi(1000);
    expect(result).toContain("GH₵");
    expect(result).toContain("1,000");
  });
});

// ============================================================
// DATE FORMATTING
// ============================================================

describe("formatDate", () => {
  it("formats a Date object", () => {
    const date = new Date("2025-03-15T12:00:00Z");
    const result = formatDate(date);
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });

  it("formats a date string", () => {
    const result = formatDate("2025-06-01");
    expect(result).toContain("1");
    expect(result).toContain("2025");
  });
});

describe("formatDateTime", () => {
  it("includes time components", () => {
    const date = new Date("2025-03-15T14:30:00Z");
    const result = formatDateTime(date);
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });
});

// ============================================================
// DATE UTILITIES
// ============================================================

describe("getTodayString", () => {
  it("returns today as YYYY-MM-DD", () => {
    const result = getTodayString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const today = new Date();
    expect(result).toBe(today.toISOString().split("T")[0]);
  });
});

// ============================================================
// GREETING
// ============================================================

describe("getGreeting", () => {
  it("returns a greeting string", () => {
    const result = getGreeting();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ============================================================
// STATUS COLORS
// ============================================================

describe("getStatusColor", () => {
  it("returns green for active status", () => {
    expect(getStatusColor("active")).toBe("badge-green");
  });

  it("returns green for submitted status", () => {
    expect(getStatusColor("submitted")).toBe("badge-green");
  });

  it("returns red for inactive status", () => {
    expect(getStatusColor("inactive")).toBe("badge-red");
  });

  it("returns yellow for draft status", () => {
    expect(getStatusColor("draft")).toBe("badge-yellow");
  });

  it("returns yellow for pending status", () => {
    expect(getStatusColor("pending")).toBe("badge-yellow");
  });

  it("returns blue for reviewed status", () => {
    expect(getStatusColor("reviewed")).toBe("badge-blue");
  });

  it("returns gray for unknown status", () => {
    expect(getStatusColor("unknown")).toBe("badge-gray");
  });
});

// ============================================================
// AUTHENTICATION HELPERS
// ============================================================

describe("Password hashing", () => {
  it("hashes a password", async () => {
    const hash = await hashPassword("TestPassword123");
    expect(hash).toBeDefined();
    expect(hash).not.toBe("TestPassword123");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifies correct password", async () => {
    const hash = await hashPassword("TestPassword123");
    const valid = await verifyPassword("TestPassword123", hash);
    expect(valid).toBe(true);
  });

  it("rejects incorrect password", async () => {
    const hash = await hashPassword("TestPassword123");
    const valid = await verifyPassword("WrongPassword", hash);
    expect(valid).toBe(false);
  });

  it("produces different hashes for same input", async () => {
    const hash1 = await hashPassword("TestPassword123");
    const hash2 = await hashPassword("TestPassword123");
    expect(hash1).not.toBe(hash2);
  });
});

describe("JWT tokens", () => {
  it("creates and verifies a token", async () => {
    const payload = {
      userId: "user-123",
      email: "test@bikprestige.com",
      role: "admin" as const,
    };

    const token = await createToken(payload);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const verified = await verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe("user-123");
    expect(verified!.email).toBe("test@bikprestige.com");
    expect(verified!.role).toBe("admin");
  });

  it("rejects invalid token", async () => {
    const result = await verifyToken("invalid.token.here");
    expect(result).toBeNull();
  });

  it("handles different roles", async () => {
    const roles = ["admin", "worker", "collector"] as const;

    for (const role of roles) {
      const token = await createToken({
        userId: `user-${role}`,
        email: `${role}@test.com`,
        role,
      });
      const verified = await verifyToken(token);
      expect(verified!.role).toBe(role);
    }
  });

  it("includes locationId when provided", async () => {
    const token = await createToken({
      userId: "user-1",
      email: "worker@test.com",
      role: "worker",
      locationId: "loc-123",
    });
    const verified = await verifyToken(token);
    expect(verified!.locationId).toBe("loc-123");
  });
});
