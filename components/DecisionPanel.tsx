"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DECISIONS = [
  { key: "MOVE_TO_INTERVIEW", label: "Move to Interview", style: "btn-primary" },
  { key: "DO_NOT_MOVE_FORWARD", label: "Do Not Move Forward", style: "btn-danger" },
  { key: "HOLD", label: "Hold / Review Later", style: "btn-secondary" },
  { key: "NEED_MORE_INFO", label: "Need More Information", style: "btn-secondary" },
] as const;

export function DecisionPanel({
  candidateId,
  latestDecision,
}: {
  candidateId: string;
  latestDecision: { decision: string; note: string | null; createdAt: string } | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: string) {
    setPending(decision);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record decision.");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h3 className="text-sm font-semibold text-ink-100">Founder decision</h3>
        <p className="mt-1 text-xs text-ink-500">
          This is recorded independently of the AI recommendation above. Disagreeing with the AI is expected and fine.
        </p>
      </div>

      {latestDecision && (
        <div className="rounded-lg border border-ink-700 bg-ink-800/60 px-3 py-2 text-sm text-ink-300">
          Current: <span className="font-medium text-ink-100">{latestDecision.decision.replaceAll("_", " ")}</span>
          {latestDecision.note && <span className="text-ink-400"> — &quot;{latestDecision.note}&quot;</span>}
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note for this decision (kept with the audit record)"
        className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500"
        rows={2}
      />

      <div className="flex flex-wrap gap-2">
        {DECISIONS.map((d) => (
          <button key={d.key} className={d.style} disabled={pending !== null} onClick={() => decide(d.key)}>
            {pending === d.key ? "Saving…" : d.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-signal-weak">{error}</p>}
    </div>
  );
}
