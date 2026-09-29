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

export type HistoricalSignal = {
  name: string;
  description: string;
  evidenceFromHistoricalData: string[];
  confidence: "high" | "medium" | "low" | "insufficient";
  sourceCandidates: string[]; // historical hire ids
  roleRelevance: RoleT | "both";
};

export type EmailDraftInput = {
  type: "INTERVIEW_INVITATION" | "REJECTION" | "FOLLOW_UP";
  candidateName: string | null;
  appliedRole: RoleT;
  founderNote: string | null;
  topStrengths: string[];
};

export interface AiProvider {
  readonly name: string;

  /** STAGE 1: derive recurring signals from historical hires, calibrated by outcome. */
  analyzeHistoricalHires(
    hires: HistoricalHireRecord[],
    jds: { role: RoleT; rawText: string }[]
  ): Promise<HistoricalSignal[]>;

  /** JD parsing: turn raw JD text into a role requirement matrix. Not hard-coded — derived per call. */
  parseJobDescription(role: RoleT, rawText: string): Promise<RoleRequirement[]>;

  /** STAGE 2: build a role-specific rubric from JD requirements + historical signals. */
  generateRubric(
    role: RoleT,
    requirements: RoleRequirement[],
    signals: HistoricalSignal[]
  ): Promise<HiringCriterion[]>;

  /** STAGE 3: score one candidate against the rubric + signals, using only sanitized (no-PII) evidence. */
  evaluateCandidate(
    profile: SanitizedCandidateProfile,
    requirements: RoleRequirement[],
    rubric: HiringCriterion[],
    signals: HistoricalSignal[]
  ): Promise<CandidateEvaluationResult>;

  /** STAGE 4: interview brief from the evaluation + evidence. */
  generateInterviewBrief(
    profile: SanitizedCandidateProfile,
    evaluation: CandidateEvaluationResult
  ): Promise<InterviewBriefResult>;

  /** STAGE 5: editable email draft. Never sent from here — draft only. */
  generateEmailDraft(input: EmailDraftInput): Promise<EmailDraftResult>;
}
