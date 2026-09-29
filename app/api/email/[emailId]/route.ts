import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { recordAudit, AUDIT_EVENTS } from "@/lib/db/audit";

const BodySchema = z.object({
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(10000),
});

export async function PATCH(req: NextRequest, { params }: { params: { emailId: string } }) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Subject and body are required." }, { status: 400 });
  }

  const draft = await prisma.emailDraft.findUnique({ where: { id: params.emailId } });
  if (!draft) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }
  if (draft.status === "SENT") {
    return NextResponse.json({ error: "This email has already been sent and can no longer be edited." }, { status: 400 });
  }

  const updated = await prisma.emailDraft.update({
    where: { id: params.emailId },
    data: { subject: parsed.data.subject, body: parsed.data.body },
  });

  await recordAudit(draft.candidateId, AUDIT_EVENTS.EMAIL_EDITED, draft.id);

  return NextResponse.json({ ok: true, draft: updated });
}
