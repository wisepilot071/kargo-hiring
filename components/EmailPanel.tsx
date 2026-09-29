"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";

export type EmailDraftDTO = {
  id: string;
  type: string;
  subject: string;
  body: string;
  status: string;
  provider: string;
  failureReason: string | null;
  sentAt: string | null;
};

const TYPES = [
  { key: "INTERVIEW_INVITATION", label: "Interview invitation" },
  { key: "REJECTION", label: "Rejection / not moving forward" },
  { key: "FOLLOW_UP", label: "Follow-up" },
] as const;

function statusTone(status: string): "strong" | "moderate" | "weak" | "neutral" {
  if (status === "SENT") return "strong";
  if (status === "FAILED") return "weak";
  if (status === "READY_TO_SEND") return "moderate";
  return "neutral";
}

function DraftCard({ draft, canEmail }: { draft: EmailDraftDTO; canEmail: boolean }) {
  const router = useRouter();
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = draft.status !== "SENT";

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/email/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setError(null);
    try {
      const res = await fetch(`/api/email/${draft.id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-ink-500">
          {TYPES.find((t) => t.key === draft.type)?.label ?? draft.type}
        </span>
        <Badge label={draft.status === "SENT" ? "Sent" : draft.status === "FAILED" ? "Failed to send" : "Draft — requires review"} tone={statusTone(draft.status)} />
      </div>

      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        disabled={!editable}
        className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm font-medium text-ink-100 disabled:opacity-60"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={!editable}
        rows={8}
        className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-200 disabled:opacity-60"
      />

      {draft.failureReason && <p className="text-sm text-signal-weak">Last error: {draft.failureReason}</p>}
      {!canEmail && editable && (
        <p className="text-xs text-signal-moderate">No email address on file for this candidate — sending will fail until one is added.</p>
      )}

      {editable && (
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={save} disabled={busy !== null}>
            {busy === "save" ? "Saving…" : "Save edits"}
          </button>
          <button className="btn-primary" onClick={send} disabled={busy !== null}>
            {busy === "send" ? "Sending…" : "Send email"}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-signal-weak">{error}</p>}
    </div>
  );
}

export function EmailPanel({
  candidateId,
  drafts,
  hasEmail,
}: {
  candidateId: string;
  drafts: EmailDraftDTO[];
  hasEmail: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<(typeof TYPES)[number]["key"]>("INTERVIEW_INVITATION");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, founderNote: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate draft.");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <h3 className="text-sm font-semibold text-ink-100">Draft an email</h3>
        <p className="text-xs text-ink-500">
          The AI writes a draft. Nothing is sent until you review it and click Send below.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-100"
          >
            {TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <button className="btn-primary" onClick={generate} disabled={loading}>
            {loading ? "Generating…" : "Generate draft"}
          </button>
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={type === "REJECTION" ? "Optional: a real reason to include (never invented if left blank)" : "Optional note to weave in"}
          className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500"
        />
        {error && <p className="text-sm text-signal-weak">{error}</p>}
      </div>

      {drafts.map((d) => (
        <DraftCard key={d.id} draft={d} canEmail={hasEmail} />
      ))}
    </div>
  );
}
