import type { ParsedCandidateProfile } from "@/lib/types";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
// Deliberately narrow: an Indian mobile is exactly 10 digits starting 6-9,
// with an optional country code and optional internal spacing. The wider
// {8,14}-digit version this replaced would happily match across a PDF
// text-extraction artifact (two overlapping contact-bar text runs merged
// into one digit run) and return a 15-digit "phone number" — see the QA
// pass that found this against real uploaded resumes. Lookaround boundaries
// stop it from matching a *substring* of a longer garbled digit run.
const PHONE_RE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/;
const YEAR_RANGE_RE = /(19|20)\d{2}/g;
const BULLET_LINE_RE = /^[\s]*[•\-–—▪●·]\s*/;
const SECTION_HEADERS = [
  "EXPERIENCE",
  "PROFESSIONAL SUMMARY",
  "SUMMARY",
  "PROFILE",
  "EDUCATION",
  "SKILLS",
  "CERTIFICATIONS",
  "CERTIFICATIONS & TOOLS",
  "CERTIFICATIONS & SKILLS",
  "CERTIFICATIONS & OTHER",
];

function findSectionLines(lines: string[], headerMatch: (l: string) => boolean, stopAtNextHeader = true): string[] {
  const startIdx = lines.findIndex((l) => headerMatch(l.trim()));
  if (startIdx === -1) return [];
  const out: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const upper = line.toUpperCase();
    if (stopAtNextHeader && SECTION_HEADERS.some((h) => upper === h || upper.startsWith(h))) break;
    out.push(line);
  }
  return out;
}

function isHeaderLine(l: string, keywords: string[]): boolean {
  const upper = l.toUpperCase().replace(/[^A-Z& ]/g, "").trim();
  return keywords.some((k) => upper === k || upper.startsWith(k));
}

// Words that mark a line as a job-title/tagline rather than a person's name
// — resume templates commonly put "NAME\nJob Title Tagline\ncontact..." and
// naively taking "the first short line" grabs the tagline instead.
const TITLE_TAGLINE_WORDS = [
  "lead", "manager", "executive", "specialist", "director", "growth", "strategic",
  "marketing", "sales", "engineer", "engineering", "consultant", "analyst", "officer",
  "head of", "product", "operations", "founder", "president", "architect", "designer",
  "developer", "associate", "coordinator", "administrator", "recruiter", "advisor",
];

// Degree/certification acronyms that can otherwise slip through an
// all-caps-word allowance meant for stylized real names (e.g. "RAHUL BOSE").
const DEGREE_ACRONYMS = new Set([
  "pgdm", "mba", "bba", "btech", "mtech", "bca", "mca", "phd", "cfa", "cpa", "bcom", "mcom", "be", "me",
]);

/** Higher is more name-like. 0 or negative means "don't use this as a name." */
function nameLikelihoodScore(line: string): number {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return -1;
  if (/[&·|@()0-9]/.test(line)) return -1;
  const lower = line.toLowerCase();
  if (TITLE_TAGLINE_WORDS.some((w) => lower.includes(w))) return -1;
  if (words.some((w) => DEGREE_ACRONYMS.has(w.toLowerCase().replace(/[^a-z]/g, "")))) return -1;

  // Every word must itself look like a name token — either Title Case
  // ("Rahul") or a short all-caps word consistent with a stylized name
  // ("RAHUL BOSE"), not a mix that suggests an acronym sitting next to
  // regular words (which "PGDM (Full-Time)" would otherwise resemble).
  const allLookLikeNameTokens = words.every((w) => /^[A-Z][a-z]+$/.test(w) || /^[A-Z]{2,}$/.test(w));
  if (!allLookLikeNameTokens) return -1;

  return words.length;
}

/**
 * Some resume templates (confirmed against real uploads — a whole batch of
 * MESA case-study PDFs) render the header/name block in a way that never
 * reaches the plain-text layer, but ALSO print the name a second time in a
 * trailing contact strip near the very end of the document, duplicated with
 * no separator between an all-caps and a Title Case copy — in either order:
 * "DIVYA IYERDivya Iyer" or "Pranav JoshiPRANAV JOSHI". This unwraps that
 * specific duplicate-name artifact. Returns null for anything else (a slug
 * like "vivek-patil-pm" or a plain sentence must not be mistaken for this).
 */
function unwrapDuplicatedContactName(line: string): string | null {
  const trimmed = line.trim();

  // CAPS words are matched with a "not immediately followed by a lowercase
  // letter" guard so the run stops at "PATIL" and doesn't bleed into the
  // "V" of a following "Vivek" (which is also uppercase).
  const capsFirst = trimmed.match(/^(?:[A-Z]+(?![a-z]))(?:\s[A-Z]+(?![a-z])){1,3}/);
  if (capsFirst) {
    const capsName = capsFirst[0];
    const titleCase = capsName
      .split(/\s+/)
      .map((w) => w[0] + w.slice(1).toLowerCase())
      .join(" ");
    if (trimmed.slice(capsName.length).startsWith(titleCase)) return titleCase;
  }

  const titleFirst = trimmed.match(/^(?:[A-Z][a-z]+)(?:\s[A-Z][a-z]+){1,3}/);
  if (titleFirst) {
    const titleName = titleFirst[0];
    const upper = titleName.toUpperCase();
    if (trimmed.slice(titleName.length).startsWith(upper)) return titleName;
  }

  return null;
}

/**
 * Extractive, deterministic parsing of resume free text into structured
 * fields. No AI call here by design — this is the "CONTEXT" stage in the
 * component map, separate from AI scoring. Any field that can't be reliably
 * extracted is returned as null, never guessed.
 */
export function extractCandidateProfile(rawText: string): ParsedCandidateProfile {
  const lines = rawText.split("\n").map((l) => l.replace(/\r/g, ""));
  const nonEmptyLines = lines.map((l) => l.trim()).filter(Boolean);

  const emailMatch = rawText.match(EMAIL_RE);
  const email = emailMatch ? emailMatch[0] : null;

  const phoneMatch = rawText.match(PHONE_RE);
  const phone = phoneMatch ? phoneMatch[0].trim() : null;

  // Name heuristic: among the first few lines, score each candidate line for
  // how name-like it looks (2-4 Title Case words, no job-title vocabulary,
  // no separators) and take the best-scoring one. A tagline like "Strategic
  // & Marketing Lead" sitting where a name would be must NOT win — if
  // nothing scores as name-like, we return null rather than guess wrong,
  // since a wrong name is worse than an honest "not available."
  let name: string | null = null;
  let bestScore = 0;
  for (const line of nonEmptyLines.slice(0, 6)) {
    if (EMAIL_RE.test(line) || PHONE_RE.test(line)) continue;
    if (/linkedin|github|http/i.test(line)) continue;
    if (isHeaderLine(line, SECTION_HEADERS)) continue;
    if (line.length > 60) continue;
    const score = nameLikelihoodScore(line);
    if (score > bestScore) {
      bestScore = score;
      name = line;
    }
  }

  // Fallback: some templates never put a usable name near the top at all,
  // but repeat it near the end instead — either cleanly (a plain name line,
  // caught by the same scorer used above) or garbled/concatenated with no
  // separator (caught by unwrapDuplicatedContactName). Confirmed against a
  // real batch of uploaded resumes that hit both variants.
  if (!name) {
    const trailing = nonEmptyLines.slice(-8);
    // The concatenated-duplicate pattern is checked across ALL trailing
    // lines first — it's a far stronger, more specific signal than the
    // generic name-likelihood score. Checking line-by-line in document
    // order let a false positive win: a trailing skills list line like
    // "Google  Data  Studio" (2-4 Title Case-ish words, nothing to reject
    // it on) scored positively and got picked before the real
    // "Mohit SinghMOHIT SINGH" line two rows later (found in QA).
    for (const line of trailing) {
      const unwrapped = unwrapDuplicatedContactName(line);
      if (unwrapped) {
        name = unwrapped;
        break;
      }
    }
    if (!name) {
      for (const line of trailing) {
        if (EMAIL_RE.test(line) || PHONE_RE.test(line) || /linkedin|github|http/i.test(line)) continue;
        if (line.length <= 60 && nameLikelihoodScore(line) > 0) {
          name = line;
          break;
        }
      }
    }
  }

  const experienceLines = findSectionLines(lines, (l) => isHeaderLine(l, ["EXPERIENCE", "WORK EXPERIENCE"]));
  const educationLines = findSectionLines(lines, (l) => isHeaderLine(l, ["EDUCATION"]));
  const skillsLines = [
    ...findSectionLines(lines, (l) => isHeaderLine(l, ["SKILLS"])),
    ...findSectionLines(lines, (l) => isHeaderLine(l, ["CERTIFICATIONS & TOOLS", "CERTIFICATIONS & SKILLS", "CERTIFICATIONS & OTHER", "CERTIFICATIONS"])),
  ];

  // Role/company header lines inside Experience: heuristically, non-bullet
  // lines that contain a separator like "|" or a middle-dot, and are not
  // pure bullet content.
  const roleCompanyLines = experienceLines.filter(
    (l) => !BULLET_LINE_RE.test(l) && (l.includes("|") || l.includes("·") || l.includes("·"))
  );

  const previousRoles: string[] = [];
  const companies: string[] = [];
  for (const line of roleCompanyLines) {
    const parts = line.split(/\||·/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      previousRoles.push(parts[0]);
      companies.push(parts[1]);
    } else if (parts.length === 1) {
      previousRoles.push(parts[0]);
    }
  }

  const currentRole = previousRoles.length > 0 ? previousRoles[0] : null;

  // Years of experience: prefer an explicit "N years" mention in the top
  // summary; otherwise derive from the spread of years mentioned anywhere.
  let yearsOfExperience: number | null = null;
  const summaryBlock = nonEmptyLines.slice(0, 12).join(" ");
  const explicitYears = summaryBlock.match(/(\d{1,2})\+?\s*years?/i);
  if (explicitYears) {
    yearsOfExperience = parseInt(explicitYears[1], 10);
  } else {
    const years = (rawText.match(YEAR_RANGE_RE) || []).map((y) => parseInt(y, 10));
    if (years.length >= 2) {
      const min = Math.min(...years);
      const max = Math.max(...years);
      if (max > min && max - min < 30) yearsOfExperience = max - min;
    }
  }

  const education = educationLines.filter((l) => !BULLET_LINE_RE.test(l)).slice(0, 5);

  const skills = skillsLines
    .flatMap((l) => l.split(/·|,|•/))
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60);

  return {
    name,
    email,
    phone,
    currentRole,
    previousRoles: Array.from(new Set(previousRoles)).slice(0, 10),
    companies: Array.from(new Set(companies)).slice(0, 10),
    yearsOfExperience,
    education,
    skills: Array.from(new Set(skills)).slice(0, 40),
  };
}

/**
 * Pulls out evidence lines for AI scoring: bullet points, plus the
 * summary/profile paragraph (sentence-split) since candidates often state
 * things like years of experience or working style in prose up top rather
 * than as a bullet.
 */
export function extractResumeBullets(rawText: string): string[] {
  const lines = rawText.split("\n");
  const bullets = lines
    .map((l) => l.trim())
    .filter((l) => BULLET_LINE_RE.test(l))
    .map((l) => l.replace(BULLET_LINE_RE, "").trim())
    .filter((l) => l.length > 10);

  const summaryLines = findSectionLines(lines, (l) => isHeaderLine(l, ["SUMMARY", "PROFILE", "PROFESSIONAL SUMMARY"]));
  const summarySentences = summaryLines
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  return [...bullets, ...summarySentences];
}
