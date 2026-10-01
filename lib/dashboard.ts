import { prisma } from "@/lib/db/client";
import { recommendationLabel, recommendationReason } from "@/components/Badge";
import { displayName } from "@/lib/format";
import { suggestRoleFit, loadRoleBenchmarks } from "@/lib/scoring/suggest-role";
import type { RoleT } from "@/lib/types";

export type DashboardRow = {
  id: string;
  name: string;
  nameSource: "resume" | "filename";
  appliedRole: string | null;
  suggestedRole: { role: RoleT; score: number } | null;
  notCleared: boolean;
  overallScore: number | null;
  recommendation: string | null;
  recommendationLabel: string;
  recommendationReason: string | null;
  keyGap: string | null;
  latestDecision: string | null;
  emailStatus: "none" | "awaiting_send" | "sent" | "failed";
  parseStatus: string;
};

export type DashboardSummary = {
  totalApplications: number;
  reviewed: number;
  recommended: number;
  awaitingDecision: number;
  interviews: number;
};

function humanizeDecision(d: string | null): string | null {
  if (!d) return null;
  return { MOVE_TO_INTERVIEW: "Move to interview", DO_NOT_MOVE_FORWARD: "Do not move forward", HOLD: "Hold", NEED_MORE_INFO: "Need more info" }[d] ?? d;
}

/**
 * A candidate who did clear their assigned role's benchmark still isn't
 * "cleared" in the sense a founder cares about at a glance — hold/
 * insufficient-evidence means the resume didn't make the case for this
 * role, which the Role column now surfaces directly rather than only via
 * the separate Recommendation column.
 */
function isNotCleared(recommendation: string | undefined): boolean {
  return recommendation === "hold" || recommendation === "insufficient_evidence";
}

export async function getDashboardData(roleFilter: "PM" | "SPM" | "ALL") {
  const where = roleFilter === "ALL" ? {} : { appliedRole: roleFilter };

  const candidates = await prisma.candidate.findMany({
    where,
    include: {
      evaluation: true,
      founderDecisions: { orderBy: { createdAt: "desc" }, take: 1 },
      auditEvents: { where: { eventType: "CANDIDATE_OPENED" } },
      emailDrafts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ evaluation: { overallScore: "desc" } }],
  });

  // Fetched once, reused across every unassigned candidate's role-fit
  // preview, rather than re-querying per row.
  const { benchmarks, signals } = await loadRoleBenchmarks();

  const rows: DashboardRow[] = await Promise.all(
    candidates.map(async (c) => {
      const gaps: string[] = c.evaluation ? JSON.parse(c.evaluation.gaps) : [];
      const { label: name, source: nameSource } = displayName(c);

      const latestEmail = c.emailDrafts[0];
      let emailStatus: DashboardRow["emailStatus"] = "none";
      if (latestEmail) {
        emailStatus = latestEmail.status === "SENT" ? "sent" : latestEmail.status === "FAILED" ? "failed" : "awaiting_send";
      }

      const suggestedRole =
        !c.appliedRole && c.parseStatus === "OK" ? await suggestRoleFit(c.sanitizedProfile, benchmarks, signals) : null;

      return {
        id: c.id,
        name,
        nameSource,
        appliedRole: c.appliedRole,
        suggestedRole,
        notCleared: isNotCleared(c.evaluation?.recommendation),
        overallScore: c.evaluation?.overallScore ?? null,
        recommendation: c.evaluation?.recommendation ?? null,
        recommendationLabel: c.evaluation ? recommendationLabel(c.evaluation.recommendation) : "Not yet scored",
        recommendationReason: c.evaluation
          ? recommendationReason(c.evaluation.recommendation, c.evaluation.overallScore, c.evaluation.confidence)
          : null,
        keyGap: gaps[0] ?? null,
        latestDecision: humanizeDecision(c.founderDecisions[0]?.decision ?? null),
        emailStatus,
        parseStatus: c.parseStatus,
      };
    })
  );

  // Highest-signal rows first regardless of DB ordering quirks with nulls.
  rows.sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1));

  const allForCounts = roleFilter === "ALL" ? candidates : await prisma.candidate.findMany({
    include: { evaluation: true, founderDecisions: { orderBy: { createdAt: "desc" }, take: 1 }, auditEvents: { where: { eventType: "CANDIDATE_OPENED" } } },
  });

  const summary: DashboardSummary = {
    totalApplications: allForCounts.length,
    reviewed: allForCounts.filter((c) => c.auditEvents.length > 0 || c.founderDecisions.length > 0).length,
    recommended: allForCounts.filter((c) => c.evaluation && (c.evaluation.recommendation === "strong_review" || c.evaluation.recommendation === "review")).length,
    awaitingDecision: allForCounts.filter((c) => c.evaluation && c.founderDecisions.length === 0).length,
    interviews: allForCounts.filter((c) => c.founderDecisions[0]?.decision === "MOVE_TO_INTERVIEW").length,
  };

  return { rows, summary };
}
