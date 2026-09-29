import { prisma } from "@/lib/db/client";

export const AUDIT_EVENTS = {
  CANDIDATE_UPLOADED: "CANDIDATE_UPLOADED",
  CANDIDATE_PARSED: "CANDIDATE_PARSED",
  EVALUATION_GENERATED: "EVALUATION_GENERATED",
  INTERVIEW_BRIEF_GENERATED: "INTERVIEW_BRIEF_GENERATED",
  CANDIDATE_OPENED: "CANDIDATE_OPENED",
  FOUNDER_DECISION: "FOUNDER_DECISION",
  EMAIL_DRAFT_CREATED: "EMAIL_DRAFT_CREATED",
  EMAIL_EDITED: "EMAIL_EDITED",
  EMAIL_SENT: "EMAIL_SENT",
  EMAIL_FAILED: "EMAIL_FAILED",
} as const;

export async function recordAudit(candidateId: string | null, eventType: string, detail?: string) {
  await prisma.auditEvent.create({
    data: { candidateId, eventType, detail },
  });
}
