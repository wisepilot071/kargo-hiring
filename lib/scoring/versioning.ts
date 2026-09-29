import { prisma } from "@/lib/db/client";
import type { HiringCriterion, RoleT } from "@/lib/types";

/** A stable fingerprint of a rubric's substance — ignores ids/timestamps, so
 * regenerating from unchanged source data (same JD, same historical hires)
 * always produces the same fingerprint and never spuriously bumps the
 * version (required for seed idempotency). */
export function fingerprintCriteria(criteria: Pick<HiringCriterion, "name" | "weight" | "type" | "confidence">[]): string {
  const normalized = criteria
    .map((c) => `${c.name}|${c.weight}|${c.type}|${c.confidence}`)
    .sort();
  return normalized.join("\n");
}

export async function getActiveVersion(role: RoleT): Promise<number> {
  const row = await prisma.hiringCriterion.findFirst({
    where: { role },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return row?.version ?? 0;
}

export async function getActiveCriteria(role: RoleT) {
  const version = await getActiveVersion(role);
  if (version === 0) return { version: 0, criteria: [] as HiringCriterion[] };
  const rows = await prisma.hiringCriterion.findMany({ where: { role, version } });
  const criteria: HiringCriterion[] = rows.map((r) => ({
    id: r.id,
    role: r.role as RoleT,
    name: r.name,
    description: r.description,
    weight: r.weight,
    type: r.type as HiringCriterion["type"],
    jdImportance: r.jdImportance as HiringCriterion["jdImportance"],
    evidence: JSON.parse(r.evidence),
    confidence: r.confidence as HiringCriterion["confidence"],
    sourceCandidates: JSON.parse(r.sourceCandidates),
  }));
  return { version, criteria };
}

/**
 * Publishes a newly-generated rubric as either a no-op (identical to the
 * current active version — the common case on a re-seed with unchanged
 * source data) or a brand new version (old versions are never deleted or
 * overwritten, so any CandidateEvaluation.benchmarkVersion pointing at v1
 * stays valid and traceable forever, per the QA brief's explicit
 * requirement not to silently overwrite an existing benchmark version).
 */
export async function publishRubricVersion(
  role: RoleT,
  newCriteria: HiringCriterion[]
): Promise<{ version: number; changed: boolean }> {
  const current = await getActiveCriteria(role);
  const currentFingerprint = fingerprintCriteria(current.criteria);
  const newFingerprint = fingerprintCriteria(newCriteria);

  if (current.version > 0 && currentFingerprint === newFingerprint) {
    return { version: current.version, changed: false };
  }

  const version = current.version + 1;
  if (newCriteria.length > 0) {
    await prisma.hiringCriterion.createMany({
      data: newCriteria.map((c, i) => ({
        id: `${role.toLowerCase()}-v${version}-${c.type}-${i}`,
        role,
        version,
        name: c.name,
        description: c.description,
        weight: c.weight,
        type: c.type,
        jdImportance: c.jdImportance,
        evidence: JSON.stringify(c.evidence),
        confidence: c.confidence,
        sourceCandidates: JSON.stringify(c.sourceCandidates),
      })),
    });
  }
  return { version, changed: true };
}
