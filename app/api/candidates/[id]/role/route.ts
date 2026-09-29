import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { RoleSchema } from "@/lib/types";
import { buildSanitizedProfile } from "@/lib/scoring/sanitize";
import { extractCandidateProfile, extractResumeBullets } from "@/lib/parsers/candidate";
import { evaluateAndBriefCandidate } from "@/lib/scoring/pipeline";
import { recordAudit, AUDIT_EVENTS } from "@/lib/db/audit";

const BodySchema = z.object({ role: RoleSchema });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role. Expected PM or SPM." }, { status: 400 });
  }

  const candidate = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }
  if (candidate.parseStatus !== "OK") {
    return NextResponse.json(
      { error: "This candidate's resume could not be parsed, so a role cannot be scored yet." },
      { status: 400 }
    );
  }

  // Re-sanitize against the newly assigned role (sanitizedProfile.appliedRole matters for scoring context).
  const profile = extractCandidateProfile(candidate.resumeText);
  const bullets = extractResumeBullets(candidate.resumeText);
  const sanitized = buildSanitizedProfile(profile, parsed.data.role, bullets);

  await prisma.candidate.update({
    where: { id: params.id },
    data: { appliedRole: parsed.data.role, sanitizedProfile: JSON.stringify(sanitized), parseNotes: null },
  });

  try {
    await evaluateAndBriefCandidate(params.id);
  } catch (err) {
    await recordAudit(params.id, "EVALUATION_FAILED", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json(
      { error: "Role was assigned, but evaluation failed. See audit log for detail." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
