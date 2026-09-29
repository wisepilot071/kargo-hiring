import { describe, it, expect } from "vitest";
import { MockAiProvider } from "@/lib/ai/mock";
import type { HiringCriterion, SanitizedCandidateProfile } from "@/lib/types";

const ai = new MockAiProvider();

const RUBRIC: HiringCriterion[] = [
  {
    id: "pm-1",
    role: "PM",
    name: "Product ownership",
    description: "Owned a product area's roadmap and prioritization decisions independently",
    weight: 50,
    type: "essential",
    jdImportance: "high",
    evidence: [],
    confidence: "medium",
    sourceCandidates: [],
  },
  {
    id: "pm-2",
    role: "PM",
    name: "Customer discovery ground level",
    description: "Direct discovery with daily users of the product",
    weight: 50,
    type: "essential",
    jdImportance: "high",
    evidence: [],
    confidence: "medium",
    sourceCandidates: [],
  },
];

function profile(bullets: string[]): SanitizedCandidateProfile {
  return {
    appliedRole: "PM",
    currentRole: "Product Manager",
    previousRoles: ["Product Manager"],
    companies: ["Acme"],
    yearsOfExperience: 3,
    education: [],
    skills: [],
    resumeBullets: bullets,
  };
}

describe("MockAiProvider.evaluateCandidate", () => {
  it("scores 0 with an explicit gap when there is no supporting evidence at all", async () => {
    const result = await ai.evaluateCandidate(profile(["Managed office supplies budget"]), [], RUBRIC, []);
    const ownership = result.criteria.find((c) => c.criterionId === "pm-1")!;
    expect(ownership.score).toBe(0);
    expect(ownership.gaps.length).toBeGreaterThan(0);
  });

  it("scores a single specific ownership statement as moderate evidence, not zero", async () => {
    const result = await ai.evaluateCandidate(
      profile([
        "Owned the roadmap and prioritization decisions for the onboarding product area independently, with no senior PM above signing off",
        "Reduced churn by 18% after redesigning the onboarding flow",
      ]),
      [],
      RUBRIC,
      []
    );
    const ownership = result.criteria.find((c) => c.criterionId === "pm-1")!;
    // A single, unquantified — but specific and first-person — ownership
    // claim is real evidence, but not "strong" on its own (no second
    // instance, no measured outcome attached to it specifically).
    expect(ownership.score).toBeGreaterThanOrEqual(2);
    expect(ownership.evidence.length).toBeGreaterThan(0);
    expect(ownership.evidence[0]).toContain("roadmap");
  });

  it("scores 4 when multiple examples corroborate a criterion and at least one is quantified", async () => {
    const result = await ai.evaluateCandidate(
      profile([
        "Owned the roadmap and prioritization decisions for the onboarding product area independently",
        "Independently owned prioritization tradeoffs across the platform, reducing time-to-ship by 30%",
      ]),
      [],
      RUBRIC,
      []
    );
    const ownership = result.criteria.find((c) => c.criterionId === "pm-1")!;
    expect(ownership.score).toBe(4);
  });

  it("marks confidence insufficient when the resume has almost no bullet-level text", async () => {
    const result = await ai.evaluateCandidate(profile(["One line only"]), [], RUBRIC, []);
    expect(result.confidence).toBe("insufficient");
    expect(result.recommendation).toBe("insufficient_evidence");
  });

  it("never fabricates a rubric when the role has none — returns insufficient evidence instead", async () => {
    const result = await ai.evaluateCandidate(profile(["Anything"]), [], [], []);
    expect(result.recommendation).toBe("insufficient_evidence");
    expect(result.criteria).toHaveLength(0);
  });

  it("states plainly when no historical hire data is available, rather than pretending calibration happened", async () => {
    const result = await ai.evaluateCandidate(
      profile(["Owned the roadmap and prioritization decisions independently for a key product area"]),
      [],
      RUBRIC,
      []
    );
    expect(result.reasoning.some((r) => r.toLowerCase().includes("no kargo historical hire data"))).toBe(true);
  });
});

describe("MockAiProvider.analyzeHistoricalHires", () => {
  it("returns no signals when there are zero historical hires, rather than inventing patterns", async () => {
    const signals = await ai.analyzeHistoricalHires([], [{ role: "PM", rawText: "" }]);
    expect(signals).toEqual([]);
  });
});
