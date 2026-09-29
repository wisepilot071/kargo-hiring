import { describe, it, expect } from "vitest";
import { buildSanitizedProfile } from "@/lib/scoring/sanitize";
import type { ParsedCandidateProfile } from "@/lib/types";

const PARSED: ParsedCandidateProfile = {
  name: "Jane Doe",
  email: "jane.doe@example.com",
  phone: "+91 98765 43210",
  currentRole: "Product Manager",
  previousRoles: ["Product Manager"],
  companies: ["Acme Logistics"],
  yearsOfExperience: 3,
  education: ["B.Tech, IIT Bombay"],
  skills: ["SQL", "Figma"],
};

describe("buildSanitizedProfile", () => {
  it("never includes name, email, or phone fields in the AI-facing object", () => {
    const sanitized = buildSanitizedProfile(PARSED, "PM", ["did a thing"]);
    const json = JSON.stringify(sanitized);
    expect(json).not.toContain("Jane Doe");
    expect(json).not.toContain("jane.doe@example.com");
    expect(json).not.toContain("98765");
    // Confirms these are structurally absent, not just blanked, i.e. the
    // sanitized object literally has no key for them.
    expect(Object.keys(sanitized)).not.toContain("name");
    expect(Object.keys(sanitized)).not.toContain("email");
    expect(Object.keys(sanitized)).not.toContain("phone");
  });

  it("carries forward job-relevant fields evaluation actually needs", () => {
    const sanitized = buildSanitizedProfile(PARSED, "PM", ["did a thing"]);
    expect(sanitized.currentRole).toBe("Product Manager");
    expect(sanitized.skills).toContain("SQL");
    expect(sanitized.resumeBullets).toContain("did a thing");
  });
});
