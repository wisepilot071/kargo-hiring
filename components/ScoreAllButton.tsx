"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Bulk-scores every unassigned candidate in one click, using each one's
 * best-fit suggested role — so the founder isn't stuck opening 28 candidate
 * pages one at a time just to get a real score instead of a preview.
 */
export function ScoreAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function scoreAll() {
    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/candidates/bulk-score", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setResult("Something went wrong — see audit log for detail.");
        return;
      }
      setResult(
        `Scored ${json.scored} of ${json.total}` +
          (json.skipped > 0 ? `, ${json.skipped} skipped (no resume evidence to score)` : "") +
          (json.failed > 0 ? `, ${json.failed} failed` : "") +
          "."
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={scoreAll}
        disabled={pending}
        className="rounded-lg border border-brand-500/25 bg-brand-500/10 px-3.5 py-1.5 text-sm font-medium text-brand-600 transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {pending ? "Scoring…" : `Score all ${count} unassigned`}
      </button>
      {result && <span className="text-xs text-ink-400">{result}</span>}
    </div>
  );
}
