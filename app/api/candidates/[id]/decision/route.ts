import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { FounderDecisionTypeSchema } from "@/lib/types";
import { recordAudit, AUDIT_EVENTS } from "@/lib/db/audit";

const BodySchema = z.object({
  decision: FounderDecisionTypeSchema,
  note: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid decision payload." }, { status: 400 });
  }

  const candidate = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  // Founder decision is recorded as-is, independent of the AI recommendation.
  // The AI's prior output is never edited or reconciled to match this.
  const created = await prisma.founderDecision.create({
    data: { candidateId: params.id, decision: parsed.data.decision, note: parsed.data.note || null },
  });

  await recordAudit(params.id, AUDIT_EVENTS.FOUNDER_DECISION, `${parsed.data.decision}${parsed.data.note ? `: ${parsed.data.note}` : ""}`);

  return NextResponse.json({ ok: true, decision: created });
}
