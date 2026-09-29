import Link from "next/link";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { candidate: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Audit log</h1>
        <p className="mt-1 text-sm text-ink-400">
          Every upload, evaluation, founder decision, and email action, in order. This is the decision record the
          case describes Arjun as not having today.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink-700 text-xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Candidate</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-ink-800 last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-ink-400">{e.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td className="px-4 py-2 text-ink-200">{e.eventType.replaceAll("_", " ").toLowerCase()}</td>
                <td className="px-4 py-2 text-ink-300">
                  {e.candidate ? (
                    <Link href={`/candidates/${e.candidate.id}`} className="text-brand-600 hover:underline">
                      {e.candidate.name ?? e.candidate.resumeFile}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="max-w-[420px] truncate px-4 py-2 text-ink-400" title={e.detail ?? ""}>
                  {e.detail ?? "—"}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-500">
                  No audit events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
