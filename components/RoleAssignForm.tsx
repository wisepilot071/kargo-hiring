"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RoleAssignForm({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [role, setRole] = useState<"PM" | "SPM">("PM");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/role`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign role.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-3 p-5">
      <div className="text-sm font-medium text-ink-100">Role not specified</div>
      <p className="text-sm text-ink-400">
        This resume doesn&apos;t carry a declared applied role in the seed data. Assign one to generate an AI
        recommendation — this mirrors the real upload flow (founder selects the role).
      </p>
      <div className="flex items-center gap-3">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "PM" | "SPM")}
          className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-ink-100"
        >
          <option value="PM">Product Manager</option>
          <option value="SPM">Senior Product Manager</option>
        </select>
        <button className="btn-primary" onClick={submit} disabled={loading}>
          {loading ? "Generating evaluation…" : "Assign role & evaluate"}
        </button>
      </div>
      {error && <p className="text-sm text-signal-weak">{error}</p>}
    </div>
  );
}
