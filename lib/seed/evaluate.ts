import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { evaluateAndBriefCandidate } from "@/lib/scoring/pipeline";
import { recordAudit } from "@/lib/db/audit";

/** Re-runs scoring + interview-brief generation for every role-assigned candidate, without re-importing files. */
async function main() {
  const candidates = await prisma.candidate.findMany({ where: { appliedRole: { not: null }, parseStatus: "OK" } });
  console.log(`Re-evaluating ${candidates.length} candidate(s)...`);
  for (const c of candidates) {
    try {
      await evaluateAndBriefCandidate(c.id);
      console.log(`  ✓ ${c.resumeFile}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      await recordAudit(c.id, "EVALUATION_FAILED", reason);
      console.log(`  ! ${c.resumeFile}: evaluation failed — ${reason}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
