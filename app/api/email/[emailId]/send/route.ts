import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { sendCandidateEmail } from "@/lib/email/send";
import { recordAudit, AUDIT_EVENTS } from "@/lib/db/audit";

/**
 * The only place in the app that actually dispatches an email. Only ever
 * called from a founder clicking "Send" in the UI — never automatically.
 */
export async function POST(_req: NextRequest, { params }: { params: { emailId: string } }) {
  const draft = await prisma.emailDraft.findUnique({ where: { id: params.emailId }, include: { candidate: true } });
  if (!draft) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }
  if (draft.status === "SENT") {
    return NextResponse.json({ error: "This email has already been sent." }, { status: 400 });
  }

  const result = await sendCandidateEmail({
    candidateId: draft.candidateId,
    emailType: draft.type,
    recipient: draft.candidate.email ?? "",
    subject: draft.subject,
    body: draft.body,
  });

  if (result.success) {
    const updated = await prisma.emailDraft.update({
      where: { id: params.emailId },
      data: { status: "SENT", resendMessageId: result.messageId, sentAt: new Date(), failureReason: null },
    });
    await recordAudit(draft.candidateId, AUDIT_EVENTS.EMAIL_SENT, `${result.mock ? "[mock] " : ""}${result.messageId}`);
    return NextResponse.json({ ok: true, draft: updated, mock: result.mock });
  }

  const updated = await prisma.emailDraft.update({
    where: { id: params.emailId },
    data: { status: "FAILED", failureReason: result.error },
  });
  await recordAudit(draft.candidateId, AUDIT_EVENTS.EMAIL_FAILED, result.error);
  return NextResponse.json({ ok: false, error: result.error, draft: updated }, { status: 502 });
}
