import { describe, it, expect } from "vitest";
import { MockAiProvider } from "@/lib/ai/mock";
import type { HistoricalHireRecord } from "@/lib/types";

const ai = new MockAiProvider();

/**
 * A hand-built golden dataset with a KNOWN correct answer, used only for
 * this test — never written to data/hires/. The production dataset has
 * zero real historical hires (confirmed separately), so this is how the
 * outcome-comparison arithmetic itself gets validated independent of
 * whether real data exists yet.
 *
 * Ground truth we compute BY HAND below, then assert the code matches it —
 * per the QA brief's explicit instruction not to trust the system's own
 * percentages without checking them independently.
 */
function goldenHire(
  id: string,
  outcome: HistoricalHireRecord["outcomeRating"],
  signals: string[]
): HistoricalHireRecord {
  return {
    id,
    name: id,
    role: "PM",
    joinedDate: null,
    applicationSignals: signals,
    interviewSignals: [],
    outcomeRating: outcome,
    rawText: signals.join(" "),
    sourceFile: `${id}.json`,
  };
}

const OWNERSHIP_PHRASE = "Owned the roadmap independently with no committee approval";
const NO_SIGNAL = "Handled routine documentation tasks";

const GOLDEN_HIRES: HistoricalHireRecord[] = [
  goldenHire("h1", "Exceeds Expectations", [OWNERSHIP_PHRASE]),
  goldenHire("h2", "Exceeds Expectations", [OWNERSHIP_PHRASE]),
  goldenHire("h3", "Exceeds Expectations", [NO_SIGNAL]),
  goldenHire("h4", "Meets Expectations", [NO_SIGNAL]),
  goldenHire("h5", "Below Expectations", [NO_SIGNAL]),
];
// Hand-computed ground truth:
//   exceeds total = 3, exceeds-with-signal = 2  -> exceedsRate = 2/3 = 0.667
//   non-exceeds total (meets+below) = 2, with-signal = 0 -> nonExceedsRate = 0
//   differentiation gap = 0.667 - 0 = 0.667  -> >= 0.5  -> "high" confidence
//   sourceCandidates for the signal = exactly [h1, h2] (2 hires), which is
//   >= 3 only if we count total matched hires... note: with n=2 matched
//   hires total, the code's own "insufficient" guard (sourceCandidates.length < 3)
//   should actually fire — this dataset deliberately sits AT that boundary,
//   see the assertion below.

describe("MockAiProvider.analyzeHistoricalHires — golden dataset", () => {
  it("computes ownership-signal prevalence exactly matching hand-calculated counts", async () => {
    const signals = await ai.analyzeHistoricalHires(GOLDEN_HIRES, [{ role: "PM", rawText: "" }]);
    const ownership = signals.find((s) => s.name.toLowerCase().includes("autonomous ownership"));
    expect(ownership).toBeDefined();
    expect(ownership!.sourceCandidates.sort()).toEqual(["h1", "h2"]);
    // Only 2 hires carry the signal — below the code's n>=3 threshold for a
    // confidence rating above "insufficient". This IS the correct call: a
    // 2-hire pattern is too small to call anything but insufficient, even
    // though the raw prevalence gap (0.667 vs 0) looks dramatic. Small-sample
    // discipline (QA section 15) means the gap alone must not be enough.
    expect(ownership!.confidence).toBe("insufficient");
  });

  it("does NOT report a signal for hires where it genuinely isn't present (no false positives)", async () => {
    const signals = await ai.analyzeHistoricalHires(GOLDEN_HIRES, [{ role: "PM", rawText: "" }]);
    // "Handled routine documentation tasks" must not itself register as an
    // ownership/ship-kill/etc. signal — it's neutral filler text.
    for (const s of signals) {
      expect(s.evidenceFromHistoricalData.every((e) => e !== NO_SIGNAL)).toBe(true);
    }
  });

  it("crosses into a non-insufficient confidence once the sample is large enough, with correctly separated groups", async () => {
    // Same shape, scaled up so the >=3-matched-hire and >=2-exceeds
    // thresholds are both cleared, to test the "real" branch of the
    // confidence logic, not just its insufficient-data guard.
    const scaled: HistoricalHireRecord[] = [
      goldenHire("e1", "Exceeds Expectations", [OWNERSHIP_PHRASE]),
      goldenHire("e2", "Exceeds Expectations", [OWNERSHIP_PHRASE]),
      goldenHire("e3", "Exceeds Expectations", [OWNERSHIP_PHRASE]),
      goldenHire("e4", "Exceeds Expectations", [NO_SIGNAL]),
      goldenHire("m1", "Meets Expectations", [NO_SIGNAL]),
      goldenHire("m2", "Meets Expectations", [NO_SIGNAL]),
      goldenHire("b1", "Below Expectations", [NO_SIGNAL]),
    ];
    // Hand-computed: exceedsRate = 3/4 = 0.75, nonExceedsRate = 0/3 = 0,
    // gap = 0.75 >= 0.5 -> "high". sourceCandidates.length = 3 (e1,e2,e3),
    // which clears the n>=3 guard this time.
    const signals = await ai.analyzeHistoricalHires(scaled, [{ role: "PM", rawText: "" }]);
    const ownership = signals.find((s) => s.name.toLowerCase().includes("autonomous ownership"));
    expect(ownership!.sourceCandidates.sort()).toEqual(["e1", "e2", "e3"]);
    expect(ownership!.confidence).toBe("high");
  });

  it("returns strictly nothing when there are zero historical hires — never fabricates a pattern", async () => {
    const signals = await ai.analyzeHistoricalHires([], [{ role: "PM", rawText: "" }]);
    expect(signals).toEqual([]);
  });
});
