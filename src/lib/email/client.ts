/**
 * Outbound email. Resend today; the rest of the app never knows that.
 *
 * Env-gated the same way the Claude client and the database are: with no
 * RESEND_API_KEY the whole path is inert and `hasEmail()` is false, so the
 * console renders a "not configured" note instead of throwing. Nothing here
 * needs a key to typecheck, build or deploy.
 *
 * Called over HTTP rather than through the `resend` package on purpose — this
 * is one POST with a JSON body, and a dependency that owns the send path of a
 * product is worth more than the twenty lines it saves.
 *
 * WHAT THIS DOES NOT DO: decide whether to send. Every brand-facing message is
 * gated (lib/agents/conversation.ts) and a human presses the button. This
 * module is the pipe.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function hasEmail(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NSPIIRE_MAIL_FROM);
}

export class EmailUnavailableError extends Error {
  constructor() {
    super(
      "Email is not configured. Set RESEND_API_KEY and NSPIIRE_MAIL_FROM to send.",
    );
    this.name = "EmailUnavailableError";
  }
}

export interface OutboundEmail {
  /** Composed by fromHeader(). Must be an address on the verified domain. */
  from: string;
  to: string;
  subject: string;
  /** Plain text. Cold outreach reads better and lands better without HTML. */
  text: string;
  /** Where a human reply should go. Usually the creator or the deal alias. */
  replyTo?: string;
  /**
   * RFC 5322 threading. Passing the previous message's id keeps a reply in the
   * same conversation in the recipient's client instead of starting a new one.
   */
  inReplyTo?: string;
  references?: string[];
}

export interface SentEmail {
  providerMessageId: string;
}

/**
 * The From header.
 *
 * A display name that reads as a person with no company would imply a human
 * wrote it, which is the one thing a persona may never do (see DISCLOSURE in
 * lib/agents/persona.ts). `Iris at Nspiire (for Rae Vale)` is warm, honest, and
 * tells the recipient who is actually being represented.
 */
export function fromHeader(personaName: string, creatorName: string): string {
  const address = process.env.NSPIIRE_MAIL_FROM ?? "";
  return `${personaName} at Nspiire (for ${creatorName}) <${address}>`;
}

export async function sendEmail(message: OutboundEmail): Promise<SentEmail> {
  if (!hasEmail()) throw new EmailUnavailableError();

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      reply_to: message.replyTo,
      headers: {
        ...(message.inReplyTo ? { "In-Reply-To": message.inReplyTo } : {}),
        ...(message.references?.length
          ? { References: message.references.join(" ") }
          : {}),
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Email provider rejected the send (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }

  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("Email provider returned no message id");
  return { providerMessageId: json.id };
}
