import { getAiProvider } from "@/lib/ai/provider";
import { getActiveCriteria } from "@/lib/scoring/versioning";
import { loadCachedSignals } from "@/lib/seed/state";
import type { RoleRequirement, RoleT, SanitizedCandidateProfile } from "@/lib/types";

export type RoleBenchmark = { requirements: RoleRequirement[]; criteria: Awaited<ReturnType<typeof getActiveCriteria>>["criteria"] };

/**
 * For an unassigned candidate, scores their existing sanitized profile
 * against BOTH role benchmarks (without persisting anything — this is a
 * lightweight preview, not a formal evaluation) and returns whichever role
 * fits better, so "Unassigned" isn't the only thing the founder sees before
 * they've clicked in and picked a role themselves.
 */
export async function suggestRoleFit(
  sanitizedProfileJson: string,
  benchmarks: Record<RoleT, RoleBenchmark>,
  signals: Awaited<ReturnType<typeof loadCachedSignals>>
): Promise<{ role: RoleT; score: number } | null> {
  const ai = getAiProvider();
  const profile: SanitizedCandidateProfile = JSON.parse(sanitizedProfileJson);
  if (profile.resumeBullets.length === 0) return null;

  const results = await Promise.all(
    (["PM", "SPM"] as RoleT[]).map(async (role) => {
      const { requirements, criteria } = benchmarks[role];
      if (criteria.length === 0) return { role, score: 0 };
      const roleSignals = signals.filter((s) => s.roleRelevance === "both" || s.roleRelevance === role);
      const result = await ai.evaluateCandidate({ ...profile, appliedRole: role }, requirements, criteria, roleSignals);
      return { role, score: result.overallScore };
    })
  );

  const best = results.reduce((a, b) => (b.score > a.score ? b : a));
  return best.score > 0 ? best : null;
}

export async function loadRoleBenchmarks(): Promise<{ benchmarks: Record<RoleT, RoleBenchmark>; signals: Awaited<ReturnType<typeof loadCachedSignals>> }> {
  const { prisma } = await import("@/lib/db/client");
  const [pmJd, spmJd, signals] = await Promise.all([
    prisma.jobDescription.findUnique({ where: { role: "PM" } }),
    prisma.jobDescription.findUnique({ where: { role: "SPM" } }),
    loadCachedSignals(),
  ]);
  const benchmarks: Record<RoleT, RoleBenchmark> = {
    PM: { requirements: pmJd ? JSON.parse(pmJd.parsedRequirements) : [], criteria: (await getActiveCriteria("PM")).criteria },
    SPM: { requirements: spmJd ? JSON.parse(spmJd.parsedRequirements) : [], criteria: (await getActiveCriteria("SPM")).criteria },
  };
  return { benchmarks, signals };
}
