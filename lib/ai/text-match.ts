const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "at", "by", "from",
  "that", "this", "what", "you", "youll", "we", "our", "is", "are", "be", "as", "it", "its",
  "not", "no", "your", "their", "they", "will", "can", "have", "has", "how",
  "product", "role", "years", "there", "first", "already", "rather", "ideally",
  "building", "company", "exists", "maintaining", "genuine", "strong", "clear",
  "evidence", "experience", "someone", "something", "environments", "makes",
]);

/**
 * Extracts meaningful, matchable terms from a criterion's own JD-derived
 * text. Terms must be >=6 characters — short generic words ("first",
 * "time") produced too many coincidental matches unrelated to the actual
 * requirement, which is exactly the superficial keyword-matching failure
 * mode this system is meant to avoid.
 */
export function extractSignificantTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const terms = words.filter((w) => w.length >= 6 && !STOPWORDS.has(w));
  return Array.from(new Set(terms));
}

/**
 * Finds resume evidence lines that overlap with a criterion's own
 * significant terms. Returns matches sorted by overlap strength (best
 * evidence first), not by document order.
 */
export function findEvidenceByTerms(evidenceLines: string[], terms: string[]): string[] {
  if (terms.length === 0) return [];
  const scored = evidenceLines
    .map((line) => {
      const lower = line.toLowerCase();
      const hits = terms.filter((t) => lower.includes(t));
      return { line, hits };
    })
    // A single coincidental overlap on a merely long-ish word is too weak to
    // count as evidence; require 2+ overlapping terms, or one long/specific
    // one (>=9 chars, e.g. "integration", "onboarding").
    .filter((x) => x.hits.length >= 2 || x.hits.some((t) => t.length >= 9))
    .sort((a, b) => b.hits.length - a.hits.length);
  return scored.map((x) => x.line);
}
