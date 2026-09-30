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

  // Atomically claim the draft before actually sending — a plain read-then-write
  // here would let two concurrent POSTs (double-click, retry, two open tabs) both
  // pass the status check and both dispatch the same email through Resend.
  const claim = await prisma.emailDraft.updateMany({
    where: { id: params.emailId, status: { in: ["DRAFT", "FAILED"] } },
    data: { status: "SENDING" },
  });
  if (claim.count === 0) {
    return NextResponse.json({ error: "This email is already being sent or was just sent." }, { status: 409 });
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
