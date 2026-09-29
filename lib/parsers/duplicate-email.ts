import { prisma } from "@/lib/db/client";

/**
 * Returns a warning string if `email` is already on file for a *different*
 * candidate. Two real people never share one email; this virtually always
 * means a shared placeholder/template artifact in the source document
 * (confirmed in QA against real uploaded PDFs — see data quality report) —
 * exactly the kind of thing that must never silently drive an actual send.
 */
export async function detectSharedEmail(email: string | null, excludeCandidateId: string): Promise<string | null> {
  if (!email) return null;
  const existing = await prisma.candidate.findFirst({
    where: { email: { equals: email }, id: { not: excludeCandidateId } },
    select: { id: true, resumeFile: true },
  });
  if (!existing) return null;
  return `This email address (${email}) is also on file for another candidate (${existing.resumeFile}) — likely a shared placeholder in the source document, not a real personal address. Verify before sending anything.`;
}

export function combineNotes(...notes: (string | null | undefined)[]): string | null {
  const parts = notes.filter((n): n is string => Boolean(n && n.trim()));
  return parts.length > 0 ? parts.join(" ") : null;
}
