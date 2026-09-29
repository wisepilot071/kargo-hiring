import { prisma } from "@/lib/db/client";
import { getAiProvider } from "@/lib/ai/provider";
import { loadCachedSignals } from "@/lib/seed/state";
import { recordAudit, AUDIT_EVENTS } from "@/lib/db/audit";
import { getActiveCriteria } from "@/lib/scoring/versioning";
import type { RoleRequirement, SanitizedCandidateProfile } from "@/lib/types";
import type { HistoricalSignal } from "@/lib/ai/types";

/**
 * Runs STAGE 3 + STAGE 4 (evaluate + interview brief) for one candidate that
 * already has an appliedRole set. Shared by the seed script and by the
 * "assign role" API route so both paths behave identically.
 */
export async function evaluateAndBriefCandidate(candidateId: string): Promise<void> {
  const ai = getAiProvider();
  const candidate = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });
  if (!candidate.appliedRole) {
    throw new Error(`Candidate ${candidateId} has no appliedRole set — cannot evaluate.`);
  }

  const jd = await prisma.jobDescription.findUnique({ where: { role: candidate.appliedRole } });
  const requirements: RoleRequirement[] = jd ? JSON.parse(jd.parsedRequirements) : [];

  // Always score against the ACTIVE (latest) benchmark version — never a
  // mix of old and new criteria rows, which would silently corrupt scoring
  // once a role has more than one published version.
  const { version: benchmarkVersion, criteria: rubric } = await getActiveCriteria(candidate.appliedRole as "PM" | "SPM");

  const allSignals: HistoricalSignal[] = await loadCachedSignals();
  const signals = allSignals.filter((s) => s.roleRelevance === "both" || s.roleRelevance === candidate.appliedRole);

  const sanitized: SanitizedCandidateProfile = JSON.parse(candidate.sanitizedProfile);

  const evaluation = await ai.evaluateCandidate(sanitized, requirements, rubric, signals);

  await prisma.candidateEvaluation.upsert({
    where: { candidateId },
    create: {
      candidateId,
      role: candidate.appliedRole,
      benchmarkVersion,
      overallScore: evaluation.overallScore,
      confidence: evaluation.confidence,
      recommendation: evaluation.recommendation,
      criterionScores: JSON.stringify(evaluation.criteria),
      strengths: JSON.stringify(evaluation.strengths),
      gaps: JSON.stringify(evaluation.gaps),
      historicalSignals: JSON.stringify(evaluation.historicalSignals),
      reasoning: JSON.stringify(evaluation.reasoning),
      aiProvider: ai.name,
    },
    update: {
      role: candidate.appliedRole,
      benchmarkVersion,
      overallScore: evaluation.overallScore,
      confidence: evaluation.confidence,
      recommendation: evaluation.recommendation,
      criterionScores: JSON.stringify(evaluation.criteria),
      strengths: JSON.stringify(evaluation.strengths),
      gaps: JSON.stringify(evaluation.gaps),
      historicalSignals: JSON.stringify(evaluation.historicalSignals),
      reasoning: JSON.stringify(evaluation.reasoning),
      aiProvider: ai.name,
    },
  });
  await recordAudit(candidateId, AUDIT_EVENTS.EVALUATION_GENERATED, `score=${evaluation.overallScore} rec=${evaluation.recommendation}`);

  const brief = await ai.generateInterviewBrief(sanitized, evaluation);
  await prisma.interviewBrief.upsert({
    where: { candidateId },
    create: {
      candidateId,
      snapshot: brief.snapshot,
      strongestEvidence: JSON.stringify(brief.strongestEvidence),
      concerns: JSON.stringify(brief.concerns),
      historicalSignalsMatched: JSON.stringify(brief.historicalSignalsMatched),
      validationAreas: JSON.stringify(brief.validationAreas),
      questions: JSON.stringify(brief.questions),
      strongAnswerLooksLike: JSON.stringify(brief.strongAnswerLooksLike),
      whatWouldChangeRecommendation: JSON.stringify(brief.whatWouldChangeRecommendation),
    },
    update: {
      snapshot: brief.snapshot,
      strongestEvidence: JSON.stringify(brief.strongestEvidence),
      concerns: JSON.stringify(brief.concerns),
      historicalSignalsMatched: JSON.stringify(brief.historicalSignalsMatched),
      validationAreas: JSON.stringify(brief.validationAreas),
      questions: JSON.stringify(brief.questions),
      strongAnswerLooksLike: JSON.stringify(brief.strongAnswerLooksLike),
      whatWouldChangeRecommendation: JSON.stringify(brief.whatWouldChangeRecommendation),
    },
  });
  await recordAudit(candidateId, AUDIT_EVENTS.INTERVIEW_BRIEF_GENERATED);
}
