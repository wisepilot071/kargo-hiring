import { describe, it, expect } from "vitest";
import { fingerprintCriteria } from "@/lib/scoring/versioning";

describe("fingerprintCriteria", () => {
  it("is identical for the same criteria regardless of array order (order must not spuriously bump the version)", () => {
    const a = [
      { name: "X", weight: 10, type: "essential" as const, confidence: "medium" as const },
      { name: "Y", weight: 20, type: "important" as const, confidence: "high" as const },
    ];
    const b = [a[1], a[0]];
    expect(fingerprintCriteria(a)).toBe(fingerprintCriteria(b));
  });

  it("changes when a weight changes (a real benchmark change must be detected)", () => {
    const a = [{ name: "X", weight: 10, type: "essential" as const, confidence: "medium" as const }];
    const b = [{ name: "X", weight: 15, type: "essential" as const, confidence: "medium" as const }];
    expect(fingerprintCriteria(a)).not.toBe(fingerprintCriteria(b));
  });

  it("changes when a criterion is added or removed", () => {
    const a = [{ name: "X", weight: 10, type: "essential" as const, confidence: "medium" as const }];
    const b = [
      { name: "X", weight: 10, type: "essential" as const, confidence: "medium" as const },
      { name: "Y", weight: 5, type: "important" as const, confidence: "low" as const },
    ];
    expect(fingerprintCriteria(a)).not.toBe(fingerprintCriteria(b));
  });

  it("is empty-but-stable for an empty rubric", () => {
    expect(fingerprintCriteria([])).toBe("");
  });
});
