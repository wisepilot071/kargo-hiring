import type { RoleRequirement } from "@/lib/types";

const OWNERSHIP_HEADERS = ["what you'll own", "what youll own", "responsibilities"];
const LOOKING_FOR_HEADERS = ["what we're looking for", "what were looking for", "requirements", "qualifications"];
const SUCCESS_HEADERS = ["what success looks like"];
const CONTEXT_HEADERS = ["about", "why this role exists", "what kargo offers", "offers"];

function splitIntoSections(rawText: string): { header: string; bullets: string[] }[] {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const sections: { header: string; bullets: string[] }[] = [];
  let current: { header: string; bullets: string[] } | null = null;

  const isBullet = (l: string) => /^[—\-–•▪●·]/.test(l);
  const isLikelyHeader = (l: string) =>
    !isBullet(l) && l.length < 60 && !/[.?!]$/.test(l) && !/@/.test(l);

  for (const line of lines) {
    if (isLikelyHeader(line)) {
      current = { header: line.toLowerCase(), bullets: [] };
      sections.push(current);
    } else if (isBullet(line) && current) {
      current.bullets.push(line.replace(/^[—\-–•▪●·]\s*/, "").trim());
    } else if (current && !isBullet(line)) {
      // Wrapped continuation of the previous bullet, or a header's own
      // descriptive sentence — append to the last bullet if one exists.
      if (current.bullets.length > 0) {
        current.bullets[current.bullets.length - 1] += " " + line;
      }
    }
  }
  return sections;
}

function matchesAny(header: string, needles: string[]): boolean {
  return needles.some((n) => header.includes(n));
}

/**
 * Builds a short display label from a full JD bullet. Splits only on commas
 * and the em-dash clause separator ("—") this JD's style actually uses —
 * NOT a bare hyphen, which shows up inside ordinary compound words
 * ("early-stage", "Mumbai-based", "operations-heavy") and was previously
 * chopping labels at nonsense points (e.g. the whole label becoming just
 * "Mumbai"). If no clause separator exists early enough, truncates at the
 * last full word within maxLen and marks it with an ellipsis rather than
 * cutting off mid-word with no indication anything was cut.
 */
function shortLabel(text: string, maxLen: number): string {
  const clause = text.split(/[,—]/)[0].trim();
  if (clause.length <= maxLen) return clause;
  const truncated = clause.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

function classifyLookingForBullet(bullet: string): "essential" | "important" | "preferred" | "contextual" {
  const lower = bullet.toLowerCase();
  if (/mumbai-based|willing to relocate|in-office/.test(lower)) return "contextual";
  if (/ideally|genuine advantage|genuine curiosity|or strong evidence|not a nice-to-have/.test(lower)) {
    return "important";
  }
  if (/nice.to.have|bonus|preferred/.test(lower)) return "preferred";
  return "essential";
}

/**
 * Extracts a role requirement matrix from raw JD free text using section +
 * language-cue heuristics, per the actual document supplied at parse time —
 * nothing here is a fixed list of PM/SPM requirements.
 */
export function parseJdRequirements(rawText: string): RoleRequirement[] {
  const sections = splitIntoSections(rawText);
  const requirements: RoleRequirement[] = [];

  for (const section of sections) {
    if (matchesAny(section.header, OWNERSHIP_HEADERS)) {
      for (const bullet of section.bullets) {
        requirements.push({
          requirement: shortLabel(bullet.split(":")[0], 80),
          type: "essential",
          definition: bullet,
          jdEvidence: bullet,
        });
      }
    } else if (matchesAny(section.header, LOOKING_FOR_HEADERS)) {
      for (const bullet of section.bullets) {
        requirements.push({
          requirement: shortLabel(bullet, 80),
          type: classifyLookingForBullet(bullet),
          definition: bullet,
          jdEvidence: bullet,
        });
      }
    } else if (matchesAny(section.header, SUCCESS_HEADERS)) {
      for (const bullet of section.bullets) {
        requirements.push({
          requirement: `Success signal: ${shortLabel(bullet, 60)}`,
          type: "essential",
          definition: bullet,
          jdEvidence: bullet,
        });
      }
    } else if (matchesAny(section.header, CONTEXT_HEADERS)) {
      // Context only — not scored requirements. Skipped intentionally.
      continue;
    }
  }

  return requirements;
}
