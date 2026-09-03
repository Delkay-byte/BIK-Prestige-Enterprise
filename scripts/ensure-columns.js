#!/usr/bin/env node
/**
 * Safety-net script: ensures critical columns exist in the production database.
 * Run during build to patch any schema drift that prisma db push may miss.
 * Uses raw SQL via @prisma/client.
 *
 * On PostgreSQL (production): uses IF NOT EXISTS.
 * On SQLite (local dev): uses try/catch for duplicate column errors.
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PATCHES = [
  {
    table: "Contribution",
    column: "recordedByName",
    pg: 'ALTER TABLE "Contribution" ADD COLUMN IF NOT EXISTS "recordedByName" TEXT',
   lite: 'ALTER TABLE "Contribution" ADD COLUMN "recordedByName" TEXT',
  },
  {
    table: "Contribution",
    column: "receivedByName",
    pg: 'ALTER TABLE "Contribution" ADD COLUMN IF NOT EXISTS "receivedByName" TEXT',
   lite: 'ALTER TABLE "Contribution" ADD COLUMN "receivedByName" TEXT',
  },
  {
    table: "Contribution",
    column: "receivedById",
    pg: 'ALTER TABLE "Contribution" ADD COLUMN IF NOT EXISTS "receivedById" TEXT',
   lite: 'ALTER TABLE "Contribution" ADD COLUMN "receivedById" TEXT',
  },
  {
    table: "User",
    column: "momoEnabled",
    pg: 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "momoEnabled" BOOLEAN NOT NULL DEFAULT false',
    lite: 'ALTER TABLE "User" ADD COLUMN "momoEnabled" INTEGER NOT NULL DEFAULT 0',
  },
  {
    table: "User",
    column: "susuEnabled",
    pg: 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "susuEnabled" BOOLEAN NOT NULL DEFAULT false',
    lite: 'ALTER TABLE "User" ADD COLUMN "susuEnabled" INTEGER NOT NULL DEFAULT 0',
  },
];

async function main() {
  const url = process.env.DATABASE_URL || "";
  const isPg = url.startsWith("postgres");
  console.log(`ensure-columns: targeting ${isPg ? "PostgreSQL" : "SQLite"} database`);

  let patched = 0;
  for (const patch of PATCHES) {
    try {
      const sql = isPg ? patch.pg : patch.lite;
      await prisma.$executeRawUnsafe(sql);
      console.log(`  ✓ ${patch.table}.${patch.column} — ensured`);
      patched++;
    } catch (err) {
      const msg = err.message || "";
      const isDuplicate =
        err.code === "42701" ||              // PostgreSQL: duplicate column
        msg.includes("duplicate column") ||   // SQLite
        msg.includes("already exists");       // generic
      if (isDuplicate) {
        console.log(`  · ${patch.table}.${patch.column} — already exists`);
      } else {
        console.error(`  ✗ ${patch.table}.${patch.column} — ${msg}`);
      }
    }
  }
  console.log(`\nensure-columns: ${patched} patch(es) applied.`);
}

main()
  .catch((e) => {
    console.error("ensure-columns failed:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
