export type SendEmailInput = {
  candidateId: string;
  emailType: string;
  recipient: string;
  subject: string;
  body: string;
};

export type SendEmailResult =
  | { success: true; messageId: string; mock: boolean }
  | { success: false; error: string; mock: boolean };

/**
 * Server-side only. Never import this from a client component — the Resend
 * key must not reach the browser. EMAIL_PROVIDER=mock (default) returns a
 * fake message id and never contacts any real service, so the whole demo is
 * safe to run before real credentials exist.
 */
export async function sendCandidateEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = process.env.EMAIL_PROVIDER === "resend" ? "resend" : "mock";

  if (!input.recipient) {
    return { success: false, error: "No recipient email address on file for this candidate.", mock: provider === "mock" };
  }

  if (provider === "mock") {
    return { success: true, messageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, mock: true };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return {
      success: false,
      error: "EMAIL_PROVIDER=resend but RESEND_API_KEY or FROM_EMAIL is missing.",
      mock: false,
    };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: fromEmail,
      to: input.recipient,
      subject: input.subject,
      text: input.body,
    });
    if (result.error) {
      return { success: false, error: result.error.message, mock: false };
    }
    return { success: true, messageId: result.data?.id ?? "unknown", mock: false };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown Resend error",
      mock: false,
    };
  }
}
