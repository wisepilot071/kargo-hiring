import { z } from "zod";

export const RoleSchema = z.enum(["PM", "SPM"]);
export type RoleT = z.infer<typeof RoleSchema>;

export const OutcomeRatingSchema = z.enum([
  "Exceeds Expectations",
  "Meets Expectations",
  "Below Expectations",
]);
export type OutcomeRatingT = z.infer<typeof OutcomeRatingSchema>;

export const RequirementTypeSchema = z.enum(["essential", "important", "preferred", "contextual"]);

export const RoleRequirementSchema = z.object({
  requirement: z.string(),
  type: RequirementTypeSchema,
  definition: z.string(),
  jdEvidence: z.string(),
});
export type RoleRequirement = z.infer<typeof RoleRequirementSchema>;

// ---- Parsed / sanitized candidate profile ----

export const ParsedCandidateProfileSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  currentRole: z.string().nullable(),
  previousRoles: z.array(z.string()),
  companies: z.array(z.string()),
  yearsOfExperience: z.number().nullable(),
  education: z.array(z.string()),
  skills: z.array(z.string()),
});
export type ParsedCandidateProfile = z.infer<typeof ParsedCandidateProfileSchema>;

// The sanitized profile is what the AI scoring pipeline sees. No name / email /
// phone — those fields are dropped entirely, not just masked, before this
// object is built (see lib/scoring/sanitize.ts).
export const SanitizedCandidateProfileSchema = z.object({
  appliedRole: RoleSchema,
  currentRole: z.string().nullable(),
  previousRoles: z.array(z.string()),
  companies: z.array(z.string()),
  yearsOfExperience: z.number().nullable(),
  education: z.array(z.string()),
  skills: z.array(z.string()),
  resumeBullets: z.array(z.string()), // full bullet-level text, evidence source for AI
});
export type SanitizedCandidateProfile = z.infer<typeof SanitizedCandidateProfileSchema>;

// ---- Historical hiring pattern engine ----

export const HistoricalHireRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: RoleSchema,
  joinedDate: z.string().nullable(),
  applicationSignals: z.array(z.string()),
  interviewSignals: z.array(z.string()),
  outcomeRating: OutcomeRatingSchema,
  rawText: z.string(),
  sourceFile: z.string(),
});
export type HistoricalHireRecord = z.infer<typeof HistoricalHireRecordSchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low", "insufficient"]);
export const CriterionTypeSchema = z.enum(["essential", "important", "historical", "differentiating"]);

export const HiringCriterionSchema = z.object({
  id: z.string(),
  role: RoleSchema,
  name: z.string(),
  description: z.string(),
  weight: z.number(),
  type: CriterionTypeSchema,
  jdImportance: z.enum(["high", "medium", "low", "none"]),
  evidence: z.array(z.string()),
  confidence: ConfidenceSchema,
  sourceCandidates: z.array(z.string()),
});
export type HiringCriterion = z.infer<typeof HiringCriterionSchema>;

// ---- AI evaluation output (validated schema, per spec section 21) ----

export const CriterionScoreSchema = z.object({
  criterionId: z.string(),
  name: z.string(),
  score: z.number().min(0).max(4),
  weight: z.number(),
  evidence: z.array(z.string()),
  gaps: z.array(z.string()),
  explanation: z.string(),
});
export type CriterionScore = z.infer<typeof CriterionScoreSchema>;

export const HistoricalSignalMatchSchema = z.object({
  signal: z.string(),
  candidateEvidence: z.string(),
  historicalEvidence: z.string(),
  confidence: ConfidenceSchema,
});
export type HistoricalSignalMatch = z.infer<typeof HistoricalSignalMatchSchema>;

export const RecommendationSchema = z.enum([
  "strong_review",
  "review",
  "hold",
  "insufficient_evidence",
]);

export const CandidateEvaluationResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  confidence: ConfidenceSchema,
  recommendation: RecommendationSchema,
  criteria: z.array(CriterionScoreSchema),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  historicalSignals: z.array(HistoricalSignalMatchSchema),
  reasoning: z.array(z.string()),
});
export type CandidateEvaluationResult = z.infer<typeof CandidateEvaluationResultSchema>;

// ---- Interview brief ----

export const InterviewQuestionSchema = z.object({
  question: z.string(),
  reason: z.string(),
  whatToValidate: z.string(),
});
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;

export const InterviewBriefResultSchema = z.object({
  snapshot: z.string(),
  strongestEvidence: z.array(z.string()),
  concerns: z.array(z.string()),
  historicalSignalsMatched: z.array(z.string()),
  validationAreas: z.array(z.string()),
  questions: z.array(InterviewQuestionSchema),
  strongAnswerLooksLike: z.array(z.string()),
  whatWouldChangeRecommendation: z.array(z.string()),
});
export type InterviewBriefResult = z.infer<typeof InterviewBriefResultSchema>;

// ---- Founder decisions / emails ----

export const FounderDecisionTypeSchema = z.enum([
  "MOVE_TO_INTERVIEW",
  "DO_NOT_MOVE_FORWARD",
  "HOLD",
  "NEED_MORE_INFO",
]);

export const EmailTypeSchema = z.enum(["INTERVIEW_INVITATION", "REJECTION", "FOLLOW_UP"]);
export const EmailStatusSchema = z.enum(["DRAFT", "READY_TO_SEND", "SENT", "FAILED"]);

export const EmailDraftResultSchema = z.object({
  subject: z.string(),
  body: z.string(),
});
export type EmailDraftResult = z.infer<typeof EmailDraftResultSchema>;
