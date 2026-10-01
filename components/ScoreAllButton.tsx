"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Bulk-scores every unassigned candidate, using each one's best-fit
 * suggested role — so the founder isn't stuck opening 28 candidate pages
 * one at a time just to get a real score instead of a preview. The server
 * route processes one small batch per call (to stay within the serverless
 * function time limit); this loops until nothing is left, showing live
 * progress instead of requiring repeated manual clicks.
 */
export function ScoreAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function scoreAll() {
    setPending(true);
    setResult(null);
    const total = count;
    let done = 0;
    let scored = 0;
    let skipped = 0;
    let failed = 0;

    try {
      // Loop batches sequentially — each POST only ever touches candidates
      // still unassigned, so this is safe to resume if it's interrupted.
      for (;;) {
        setProgress({ done, total });
        const res = await fetch("/api/candidates/bulk-score", { method: "POST" });
        if (!res.ok) {
          setResult("Something went wrong partway through — see audit log for detail. Click again to resume.");
          break;
        }
        const json = await res.json();
        done += json.total;
        scored += json.scored;
        skipped += json.skipped;
        failed += json.failed;
        router.refresh();
        if (json.total === 0 || json.remaining === 0) {
          setResult(
            `Scored ${scored} of ${done}` +
              (skipped > 0 ? `, ${skipped} skipped (no resume evidence to score)` : "") +
              (failed > 0 ? `, ${failed} failed` : "") +
              "."
          );
          break;
        }
      }
    } catch {
      setResult("Lost connection partway through — click again to resume; already-scored candidates are untouched.");
    } finally {
      setPending(false);
      setProgress(null);
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
        {pending ? `Scoring… (${progress?.done ?? 0}/${progress?.total ?? count})` : `Score all ${count} unassigned`}
      </button>
      {result && <span className="text-xs text-ink-400">{result}</span>}
    </div>
  );
}
