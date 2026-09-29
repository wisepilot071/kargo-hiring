import { describe, it, expect } from "vitest";
import { extractCandidateProfile, extractResumeBullets } from "@/lib/parsers/candidate";
import { parseJdRequirements } from "@/lib/parsers/jd";

const SAMPLE_RESUME = `Jane Doe
jane.doe@example.com | +91 98765 43210 | Bengaluru
Summary
Product Manager with 3 years of experience shipping B2B SaaS features. Comfortable operating without structure.
Experience
Product Manager | Acme Logistics Pvt Ltd | Jan 2022 - Present
— Owned the onboarding roadmap independently, shipped 5 features and killed 2 based on usage data
— Reduced time-to-value by 40% through a redesigned onboarding flow
Education
B.Tech, Computer Science | IIT Bombay | 2015-2019
Skills
SQL, Figma, Jira, Mixpanel
`;

describe("extractCandidateProfile", () => {
  it("extracts name, email, phone without inventing missing fields", () => {
    const profile = extractCandidateProfile(SAMPLE_RESUME);
    expect(profile.name).toBe("Jane Doe");
    expect(profile.email).toBe("jane.doe@example.com");
    expect(profile.phone).toContain("98765");
  });

  it("returns null (not a guess) for fields it cannot find", () => {
    const noPhone = SAMPLE_RESUME.replace("+91 98765 43210 | ", "");
    const profile = extractCandidateProfile(noPhone);
    expect(profile.phone).toBeNull();
  });

  it("rejects a corrupted/overlapping digit run rather than returning a malformed phone number", () => {
    // Reproduces an actual PDF text-extraction artifact found in QA: two
    // overlapping contact-bar text runs merge into one long digit blob.
    // A 15-digit "phone number" is worse than none — must return null.
    const corrupted = "squad_1@pg27.mesaschool.co+91 98202 1134598202 11345rohan-mehta";
    const profile = extractCandidateProfile(`Rohan Mehta\n${corrupted}\n`);
    expect(profile.phone).toBeNull();
  });

  it("still extracts a clean 10-digit Indian mobile number correctly", () => {
    const profile = extractCandidateProfile(SAMPLE_RESUME);
    expect(profile.phone).toBe("+91 98765 43210");
  });

  it("recovers the name from a trailing contact block when nothing usable exists near the top (CAPS+TitleCase order)", () => {
    // Reproduces a real uploaded resume template: header name never reaches
    // the text layer at all, but it's repeated (garbled, no separator)
    // near the very end, in this order.
    const trailingCapsFirst = `Strategic & Marketing Lead
Summary
A product person with experience shipping things.
Experience
— Did some stuff
EDUCATION
Some University 2018 - 2022
DIVYA IYERDivya Iyer
squad_4@pg27.mesaschool.co+91 98461 7203598461 72035divya-iyer-pm
`;
    const profile = extractCandidateProfile(trailingCapsFirst);
    expect(profile.name).toBe("Divya Iyer");
  });

  it("recovers the name from a trailing contact block in the reverse order (TitleCase+CAPS)", () => {
    const trailingTitleFirst = `Associate Product Manager
Summary
Built things.
Experience
— Did some stuff
EDUCATION
Some University 2018 - 2022
Pranav JoshiPRANAV JOSHI
squad_4@pg27.mesaschool.co
+91 99014 3718299014 37182
`;
    const profile = extractCandidateProfile(trailingTitleFirst);
    expect(profile.name).toBe("Pranav Joshi");
  });

  it("prefers the trailing concatenated-name pattern over a coincidentally name-shaped skills line (regression)", () => {
    // Found in QA: a trailing skills list line ("Google  Data  Studio" — 3
    // Title-Case-ish words, nothing to reject it on) scored positively and
    // was picked before the real duplicated-name line two rows later.
    const skillsLineFalsePositive = `Strategic Ops Lead
Summary
Ops person.
Experience
— Did ops things
SKILLS
BigQuery
Google  Data  Studio
Tableau
Mohit SinghMOHIT SINGH
squad_3@pg27.mesaschool.co+91 97650 8231997650 82319
`;
    const profile = extractCandidateProfile(skillsLineFalsePositive);
    expect(profile.name).toBe("Mohit Singh");
  });

  it("does not mistake a job-title tagline for the candidate's name", () => {
    // Common PDF-template failure mode: the real name renders as a graphic
    // and never reaches the text layer, leaving a tagline as the first line.
    const taglineFirst = `Strategic & Marketing Lead
A Marketer with 8+ years of experience.
Experience
— Led brand strategy for 5 consumer products
`;
    const profile = extractCandidateProfile(taglineFirst);
    expect(profile.name).toBeNull();
  });

  it("does not mistake a degree acronym under an EDUCATION header for the name", () => {
    const degreeOnly = `Strategy & Operations Leader | Corporate Strategy
EDUCATION
PGDM (Full-Time)
`;
    const profile = extractCandidateProfile(degreeOnly);
    expect(profile.name).toBeNull();
  });

  it("still recognizes a real stylized all-caps name (e.g. 'RAHUL BOSE')", () => {
    const capsName = `RAHUL BOSE
Growth & Marketing Leader
rahul.bose@example.com
`;
    const profile = extractCandidateProfile(capsName);
    expect(profile.name).toBe("RAHUL BOSE");
  });

  it("extracts previous roles and companies from the experience section", () => {
    const profile = extractCandidateProfile(SAMPLE_RESUME);
    expect(profile.previousRoles.length).toBeGreaterThan(0);
    expect(profile.companies.some((c) => c.includes("Acme"))).toBe(true);
  });
});

describe("extractResumeBullets", () => {
  it("includes both bullet lines and summary-paragraph sentences as evidence", () => {
    const bullets = extractResumeBullets(SAMPLE_RESUME);
    expect(bullets.some((b) => b.includes("Owned the onboarding roadmap"))).toBe(true);
    expect(bullets.some((b) => b.includes("Comfortable operating without structure"))).toBe(true);
  });
});

const SAMPLE_JD = `Product Manager
What You'll Own
— The product roadmap for our core platform
What We're Looking For
— 2-4 years of product management experience
— ideally at a company building for the first time
— Mumbai-based or willing to relocate
What Success Looks Like at 6 Months
— You have shipped at least two features customers use unprompted
`;

describe("parseJdRequirements", () => {
  it("classifies a plain 'years of experience' bullet as essential", () => {
    const reqs = parseJdRequirements(SAMPLE_JD);
    const years = reqs.find((r) => r.jdEvidence.includes("2-4 years"));
    expect(years?.type).toBe("essential");
  });

  it("classifies a softened 'ideally' bullet as important, not essential", () => {
    const reqs = parseJdRequirements(SAMPLE_JD);
    const ideally = reqs.find((r) => r.jdEvidence.includes("ideally"));
    expect(ideally?.type).toBe("important");
  });

  it("classifies a location bullet as contextual", () => {
    const reqs = parseJdRequirements(SAMPLE_JD);
    const location = reqs.find((r) => r.jdEvidence.includes("Mumbai-based"));
    expect(location?.type).toBe("contextual");
  });

  it("pulls ownership bullets in as essential requirements", () => {
    const reqs = parseJdRequirements(SAMPLE_JD);
    expect(reqs.some((r) => r.jdEvidence.includes("product roadmap") && r.type === "essential")).toBe(true);
  });

  it("does not chop a compound-word hyphen out of the short label (regression)", () => {
    // Found in QA: splitting the display label on a bare "-" turned
    // "Mumbai-based or willing to relocate" into just "Mumbai", and
    // "early-stage company" into "early" — losing real requirement text
    // from the label a founder actually reads (the full jdEvidence was
    // always intact; only the short label was broken).
    const jdWithCompoundWords = `Senior Product Manager
What We're Looking For
— Time spent at an early-stage company, or strong evidence of ambiguity
— Mumbai-based or willing to relocate
`;
    const reqs = parseJdRequirements(jdWithCompoundWords);
    const earlyStage = reqs.find((r) => r.jdEvidence.includes("early-stage"));
    expect(earlyStage?.requirement).toContain("early-stage");
    const location = reqs.find((r) => r.jdEvidence.includes("Mumbai-based"));
    expect(location?.requirement).toBe("Mumbai-based or willing to relocate");
  });

  it("truncates an overly long label at a word boundary with an ellipsis, not mid-word", () => {
    const bulletText =
      "The engineering team knows exactly what they are building three full sprints out into the future without any ambiguity whatsoever";
    const longJd = `Product Manager
What Success Looks Like at 6 Months
— ${bulletText}
`;
    const reqs = parseJdRequirements(longJd);
    const label = reqs[0].requirement.replace("Success signal: ", "");
    expect(label.endsWith("…")).toBe(true);
    const withoutEllipsis = label.slice(0, -1);
    // A clean word-boundary cut means "<label> " (with a trailing space) is
    // itself found in the source bullet — a mid-word cut would not be.
    expect(bulletText.startsWith(withoutEllipsis + " ") || bulletText === withoutEllipsis).toBe(true);
  });
});
