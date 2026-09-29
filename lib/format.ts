/**
 * Falls back to a label derived from the resume filename when a name
 * couldn't be extracted from the document text (e.g. a stylized PDF header
 * rendered as a graphic). This is never sent to the AI scoring pipeline —
 * display only — and callers should still treat `nameSource` as a signal to
 * show a "couldn't read name — verify manually" note.
 */
export function displayName(candidate: { name: string | null; resumeFile: string }): {
  label: string;
  source: "resume" | "filename";
} {
  if (candidate.name) return { label: candidate.name, source: "resume" };
  const base = candidate.resumeFile.replace(/\.[^.]+$/, "");
  const words = base
    .replace(/^\d+[-_]?/, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return { label: words.length > 0 ? words.join(" ") : candidate.resumeFile, source: "filename" };
}
