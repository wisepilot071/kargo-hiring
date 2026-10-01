import { prisma } from "@/lib/db/client";
import { buildSanitizedProfile } from "@/lib/scoring/sanitize";
import { extractCandidateProfile, extractResumeBullets } from "@/lib/parsers/candidate";
import { evaluateAndBriefCandidate } from "@/lib/scoring/pipeline";
import { detectSharedEmail } from "@/lib/parsers/duplicate-email";
import type { RoleT } from "@/lib/types";

/**
 * Assigns a role to a candidate and runs the full scoring pipeline — shared
 * by the single-candidate "assign role" API route and the dashboard's bulk
 * "score all" action, so both behave identically rather than drifting apart.
 */
export async function assignRoleAndEvaluate(candidateId: string, role: RoleT): Promise<void> {
  const candidate = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });

  const profile = extractCandidateProfile(candidate.resumeText);
  const bullets = extractResumeBullets(candidate.resumeText);
  const sanitized = buildSanitizedProfile(profile, role, bullets);

  // Re-check for a shared/placeholder email rather than blindly clearing
  // parseNotes — this is exactly the moment the candidate becomes emailable.
  const sharedEmailWarning = await detectSharedEmail(candidate.email, candidateId);

  await prisma.candidate.update({
    where: { id: candidateId },
    data: { appliedRole: role, sanitizedProfile: JSON.stringify(sanitized), parseNotes: sharedEmailWarning },
  });

  await evaluateAndBriefCandidate(candidateId);
}
