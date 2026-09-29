"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline yes/no decision control for the dashboard table, so the founder
 * doesn't have to open every candidate just to move them forward or reject
 * them. Only usable once a candidate has been scored (needs a role
 * assigned first) — otherwise there's no AI recommendation to weigh
 * against, and the buttons are shown disabled with an explanatory title.
 */
export function QuickDecisionButtons({ candidateId, canDecide }: { candidateId: string; canDecide: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<"yes" | "no" | null>(null);

  async function decide(decision: "MOVE_TO_INTERVIEW" | "DO_NOT_MOVE_FORWARD") {
    setPending(decision === "MOVE_TO_INTERVIEW" ? "yes" : "no");
    try {
      await fetch(`/api/candidates/${candidateId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  if (!canDecide) {
    return (
      <span className="text-xs text-ink-500" title="Assign a role and generate a score first">
        —
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => decide("MOVE_TO_INTERVIEW")}
        disabled={pending !== null}
        title="Move to interview"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-signal-strong/25 bg-signal-strongBg text-signal-strong transition-opacity hover:opacity-80 disabled:opacity-40"
      >
        {pending === "yes" ? "…" : "✓"}
      </button>
      <button
        onClick={() => decide("DO_NOT_MOVE_FORWARD")}
        disabled={pending !== null}
        title="Do not move forward"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-signal-weak/25 bg-signal-weakBg text-signal-weak transition-opacity hover:opacity-80 disabled:opacity-40"
      >
        {pending === "no" ? "…" : "✕"}
      </button>
    </div>
  );
}
