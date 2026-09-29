import { describe, it, expect } from "vitest";
import { MockAiProvider } from "@/lib/ai/mock";

const ai = new MockAiProvider();

describe("MockAiProvider.generateEmailDraft", () => {
  it("does not fabricate a rejection reason when the founder gave none", async () => {
    const draft = await ai.generateEmailDraft({
      type: "REJECTION",
      candidateName: "Jane Doe",
      appliedRole: "PM",
      founderNote: null,
      topStrengths: [],
    });
    expect(draft.body).not.toMatch(/because you|due to your/i);
    expect(draft.body.toLowerCase()).toContain("decided not to move forward");
  });

  it("includes the founder's real note verbatim when one is given", async () => {
    const draft = await ai.generateEmailDraft({
      type: "REJECTION",
      candidateName: "Jane Doe",
      appliedRole: "PM",
      founderNote: "We went with a candidate with more platform experience.",
      topStrengths: [],
    });
    expect(draft.body).toContain("We went with a candidate with more platform experience.");
  });

  it("never promises employment in an interview invitation", async () => {
    const draft = await ai.generateEmailDraft({
      type: "INTERVIEW_INVITATION",
      candidateName: "Jane Doe",
      appliedRole: "SPM",
      founderNote: null,
      topStrengths: ["Product ownership: owned the roadmap independently"],
    });
    expect(draft.body).not.toMatch(/we are pleased to offer|welcome to the team/i);
    expect(draft.body).toContain("interview");
  });

  it("falls back to a neutral greeting when the candidate's name wasn't extractable", async () => {
    const draft = await ai.generateEmailDraft({
      type: "FOLLOW_UP",
      candidateName: null,
      appliedRole: "PM",
      founderNote: null,
      topStrengths: [],
    });
    expect(draft.body.startsWith("Hello,")).toBe(true);
  });
});
