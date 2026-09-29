import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

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
  if (process.env.DATABASE_MODE !== "embedded-demo") return undefined;

  const dest = process.platform === "win32" ? path.join(require("os").tmpdir(), "demo.db") : "/tmp/demo.db";
  if (!existsSync(dest)) {
    mkdirSync(path.dirname(dest), { recursive: true });
    const { EMBEDDED_DEMO_DB_BASE64 } = require("@/lib/db/embedded-demo-db");
    writeFileSync(dest, Buffer.from(EMBEDDED_DEMO_DB_BASE64, "base64"));
  }
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
