import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { EmailTypeSchema } from "@/lib/types";
import { getAiProvider } from "@/lib/ai/provider";
import { recordAudit, AUDIT_EVENTS } from "@/lib/db/audit";

const BodySchema = z.object({
  type: EmailTypeSchema,
  founderNote: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email draft request." }, { status: 400 });
  }

  const candidate = await prisma.candidate.findUnique({ where: { id: params.id }, include: { evaluation: true } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }
  if (!candidate.appliedRole) {
    return NextResponse.json({ error: "Assign a role to this candidate before drafting an email." }, { status: 400 });
  }

  const strengths: string[] = candidate.evaluation ? JSON.parse(candidate.evaluation.strengths) : [];

  const ai = getAiProvider();
  const draft = await ai.generateEmailDraft({
    type: parsed.data.type,
    candidateName: candidate.name,
    appliedRole: candidate.appliedRole as "PM" | "SPM",
    founderNote: parsed.data.founderNote || null,
    topStrengths: strengths,
  });

  const created = await prisma.emailDraft.create({
    data: {
      candidateId: params.id,
      type: parsed.data.type,
      subject: draft.subject,
      body: draft.body,
      status: "DRAFT",
      provider: ai.name,
    },
  });

  await recordAudit(params.id, AUDIT_EVENTS.EMAIL_DRAFT_CREATED, parsed.data.type);

  return NextResponse.json({ ok: true, draft: created });
}
