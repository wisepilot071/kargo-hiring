import type { z } from "zod";
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
import {
  CandidateEvaluationResultSchema,
  InterviewBriefResultSchema,
  EmailDraftResultSchema,
} from "@/lib/types";
import type { AiProvider, HistoricalSignal, EmailDraftInput } from "@/lib/ai/types";
import { parseJdRequirements } from "@/lib/parsers/jd";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929";

async function callClaude(system: string, prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") throw new Error("Anthropic response had no text content");
  return text;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw);
}

/** Calls Claude, validates against `schema`, retries once with the validation error appended. */
async function callAndValidate<T>(system: string, prompt: string, schema: z.ZodType<T>): Promise<T> {
  const first = await callClaude(system, prompt);
  try {
    return schema.parse(extractJson(first));
  } catch (err) {
    const retryPrompt = `${prompt}\n\nYour previous response failed schema validation with this error:\n${
      err instanceof Error ? err.message : String(err)
    }\n\nReturn ONLY valid JSON matching the required schema, no prose, no markdown fences.`;
    const second = await callClaude(system, retryPrompt);
    return schema.parse(extractJson(second));
  }
}

const JSON_ONLY = "You are a hiring-evidence analysis engine. Respond with ONLY valid JSON — no prose, no markdown fences, no commentary. Never invent facts not present in the supplied text. If evidence is missing, say so explicitly in the relevant field rather than fabricating it.";

export class AnthropicAiProvider implements AiProvider {
  readonly name = "anthropic";

  async parseJobDescription(_role: RoleT, rawText: string): Promise<RoleRequirement[]> {
    // JD parsing is kept deterministic/extractive even in "real" mode — it's
    // a structural task, not a judgment task, and the heuristic parser is
    // reliable for well-formed JDs. Swap to an LLM call here if JD formats
    // become too varied for the heuristic to handle.
    return parseJdRequirements(rawText);
  }

  async analyzeHistoricalHires(
    hires: HistoricalHireRecord[],
    jds: { role: RoleT; rawText: string }[]
  ): Promise<HistoricalSignal[]> {
    if (hires.length === 0) return [];
    const prompt = `Analyze these historical hire records for a company, and the job descriptions for context. Identify recurring, job-relevant signals among people who performed well, and note whether the signal also appears among Meets/Below performers (differentiation). Do not invent signals not supported by the text. Return JSON: an array of {name, description, evidenceFromHistoricalData: string[] (verbatim quotes only), confidence: "high"|"medium"|"low"|"insufficient", sourceCandidates: string[] (hire ids), roleRelevance: "PM"|"SPM"|"both"}.\n\nJob descriptions:\n${JSON.stringify(jds)}\n\nHistorical hires:\n${JSON.stringify(hires)}`;
    const { z } = await import("zod");
    const schema = z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        evidenceFromHistoricalData: z.array(z.string()),
        confidence: z.enum(["high", "medium", "low", "insufficient"]),
        sourceCandidates: z.array(z.string()),
        roleRelevance: z.enum(["PM", "SPM", "both"]),
      })
    );
    return callAndValidate(JSON_ONLY, prompt, schema);
  }

  async generateRubric(
    role: RoleT,
    requirements: RoleRequirement[],
    signals: HistoricalSignal[]
  ): Promise<HiringCriterion[]> {
    const prompt = `Build a weighted hiring rubric for the ${role} role from these JD requirements and historical hiring signals. Weights must sum to 100. Do not manufacture criteria unsupported by the input. Return JSON array of {id, role, name, description, weight, type: "essential"|"important"|"historical"|"differentiating", jdImportance: "high"|"medium"|"low"|"none", evidence: string[], confidence: "high"|"medium"|"low"|"insufficient", sourceCandidates: string[]}.\n\nRequirements:\n${JSON.stringify(requirements)}\n\nHistorical signals:\n${JSON.stringify(signals)}`;
    const { z } = await import("zod");
    const schema = z.array(
      z.object({
        id: z.string(),
        role: z.enum(["PM", "SPM"]),
        name: z.string(),
        description: z.string(),
        weight: z.number(),
        type: z.enum(["essential", "important", "historical", "differentiating"]),
        jdImportance: z.enum(["high", "medium", "low", "none"]),
        evidence: z.array(z.string()),
        confidence: z.enum(["high", "medium", "low", "insufficient"]),
        sourceCandidates: z.array(z.string()),
      })
    );
    return callAndValidate(JSON_ONLY, prompt, schema);
  }

  async evaluateCandidate(
    profile: SanitizedCandidateProfile,
    requirements: RoleRequirement[],
    rubric: HiringCriterion[],
    signals: HistoricalSignal[]
  ): Promise<CandidateEvaluationResult> {
    const prompt = `Score this sanitized candidate profile (no name/email/phone — do not attempt to infer identity or any protected characteristic) against the rubric below. Use ONLY evidence present in resumeBullets. Score each criterion 0-4 and quote evidence verbatim. If no evidence exists for a criterion, score 0 and say so in gaps. Return JSON matching the required schema exactly.\n\nRole requirements:\n${JSON.stringify(requirements)}\n\nRubric:\n${JSON.stringify(rubric)}\n\nHistorical signals:\n${JSON.stringify(signals)}\n\nCandidate profile:\n${JSON.stringify(profile)}`;
    return callAndValidate(JSON_ONLY, prompt, CandidateEvaluationResultSchema);
  }

  async generateInterviewBrief(
    profile: SanitizedCandidateProfile,
    evaluation: CandidateEvaluationResult
  ): Promise<InterviewBriefResult> {
    const prompt = `Write an interview brief for a founder to use, based only on this candidate evaluation. Do not recommend a hiring decision — only prepare the founder to probe the gaps. Return JSON matching the required schema.\n\nProfile:\n${JSON.stringify(profile)}\n\nEvaluation:\n${JSON.stringify(evaluation)}`;
    return callAndValidate(JSON_ONLY, prompt, InterviewBriefResultSchema);
  }

  async generateEmailDraft(input: EmailDraftInput): Promise<EmailDraftResult> {
    const prompt = `Draft a ${input.type} email for a candidate. Use only the facts given below — do not invent achievements, do not promise employment, do not fabricate a rejection reason if none is given. Return JSON {subject, body}.\n\nInput:\n${JSON.stringify(input)}`;
    return callAndValidate(JSON_ONLY, prompt, EmailDraftResultSchema);
  }
}
