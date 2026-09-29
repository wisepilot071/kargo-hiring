type Tone = "strong" | "moderate" | "weak" | "neutral" | "brand";

const TONE_DOT: Record<Tone, string> = {
  strong: "bg-signal-strong",
  moderate: "bg-signal-moderate",
  weak: "bg-signal-weak",
  neutral: "bg-ink-400",
  brand: "bg-brand-400",
};

const TONE_STYLE: Record<Tone, string> = {
  strong: "border-signal-strong/20 bg-signal-strongBg text-signal-strong",
  moderate: "border-signal-moderate/20 bg-signal-moderateBg text-signal-moderate",
  weak: "border-signal-weak/20 bg-signal-weakBg text-signal-weak",
  neutral: "border-black/10 bg-black/[0.03] text-ink-300",
  brand: "border-brand-500/25 bg-brand-500/10 text-brand-600",
};

/** Status is always conveyed with a label, not color alone (dot is supplementary). */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span className={`badge ${TONE_STYLE[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
      {label}
    </span>
  );
}

export function recommendationTone(rec: string): Tone {
  if (rec === "strong_review") return "strong";
  if (rec === "review") return "moderate";
  if (rec === "hold") return "weak";
  return "neutral";
}

/**
 * Deliberately collapsed to two plain outcomes ("Worth reviewing" /
 * "Not worth prioritizing") because a founder skimming a table of 60 rows
 * needs a yes/no read at a glance — the tone (color+dot) still carries the
 * strong-vs-moderate distinction underneath. Always pair this with
 * recommendationReason() so "why" is never more than one line away.
 */
export function recommendationLabel(rec: string): string {
  switch (rec) {
    case "strong_review":
    case "review":
      return "Worth reviewing";
    case "hold":
      return "Not worth prioritizing";
    default:
      return "Not enough evidence yet";
  }
}

export function recommendationReason(rec: string, overallScore: number, confidence: string): string {
  switch (rec) {
    case "strong_review":
      return `Strong evidence across most criteria (${overallScore}/100, ${confidence} confidence).`;
    case "review":
      return `Solid evidence on some criteria, gaps on others (${overallScore}/100, ${confidence} confidence).`;
    case "hold":
      return `Limited resume evidence found for this role (${overallScore}/100, ${confidence} confidence).`;
    default:
      return `Too little resume text or matching evidence to score confidently.`;
  }
}

export function confidenceLabel(c: string): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}
