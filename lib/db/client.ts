import { PrismaClient } from "@prisma/client";
import { mkdirSync, statSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { EMBEDDED_DEMO_DB_BASE64 } from "@/lib/db/embedded-demo-db";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * DATABASE_MODE=embedded-demo: no external database configured. Materializes
 * the embedded, PII-free demo SQLite file (JDs + rubrics only, see
 * lib/db/embedded-demo-db.ts) to /tmp on cold start and points Prisma at
 * that copy. /tmp is the one writable path on Vercel's serverless
 * filesystem, but it's ephemeral and not shared across invocations — reads
 * of the seeded JD/rubric data are always there (re-materialized fresh
 * every cold start), while writes (candidate uploads, decisions, sent
 * emails) only survive as long as requests keep landing on the same warm
 * instance. Set a real DATABASE_URL (Postgres) to get proper persistence.
 */
function resolveDatabaseUrl(): string | undefined {
  const mode = process.env.DATABASE_MODE?.replace(/^﻿/, "").trim();
  if (mode !== "embedded-demo") return undefined;

  const dest = path.join(os.tmpdir(), "demo.db");
  if (!EMBEDDED_DEMO_DB_BASE64) {
    throw new Error("DATABASE_MODE=embedded-demo but EMBEDDED_DEMO_DB_BASE64 is empty — embedded demo DB module failed to load");
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(EMBEDDED_DEMO_DB_BASE64, "base64"));
  const bytes = statSync(dest).size;
  if (bytes < 1000) {
    throw new Error(`Materialized demo DB at ${dest} is suspiciously small (${bytes} bytes) — write likely failed`);
  }
  console.log(`[embedded-demo-db] materialized ${bytes} bytes at ${dest}`);
  return `file:${dest}`;
}

const embeddedUrl = resolveDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(embeddedUrl ? { datasources: { db: { url: embeddedUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
