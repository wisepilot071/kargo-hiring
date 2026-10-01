import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { loadRoleBenchmarks, suggestRoleFit } from "@/lib/scoring/suggest-role";
import { assignRoleAndEvaluate } from "@/lib/scoring/assign-role";
import { recordAudit } from "@/lib/db/audit";

// Each candidate needs several sequential round-trips to the database plus
// the AI provider (role-fit preview, then the real evaluation + interview
// brief) — a batch of 20+ candidates can run well past Vercel's default 10s
// function timeout. 60s is the ceiling on the Hobby plan; if a batch is
// still larger than that can clear, the route is safe to call again — it
// only ever touches candidates that are still unassigned.
export const maxDuration = 60;

/**
 * Bulk-assigns every unassigned, successfully-parsed candidate to their
 * best-fit suggested role and runs the full scoring pipeline on each — the
 * dashboard equivalent of clicking "assign role" one candidate at a time.
 * Each candidate is isolated in its own try/catch so one bad evaluation
 * doesn't abort the rest of the batch (same pattern as the seed script).
 */
// Capped well under what 60s can reliably clear (observed pace during
// testing: roughly several seconds per candidate, dominated by sequential
// round-trips to the database) — the caller loops over multiple requests
// for a larger batch rather than one request gambling on finishing in time.
const BATCH_SIZE = 8;

export async function POST() {
  const totalUnassigned = await prisma.candidate.count({ where: { appliedRole: null, parseStatus: "OK" } });
  const candidates = await prisma.candidate.findMany({
    where: { appliedRole: null, parseStatus: "OK" },
    select: { id: true, sanitizedProfile: true, email: true },
    take: BATCH_SIZE,
  });

  const { benchmarks, signals } = await loadRoleBenchmarks();

  let scored = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const suggestion = await suggestRoleFit(candidate.sanitizedProfile, benchmarks, signals);
    if (!suggestion) {
      skipped += 1;
      continue;
    }
    try {
      await assignRoleAndEvaluate(candidate.id, suggestion.role);
      scored += 1;
    } catch (err) {
      failed += 1;
      await recordAudit(candidate.id, "EVALUATION_FAILED", err instanceof Error ? err.message : "Unknown error");
    }
  }

  const remaining = totalUnassigned - candidates.length;
  return NextResponse.json({ ok: true, total: candidates.length, scored, skipped, failed, remaining: Math.max(remaining, 0) });
}
