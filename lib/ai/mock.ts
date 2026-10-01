import type {
  HistoricalHireRecord,
  HiringCriterion,
  RoleRequirement,
  RoleT,
  SanitizedCandidateProfile,
  CandidateEvaluationResult,
  InterviewBriefResult,
  EmailDraftResult,
} from "@/lib/types";
import type { AiProvider, HistoricalSignal, EmailDraftInput } from "@/lib/ai/types";
import { CONCEPTS, findMatches, hasDigitOrCurrency, hasOwnershipLanguage } from "@/lib/ai/concepts";
import { extractSignificantTerms, findEvidenceByTerms } from "@/lib/ai/text-match";
import { parseJdRequirements } from "@/lib/parsers/jd";

const OUTCOME_GROUP = {
  "Exceeds Expectations": "exceeds",
  "Meets Expectations": "meets",
  "Below Expectations": "below",
} as const;

/**
 * Mock provider: no external LLM call. Every output is derived by extractive
 * analysis of the actual text supplied (JD text, historical hire text,
 * candidate resume bullets) — evidence quoted is always real text, never
 * invented. This is intentionally the default so the whole pipeline runs
 * and is demonstrable with zero API keys. Swap AI_PROVIDER=anthropic once a
 * key is available; the interface is identical.
 */
export class MockAiProvider implements AiProvider {
  readonly name = "mock";

  async parseJobDescription(_role: RoleT, rawText: string): Promise<RoleRequirement[]> {
    return parseJdRequirements(rawText);
  }

  async analyzeHistoricalHires(
    hires: HistoricalHireRecord[],
    _jds: { role: RoleT; rawText: string }[]
  ): Promise<HistoricalSignal[]> {
    if (hires.length === 0) return [];

    const signals: HistoricalSignal[] = [];

    for (const concept of CONCEPTS) {
      const byGroup: Record<"exceeds" | "meets" | "below", HistoricalHireRecord[]> = {
        exceeds: [],
        meets: [],
        below: [],
      };
      const matchedEvidence: string[] = [];
      const sourceCandidates: string[] = [];
      let anyMatch = false;

      for (const hire of hires) {
        const bullets = [...hire.applicationSignals, ...hire.interviewSignals];
        const matches = findMatches(bullets, concept);
        const group = OUTCOME_GROUP[hire.outcomeRating];
        if (matches.length > 0) {
          anyMatch = true;
          byGroup[group].push(hire);
          matchedEvidence.push(...matches.slice(0, 2));
          sourceCandidates.push(hire.id);
        }
      }

      if (!anyMatch) continue;

      const totalExceeds = hires.filter((h) => h.outcomeRating === "Exceeds Expectations").length;
      const totalMeets = hires.filter((h) => h.outcomeRating === "Meets Expectations").length;
      const totalBelow = hires.filter((h) => h.outcomeRating === "Below Expectations").length;
      const totalNonExceeds = totalMeets + totalBelow;

      const exceedsRate = totalExceeds > 0 ? byGroup.exceeds.length / totalExceeds : 0;
      const nonExceedsRate =
        totalNonExceeds > 0 ? (byGroup.meets.length + byGroup.below.length) / totalNonExceeds : 0;

      let confidence: HistoricalSignal["confidence"];
      if (totalExceeds < 2 || sourceCandidates.length < 3) {
        confidence = "insufficient";
      } else if (exceedsRate - nonExceedsRate >= 0.5) {
        confidence = "high";
      } else if (exceedsRate - nonExceedsRate >= 0.25) {
        confidence = "medium";
      } else {
        confidence = "low";
      }

      signals.push({
        name: concept.label,
        description: `Presence of "${concept.label.toLowerCase()}" observed across historical hire application/interview notes.`,
        evidenceFromHistoricalData: Array.from(new Set(matchedEvidence)).slice(0, 5),
        confidence,
        sourceCandidates: Array.from(new Set(sourceCandidates)),
        roleRelevance: "both",
      });
    }

    return signals;
  }

  async generateRubric(
    role: RoleT,
    requirements: RoleRequirement[],
    signals: HistoricalSignal[]
  ): Promise<HiringCriterion[]> {
    const scored = requirements.filter((r) => r.type === "essential" || r.type === "important");
    const rows: Omit<HiringCriterion, "weight">[] = scored.map((req, idx) => ({
      id: `${role.toLowerCase()}-jd-${idx}`,
      role,
      name: req.requirement,
      description: req.definition,
      type: req.type === "essential" ? "essential" : "important",
      jdImportance: req.type === "essential" ? "high" : "medium",
      evidence: [req.jdEvidence],
      confidence: "medium",
      sourceCandidates: [],
    }));

    // Fold in historical signals with medium+ confidence that aren't already
    // reasonably covered by a JD-derived criterion name.
    const existingNames = rows.map((r) => r.name.toLowerCase());
    let histIdx = 0;
    for (const signal of signals) {
      if (signal.confidence === "insufficient" || signal.confidence === "low") continue;
      const alreadyCovered = existingNames.some(
        (n) => n.includes(signal.name.toLowerCase().slice(0, 12)) || signal.name.toLowerCase().includes(n.slice(0, 12))
      );
      if (alreadyCovered) continue;
      rows.push({
        id: `${role.toLowerCase()}-hist-${histIdx++}`,
        role,
        name: signal.name,
        description: signal.description,
        type: "historical",
        jdImportance: "none",
        evidence: signal.evidenceFromHistoricalData,
        confidence: signal.confidence,
        sourceCandidates: signal.sourceCandidates,
      });
    }

    if (rows.length === 0) {
      return [];
    }

    // Weight: essential base 15, important base 8, historical base
    // 6 (high) / 4 (medium), then normalize to sum to 100.
    const rawWeights = rows.map((r) => {
      if (r.type === "essential") return 15;
      if (r.type === "important") return 8;
      if (r.confidence === "high") return 8;
      return 5;
    });
    const total = rawWeights.reduce((a, b) => a + b, 0);
    const weights = rawWeights.map((w) => Math.round((w / total) * 1000) / 10);

    // Rounding each weight independently to 1 decimal place doesn't
    // guarantee the set sums to exactly 100 (found in QA: 99.6 / 100.6) —
    // push the accumulated rounding error onto the single largest weight,
    // which distorts it the least in relative terms.
    const roundedSum = Math.round(weights.reduce((a, b) => a + b, 0) * 10) / 10;
    const drift = Math.round((100 - roundedSum) * 10) / 10;
    if (drift !== 0) {
      const largestIdx = weights.indexOf(Math.max(...weights));
      weights[largestIdx] = Math.round((weights[largestIdx] + drift) * 10) / 10;
    }

    const criteria: HiringCriterion[] = rows.map((r, i) => ({
      ...r,
      weight: weights[i],
    }));

    return criteria;
  }

  async evaluateCandidate(
    profile: SanitizedCandidateProfile,
    _requirements: RoleRequirement[],
    rubric: HiringCriterion[],
    signals: HistoricalSignal[]
  ): Promise<CandidateEvaluationResult> {
    if (rubric.length === 0) {
      return {
        overallScore: 0,
        confidence: "insufficient",
        recommendation: "insufficient_evidence",
        criteria: [],
        strengths: [],
        gaps: ["No rubric could be built for this role — the job description could not be parsed into requirements."],
        historicalSignals: [],
        reasoning: ["Evaluation could not run: no scored criteria are available for this role."],
      };
    }

    const bullets = profile.resumeBullets;
    const criteriaScores = rubric.map((criterion) => {
      let matches: string[];
      if (criterion.type === "historical" || criterion.type === "differentiating") {
        // Historical-signal criteria carry the concept label as their name
        // verbatim, by construction, in the real seed pipeline — so an
        // exact-label lookup is the precise first choice. But that's an
        // implicit coupling with no error if it's ever violated (e.g. a
        // renamed/edited criterion), which would otherwise silently zero
        // out every candidate's score for that criterion with no signal
        // anything was wrong (found in QA via a criterion built with a
        // slightly different name than its concept label). Fall back to
        // the same generic term-matching JD-derived criteria use, so a
        // naming mismatch degrades to "less precise" rather than "silently
        // broken."
        const concept = CONCEPTS.find((c) => c.label === criterion.name);
        matches = concept
          ? findMatches(bullets, concept)
          : findEvidenceByTerms(bullets, extractSignificantTerms(`${criterion.name} ${criterion.description}`));
      } else {
        // JD-derived criteria: match on the criterion's own wording, not a
        // fixed concept dictionary, so we don't miss evidence just because
        // the JD phrased a requirement differently than our concept labels.
        const terms = extractSignificantTerms(`${criterion.name} ${criterion.description}`);
        matches = findEvidenceByTerms(bullets, terms);
      }

      let score: number;
      let explanation: string;
      const gaps: string[] = [];

      if (matches.length === 0) {
        score = 0;
        explanation = `No resume evidence located for "${criterion.name}".`;
        gaps.push(`No evidence found for ${criterion.name}.`);
      } else if (matches.length === 1 && !hasDigitOrCurrency(matches[0]) && hasOwnershipLanguage(matches[0])) {
        // A single statement can still be strong evidence when it's a
        // specific, first-person ownership claim rather than a vague
        // mention — quantification isn't the only form of specificity.
        score = 2;
        explanation = `One specific ownership statement found, without a quantified outcome attached.`;
        gaps.push(`Only a single example supports ${criterion.name} — no second instance to confirm it's a pattern.`);
      } else if (matches.length === 1 && !hasDigitOrCurrency(matches[0])) {
        score = 1;
        explanation = `One general mention found, without a quantified or specific outcome.`;
      } else if (matches.length === 1 && hasDigitOrCurrency(matches[0])) {
        score = 2;
        explanation = `One specific, quantified example found.`;
        gaps.push(`Only a single example supports ${criterion.name} — no second instance to confirm it's a pattern.`);
      } else if (matches.some(hasDigitOrCurrency)) {
        score = hasOwnershipLanguage(matches.join(" ")) ? 4 : 3;
        explanation = `Multiple examples found, including at least one with a quantified outcome.`;
      } else {
        score = 2;
        explanation = `Multiple general mentions, but none with a quantified outcome.`;
        gaps.push(`No quantified impact found for ${criterion.name}.`);
      }

      return {
        criterionId: criterion.id,
        name: criterion.name,
        score,
        weight: criterion.weight,
        evidence: matches.slice(0, 3),
        gaps,
        explanation,
      };
    });

    const overallScore = Math.round(
      criteriaScores.reduce((sum, c) => sum + (c.score / 4) * c.weight, 0)
    );

    const coveredCount = criteriaScores.filter((c) => c.score > 0).length;
    const coverageRate = coveredCount / criteriaScores.length;
    const hasEnoughText = bullets.length >= 3;

    let confidence: CandidateEvaluationResult["confidence"];
    if (!hasEnoughText) confidence = "insufficient";
    else if (coverageRate >= 0.7) confidence = "high";
    else if (coverageRate >= 0.4) confidence = "medium";
    else confidence = "low";

    let recommendation: CandidateEvaluationResult["recommendation"];
    if (confidence === "insufficient") recommendation = "insufficient_evidence";
    else if (overallScore >= 70) recommendation = "strong_review";
    else if (overallScore >= 30) recommendation = "review";
    else recommendation = "hold";

    const strengths = criteriaScores
      .filter((c) => c.score >= 3)
      .map((c) => `${c.name}: ${c.evidence[0] ?? ""}`.trim());
    const gaps = Array.from(new Set(criteriaScores.flatMap((c) => c.gaps)));

    const historicalSignals = signals
      .filter((s) => s.confidence !== "insufficient")
      .map((s) => {
        const concept = CONCEPTS.find((c) => c.label === s.name);
        const matches = concept ? findMatches(bullets, concept) : [];
        if (matches.length === 0) return null;
        return {
          signal: s.name,
          candidateEvidence: matches[0],
          historicalEvidence: s.evidenceFromHistoricalData[0] ?? "(historical evidence on file)",
          confidence: s.confidence,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const reasoning: string[] = [];
    for (const s of strengths.slice(0, 3)) {
      reasoning.push(`Shows evidence of ${s}`);
    }
    if (signals.length === 0) {
      reasoning.push(
        "No Kargo historical hire data is currently available — this evaluation reflects job-description fit only, not historical calibration."
      );
    } else if (historicalSignals.length > 0) {
      reasoning.push(
        `Matches ${historicalSignals.length} pattern(s) observed among historical Kargo hire records.`
      );
    }
    if (reasoning.length === 0) {
      reasoning.push("Limited resume evidence found; see gaps below.");
    }

    return {
      overallScore,
      confidence,
      recommendation,
      criteria: criteriaScores,
      strengths,
      gaps,
      historicalSignals,
      reasoning,
    };
  }

  async generateInterviewBrief(
    profile: SanitizedCandidateProfile,
    evaluation: CandidateEvaluationResult
  ): Promise<InterviewBriefResult> {
    const snapshot = `Applied for ${profile.appliedRole}. Most recent role: ${
      profile.currentRole ?? "Not available"
    }${profile.yearsOfExperience ? `, ~${profile.yearsOfExperience} years of experience` : ""}.`;

    // Build questions from criteria that actually have a recorded gap, using
    // the criterion's own name directly — not parsed back out of the gap
    // sentence, which is fragile once gap phrasing varies (see e.g. the
    // "only a single example" gap format).
    const criteriaWithGaps = evaluation.criteria.filter((c) => c.gaps.length > 0).slice(0, 4);
    const topGaps = criteriaWithGaps.length > 0 ? criteriaWithGaps.map((c) => c.gaps[0]) : evaluation.gaps.slice(0, 4);
    // Keep the criterion name out of the question's own grammar — rubric
    // criterion names range from short labels to full descriptive clauses,
    // and embedding one mid-sentence ("...you demonstrated 'The rhythms a PM
    // function needs'") reads as broken for the clause-shaped ones. Naming it
    // as a topic instead, plus one brief reason, sidesteps that regardless of
    // naming style.
    const questions = criteriaWithGaps.map((c) => ({
      question: `Ask about "${c.name}" — walk through one specific example: the situation, the decision, and the outcome.`,
      reason: c.gaps[0],
      whatToValidate: "A concrete instance, not a general claim.",
    }));

    return {
      snapshot,
      strongestEvidence: evaluation.strengths,
      concerns: evaluation.gaps,
      historicalSignalsMatched: evaluation.historicalSignals.map((s) => s.signal),
      validationAreas: topGaps.map((g) => `Validate: ${g}`),
      questions,
      strongAnswerLooksLike: questions.map(
        (q) => `A specific example with a stated decision, the candidate's own role in it, and a measurable or observable outcome.`
      ),
      whatWouldChangeRecommendation: topGaps.map(
        (g) => `Concrete, specific evidence resolving: "${g}"`
      ),
    };
  }

  async generateEmailDraft(input: EmailDraftInput): Promise<EmailDraftResult> {
    const greeting = input.candidateName ? `Hi ${input.candidateName.split(" ")[0]},` : "Hello,";
    const roleLabel = input.appliedRole === "PM" ? "Product Manager" : "Senior Product Manager";

    if (input.type === "INTERVIEW_INVITATION") {
      const strengthLine = input.topStrengths[0]
        ? ` In particular, your experience around ${input.topStrengths[0].split(":")[0].toLowerCase()} stood out to us.`
        : "";
      return {
        subject: "Next Step — Kargo Product Team",
        body: `${greeting}\n\nThank you for applying for the ${roleLabel} role at Kargo.${strengthLine}\n\nWe'd like to move forward with an interview. Could you share a few times that work for you over the next week?\n\nLooking forward to speaking with you.\n\nBest,\nArjun Mehta\nKargo`,
      };
    }

    if (input.type === "REJECTION") {
      const reasonLine = input.founderNote ? ` ${input.founderNote.trim()}` : "";
      return {
        subject: "Your application to Kargo",
        body: `${greeting}\n\nThank you for taking the time to apply for the ${roleLabel} role at Kargo. After reviewing your application, we have decided not to move forward at this stage.${reasonLine}\n\nWe appreciate your interest in Kargo and wish you the best in your search.\n\nBest,\nArjun Mehta\nKargo`,
      };
    }

    return {
      subject: "Following up — Kargo Product Team",
      body: `${greeting}\n\nFollowing up on your application for the ${roleLabel} role at Kargo.${
        input.founderNote ? " " + input.founderNote.trim() : ""
      }\n\nBest,\nArjun Mehta\nKargo`,
    };
  }
}
