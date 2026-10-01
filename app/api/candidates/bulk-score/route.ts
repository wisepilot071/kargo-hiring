import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { loadRoleBenchmarks, suggestRoleFit } from "@/lib/scoring/suggest-role";
import { assignRoleAndEvaluate } from "@/lib/scoring/assign-role";
import { recordAudit } from "@/lib/db/audit";

/**
 * Bulk-assigns every unassigned, successfully-parsed candidate to their
 * best-fit suggested role and runs the full scoring pipeline on each — the
 * dashboard equivalent of clicking "assign role" one candidate at a time.
 * Each candidate is isolated in its own try/catch so one bad evaluation
 * doesn't abort the rest of the batch (same pattern as the seed script).
 */
export async function POST() {
  const candidates = await prisma.candidate.findMany({
    where: { appliedRole: null, parseStatus: "OK" },
    select: { id: true, sanitizedProfile: true, email: true },
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

  return NextResponse.json({ ok: true, total: candidates.length, scored, skipped, failed });
}
