import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { recordAudit, AUDIT_EVENTS } from "@/lib/db/audit";
import { Badge, recommendationTone, recommendationLabel, recommendationReason, confidenceLabel } from "@/components/Badge";
import { RoleAssignForm } from "@/components/RoleAssignForm";
import { DecisionPanel } from "@/components/DecisionPanel";
import { EmailPanel, type EmailDraftDTO } from "@/components/EmailPanel";
import { displayName } from "@/lib/format";

export const dynamic = "force-dynamic";

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-6 space-y-3 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">{title}</h2>
      {children}
    </section>
  );
}

export default async function CandidatePage({ params }: { params: { id: string } }) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: params.id },
    include: {
      evaluation: true,
      interviewBrief: true,
      founderDecisions: { orderBy: { createdAt: "desc" } },
      emailDrafts: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!candidate) notFound();

  await recordAudit(candidate.id, AUDIT_EVENTS.CANDIDATE_OPENED);

  const profile = JSON.parse(candidate.parsedProfile || "{}");
  const evaluation = candidate.evaluation;
  const criteria = evaluation ? JSON.parse(evaluation.criterionScores) : [];
  const historicalSignals = evaluation ? JSON.parse(evaluation.historicalSignals) : [];
  const brief = candidate.interviewBrief;
  const questions = brief ? JSON.parse(brief.questions) : [];
  const validationAreas = brief ? JSON.parse(brief.validationAreas) : [];
  const strongAnswers: string[] = brief ? JSON.parse(brief.strongAnswerLooksLike) : [];
  const changeRec: string[] = brief ? JSON.parse(brief.whatWouldChangeRecommendation) : [];
  const { label: nameLabel, source: nameSource } = displayName(candidate);

  const latestDecision = candidate.founderDecisions[0]
    ? {
        decision: candidate.founderDecisions[0].decision,
        note: candidate.founderDecisions[0].note,
        createdAt: candidate.founderDecisions[0].createdAt.toISOString(),
      }
    : null;

  const drafts: EmailDraftDTO[] = candidate.emailDrafts.map((d) => ({
    id: d.id,
    type: d.type,
    subject: d.subject,
    body: d.body,
    status: d.status,
    provider: d.provider,
    failureReason: d.failureReason,
    sentAt: d.sentAt?.toISOString() ?? null,
  }));

  const canAct = candidate.parseStatus === "OK";

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-ink-400 hover:text-ink-100">
        ← Back to dashboard
      </Link>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink-100">
              {nameLabel}
              {nameSource === "filename" && (
                <span className="ml-2 align-middle text-xs font-normal text-signal-moderate">
                  (name from filename — couldn&apos;t read a name from this resume)
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-ink-400">
              Applied for: <span className="text-ink-200">{candidate.appliedRole ?? "Not yet assigned"}</span> · Most recent
              role: {profile.currentRole ?? "Not available"}
            </p>
          </div>
          {evaluation && (
            <div className="max-w-xs text-right">
              <Badge label={recommendationLabel(evaluation.recommendation)} tone={recommendationTone(evaluation.recommendation)} />
              <p className="mt-1.5 text-xs text-ink-500">
                {recommendationReason(evaluation.recommendation, evaluation.overallScore, evaluation.confidence)}
              </p>
              <a href="#why" className="mt-1 inline-block text-xs text-brand-600 hover:underline">
                See why ↓
              </a>
              <p className="mt-1 text-[10px] text-ink-600">Scored against benchmark v{evaluation.benchmarkVersion}</p>
            </div>
          )}
        </div>
        {candidate.parseNotes && (
          <p className="mt-3 rounded-lg border border-signal-moderate/30 bg-signal-moderate/10 px-3 py-2 text-sm text-signal-moderate">
            {candidate.parseNotes}
          </p>
        )}
      </div>

      {candidate.parseStatus !== "OK" && (
        <div className="card p-5 text-sm text-signal-weak">
          Parsing failed — manual review required. {candidate.parseNotes}
        </div>
      )}

      {!candidate.appliedRole && canAct && <RoleAssignForm candidateId={candidate.id} />}

      {/* Founder actions are always available — Arjun can decide or draft an
          email on any candidate at any time, whether or not scoring has run. */}
      {canAct && (
        <>
          <DecisionPanel candidateId={candidate.id} latestDecision={latestDecision} />
          <EmailPanel candidateId={candidate.id} drafts={drafts} hasEmail={Boolean(candidate.email)} />
        </>
      )}

      {evaluation && (
        <>
          <Section title="Why this candidate is being surfaced" id="why">
            {(() => {
              const topStrengths = [...criteria]
                .filter((c: any) => c.score >= 3)
                .sort((a: any, b: any) => b.score - a.score || b.weight - a.weight)
                .slice(0, 4);
              const fallback = topStrengths.length === 0 ? [...criteria].sort((a: any, b: any) => b.score - a.score).slice(0, 2) : [];
              const shown = topStrengths.length > 0 ? topStrengths : fallback;

              return (
                <>
                  {shown.length > 0 ? (
                    <div className="space-y-3">
                      {shown.map((c: any) => (
                        <div key={c.criterionId} className="rounded-lg border border-black/[0.06] bg-black/[0.015] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-ink-100">{c.name}</span>
                            <span className="shrink-0 rounded-full border border-signal-strong/20 bg-signal-strongBg px-2 py-0.5 text-xs font-semibold text-signal-strong">
                              {c.score}/4
                            </span>
                          </div>
                          {c.evidence.slice(0, 2).map((e: string, i: number) => (
                            <p key={i} className="mt-1.5 border-l-2 border-signal-strong/25 pl-2.5 text-sm italic text-ink-400">
                              &quot;{e}&quot;
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-500">No criteria scored strongly enough to explain a clear recommendation — see the full score breakdown below.</p>
                  )}

                  <p className="flex items-start gap-1.5 border-t border-black/[0.06] pt-3 text-xs text-ink-500">
                    <span aria-hidden>ℹ</span>
                    {historicalSignals.length > 0
                      ? `Also matches ${historicalSignals.length} pattern(s) observed among historical Kargo hire records — see below.`
                      : "No Kargo historical hire data is available yet — this reflects job-description fit only, not historical calibration."}
                  </p>
                </>
              );
            })()}
          </Section>

          <Section title="Score breakdown">
            <div className="space-y-3">
              {criteria.map((c: any) => (
                <div key={c.criterionId} className="rounded-lg border border-ink-700 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-100">{c.name}</span>
                    <span className="text-sm text-ink-300">
                      {c.score}/4 <span className="text-ink-500">· weight {c.weight}%</span>
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-400">{c.explanation}</p>
                  {c.evidence.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-ink-700 pl-3 text-xs text-ink-400">
                      {c.evidence.map((e: string, i: number) => (
                        <li key={i}>&quot;{e}&quot;</li>
                      ))}
                    </ul>
                  )}
                  {c.gaps.length > 0 && (
                    <p className="mt-2 text-xs text-signal-moderate">Gap: {c.gaps.join(" ")}</p>
                  )}
                </div>
              ))}
              {criteria.length === 0 && <p className="text-sm text-ink-500">No scored criteria are available for this role.</p>}
            </div>
          </Section>

          <Section title="Historical Kargo signal">
            {historicalSignals.length > 0 ? (
              <>
                <p className="text-sm text-ink-300">
                  Matches {historicalSignals.length} pattern(s) observed among historical Kargo hire records.
                </p>
                <div className="space-y-2">
                  {historicalSignals.map((s: any, i: number) => (
                    <div key={i} className="rounded-lg border border-ink-700 p-3 text-sm">
                      <div className="font-medium text-ink-100">{s.signal}</div>
                      <div className="mt-1 text-ink-300">Candidate evidence: &quot;{s.candidateEvidence}&quot;</div>
                      <div className="mt-1 text-ink-400">Historical evidence: &quot;{s.historicalEvidence}&quot;</div>
                      <div className="mt-1 text-xs text-ink-500">Confidence: {confidenceLabel(s.confidence)}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-500">
                No historical hire data is loaded yet, so no historical comparison could be made. Drop files into{" "}
                <code>data/hires/</code> and re-run <code>npm run seed</code> to enable this.
              </p>
            )}
          </Section>

          <Section title="What to probe">
            {questions.length > 0 ? (
              <div className="space-y-3">
                {questions.map((q: any, i: number) => (
                  <div key={i} className="rounded-lg border border-ink-700 p-3 text-sm">
                    <div className="font-medium text-ink-100">&quot;{q.question}&quot;</div>
                    <div className="mt-1 text-ink-400">Why ask: {q.reason}</div>
                    <div className="mt-1 text-ink-400">Validate: {q.whatToValidate}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">No specific gaps were found to probe.</p>
            )}
          </Section>
        </>
      )}

      <Section title="Resume">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-400">{candidate.resumeFile}</span>
          <a href={`/api/candidates/${candidate.id}/resume`} className="text-sm text-brand-600 hover:underline">
            Download original file
          </a>
        </div>
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-black/[0.05] bg-ink-850 p-4 text-xs text-ink-300">
          {candidate.resumeText || "(no extracted text)"}
        </pre>
      </Section>

      {brief && (validationAreas.length > 0 || strongAnswers.length > 0 || changeRec.length > 0) && (
        <Section title="Interview brief — additional notes">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="text-xs font-semibold uppercase text-ink-500">What a strong answer looks like</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-300">
                {Array.from(new Set(strongAnswers)).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase text-ink-500">What would change the recommendation</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-300">
                {changeRec.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
