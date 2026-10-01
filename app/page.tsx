import Link from "next/link";
import { getDashboardData } from "@/lib/dashboard";
import { Badge, recommendationTone } from "@/components/Badge";
import { UploadPanel } from "@/components/UploadPanel";
import { QuickDecisionButtons } from "@/components/QuickDecisionButtons";
import { ScoreAllButton } from "@/components/ScoreAllButton";

export const dynamic = "force-dynamic";

function RoleFilterTabs({ active }: { active: "ALL" | "PM" | "SPM" }) {
  const tabs: { key: "ALL" | "PM" | "SPM"; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "PM", label: "Product Manager" },
    { key: "SPM", label: "Senior Product Manager" },
  ];
  return (
    <div className="inline-flex gap-1 rounded-xl border border-black/[0.06] bg-ink-900/70 p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "ALL" ? "/" : `/?role=${t.key}`}
          className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${
            active === t.key ? "bg-gradient-to-b from-brand-500 to-brand-700 text-white shadow-glow" : "text-ink-400 hover:bg-black/[0.04] hover:text-ink-100"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

const SUMMARY_ICONS: Record<string, JSX.Element> = {
  applications: (
    <path d="M9 12h6m-6 4h6M9 8h1m5 12H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6l4 4v10a2 2 0 0 1-2 2Z" strokeLinecap="round" strokeLinejoin="round" />
  ),
  reviewed: <path d="M12 4.5C7 4.5 3 12 3 12s4 7.5 9 7.5 9-7.5 9-7.5-4-7.5-9-7.5Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" strokeLinecap="round" strokeLinejoin="round" />,
  recommended: <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.8L12 3Z" strokeLinecap="round" strokeLinejoin="round" />,
  awaiting: <path d="M12 7v5l3.5 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinecap="round" strokeLinejoin="round" />,
  interviews: <path d="M8 4h8a2 2 0 0 1 2 2v12l-3-2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M8 10h8M8 13h5" strokeLinecap="round" strokeLinejoin="round" />,
};

function SummaryCard({ icon, label, value, tone }: { icon: keyof typeof SUMMARY_ICONS; label: string; value: number; tone: string }) {
  return (
    <div className="card card-hover animate-fade-up p-5">
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {SUMMARY_ICONS[icon]}
          </svg>
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-ink-100">{value}</div>
      <div className="mt-1 text-sm text-ink-400">{label}</div>
    </div>
  );
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const ROLE_LABEL: Record<string, string> = { PM: "PM", SPM: "SPM" };

function RoleCell({ row }: { row: Awaited<ReturnType<typeof getDashboardData>>["rows"][number] }) {
  if (row.appliedRole) {
    return (
      <div className="space-y-1">
        <span className="text-ink-200">{ROLE_LABEL[row.appliedRole] ?? row.appliedRole}</span>
        {row.notCleared && (
          <div>
            <span className="inline-block rounded-full border border-signal-weak/25 bg-signal-weakBg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-signal-weak">
              Not cleared
            </span>
          </div>
        )}
      </div>
    );
  }
  if (row.suggestedRole) {
    return (
      <span className="text-xs text-ink-400">
        Suggested: <span className="font-medium text-brand-600">{row.suggestedRole.role}</span>{" "}
        <span className="text-ink-500">({row.suggestedRole.score})</span>
      </span>
    );
  }
  return <span className="text-ink-400">Unassigned</span>;
}

function EmailCell({ id, status }: { id: string; status: "none" | "awaiting_send" | "sent" | "failed" }) {
  if (status === "sent") return <Badge label="Sent" tone="strong" />;
  if (status === "failed") return <Badge label="Failed to send" tone="weak" />;
  if (status === "awaiting_send") {
    return (
      <Link href={`/candidates/${id}#`} className="inline-flex">
        <Badge label="Awaiting send" tone="moderate" />
      </Link>
    );
  }
  return (
    <Link href={`/candidates/${id}`} className="text-xs text-brand-600 hover:underline">
      Draft email
    </Link>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: { role?: string } }) {
  const role = searchParams.role === "PM" || searchParams.role === "SPM" ? searchParams.role : "ALL";
  const { rows, summary } = await getDashboardData(role);
  const unassignedCount = rows.filter((r) => !r.appliedRole && r.suggestedRole).length;

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-bold text-white shadow-glow">
            K
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Kargo Hiring Dashboard</h1>
            <p className="text-sm text-ink-400">AI-assisted candidate review. You make the final decision.</p>
          </div>
        </div>
      </div>

      <UploadPanel />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard icon="applications" label="Applications" value={summary.totalApplications} tone="bg-brand-500/10 text-brand-600" />
        <SummaryCard icon="reviewed" label="Reviewed" value={summary.reviewed} tone="bg-black/[0.04] text-ink-200" />
        <SummaryCard icon="recommended" label="Recommended for review" value={summary.recommended} tone="bg-signal-strongBg text-signal-strong" />
        <SummaryCard icon="awaiting" label="Awaiting founder decision" value={summary.awaitingDecision} tone="bg-signal-moderateBg text-signal-moderate" />
        <SummaryCard icon="interviews" label="Interviews" value={summary.interviews} tone="bg-gold-500/10 text-gold-500" />
      </div>

      <div className="flex items-center justify-between">
        <RoleFilterTabs active={role} />
        <ScoreAllButton count={unassignedCount} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/[0.06] text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-5 py-3.5 font-medium">Candidate</th>
              <th className="px-5 py-3.5 font-medium">Role</th>
              <th className="px-5 py-3.5 font-medium">Overall fit</th>
              <th className="px-5 py-3.5 font-medium">Recommendation</th>
              <th className="px-5 py-3.5 font-medium">Decide</th>
              <th className="px-5 py-3.5 font-medium">Key gap</th>
              <th className="px-5 py-3.5 font-medium">Email</th>
              <th className="px-5 py-3.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-black/[0.04] transition-colors last:border-0 hover:bg-black/[0.015]">
                <td className="px-5 py-3.5">
                  <Link href={`/candidates/${row.id}`} className="flex items-center gap-2.5 font-medium text-ink-100 hover:text-brand-600">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[11px] font-semibold text-ink-300">
                      {initials(row.name)}
                    </span>
                    <span>
                      {row.name}
                      {row.nameSource === "filename" && (
                        <span className="ml-1.5 text-[10px] font-normal text-signal-moderate" title="Name couldn't be read from the resume text — shown from the filename instead">
                          (from filename)
                        </span>
                      )}
                    </span>
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <RoleCell row={row} />
                </td>
                <td className="px-5 py-3.5 tabular-nums text-ink-200">{row.overallScore ?? "—"}</td>
                <td className="px-5 py-3.5">
                  {row.recommendation ? (
                    <div className="flex items-center gap-2">
                      <Badge label={row.recommendationLabel} tone={recommendationTone(row.recommendation)} />
                      <Link href={`/candidates/${row.id}#why`} className="text-xs text-brand-600 hover:underline" title={row.recommendationReason ?? ""}>
                        Why?
                      </Link>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-500">{row.appliedRole ? "Not yet scored" : "Needs role"}</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <QuickDecisionButtons candidateId={row.id} canDecide={row.recommendation !== null} />
                </td>
                <td className="max-w-[220px] truncate px-5 py-3.5 text-ink-500" title={row.keyGap ?? ""}>
                  {row.keyGap ?? "—"}
                </td>
                <td className="px-5 py-3.5">
                  <EmailCell id={row.id} status={row.emailStatus} />
                </td>
                <td className="px-5 py-3.5 text-ink-400">{row.latestDecision ?? "Awaiting decision"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-ink-500">
                  No candidates for this filter yet. Upload a CV above, or run <code className="rounded bg-black/[0.05] px-1.5 py-0.5 text-ink-300">npm run seed</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
