-- Dual-role support + session invalidation
-- Non-destructive: adds module capability flags and a token version counter.
-- Existing rows are backfilled from their current primary role so no user
-- loses access, and the existing admin account is unaffected.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "momoEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "susuEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Backfill module capabilities from the current primary role
UPDATE "User" SET "momoEnabled" = true WHERE "role" = 'worker';
UPDATE "User" SET "susuEnabled" = true WHERE "role" = 'collector';
