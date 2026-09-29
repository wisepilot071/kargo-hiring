import { describe, it, expect } from "vitest";
import { MockAiProvider } from "@/lib/ai/mock";
import type { RoleRequirement } from "@/lib/types";

const ai = new MockAiProvider();

function req(requirement: string, type: RoleRequirement["type"]): RoleRequirement {
  return { requirement, type, definition: requirement, jdEvidence: requirement };
}

describe("MockAiProvider.generateRubric — weight normalization", () => {
  it("always sums to exactly 100, regardless of how the per-criterion rounding falls", async () => {
    // A count of requirements chosen because it doesn't divide evenly into
    // 100 — this is exactly the shape that previously produced 99.6/100.6
    // (found in QA against the real PM/SPM JDs, which have 12 and 14
    // scored criteria respectively).
    const requirements: RoleRequirement[] = [
      req("Owns roadmap", "essential"),
      req("Ships and kills features", "essential"),
      req("Customer discovery", "essential"),
      req("Engineering collaboration", "essential"),
      req("Builds process from zero", "essential"),
      req("2-4 years experience", "essential"),
      req("Comfort without structure", "essential"),
      req("0-to-1 company experience", "important"),
      req("Ground-level curiosity", "important"),
      req("Logistics domain", "important"),
      req("Mumbai based", "contextual"),
    ];
    const rubric = await ai.generateRubric("PM", requirements, []);
    const sum = Math.round(rubric.reduce((s, c) => s + c.weight, 0) * 10) / 10;
    expect(sum).toBe(100);
  });

  it("matches the real PM job description's actual criteria count (regression for the 99.6 bug)", async () => {
    const { parseJdRequirements } = await import("@/lib/parsers/jd");
    const { readFile } = await import("fs/promises");
    const { parseDocumentToText } = await import("@/lib/parsers/document");
    const path = await import("path");
    const jdPath = path.join(process.cwd(), "data", "jds", "PM.docx");
    const doc = await parseDocumentToText(jdPath);
    if (doc.status !== "OK") return; // file not present in this environment; other tests cover the logic directly
    const requirements = parseJdRequirements(doc.text);
    const rubric = await ai.generateRubric("PM", requirements, []);
    const sum = Math.round(rubric.reduce((s, c) => s + c.weight, 0) * 10) / 10;
    expect(sum).toBe(100);
  });

  it("returns an empty rubric (not a fabricated one) when there are no scorable requirements", async () => {
    const rubric = await ai.generateRubric("PM", [req("Mumbai based", "contextual")], []);
    expect(rubric).toEqual([]);
  });
});
