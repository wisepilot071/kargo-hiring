import { prisma } from "@/lib/db/client";
import type { HistoricalSignal } from "@/lib/ai/types";

/**
 * Was a local JSON file cache — moved to the DB because a local file
 * doesn't survive a serverless deploy (each invocation gets its own
 * ephemeral, non-shared filesystem). Recomputed wholesale each seed run.
 */
export async function saveCachedSignals(signals: HistoricalSignal[]): Promise<void> {
  await prisma.historicalSignal.deleteMany();
  if (signals.length === 0) return;
  await prisma.historicalSignal.createMany({
    data: signals.map((s) => ({
      name: s.name,
      description: s.description,
      evidenceFromHistoricalData: JSON.stringify(s.evidenceFromHistoricalData),
      confidence: s.confidence,
      sourceCandidates: JSON.stringify(s.sourceCandidates),
      roleRelevance: s.roleRelevance,
    })),
  });
}

export async function loadCachedSignals(): Promise<HistoricalSignal[]> {
  const rows = await prisma.historicalSignal.findMany();
  return rows.map((r) => ({
    name: r.name,
    description: r.description,
    evidenceFromHistoricalData: JSON.parse(r.evidenceFromHistoricalData),
    confidence: r.confidence as HistoricalSignal["confidence"],
    sourceCandidates: JSON.parse(r.sourceCandidates),
    roleRelevance: r.roleRelevance as HistoricalSignal["roleRelevance"],
  }));
}
