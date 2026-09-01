/**
 * What actually goes in the envelope.
 *
 * Iris writes the message; this wraps it. The wrapper is not decoration — it is
 * the part that keeps a cold commercial email lawful and the part that moves
 * the conversation off email and into the deal room.
 *
 * The footer carries three things, none optional:
 *
 *   1. A physical postal address. CAN-SPAM requires one in every commercial
 *      message; the FTC treats its absence as a violation on its own, and B2B
 *      is not exempt. It comes from NSPIIRE_POSTAL_ADDRESS rather than a
 *      constant here, because inventing an address would be worse than failing
 *      to send — `footer()` throws if it is missing.
 *   2. A way to opt out that a person can actually use. Also CAN-SPAM, and
 *      simply correct: a brand that says stop should be able to stop without
 *      replying to the thing they want to stop.
 *   3. What Iris is. She never claims to be human in the body (see DISCLOSURE
 *      in lib/agents/persona.ts); this makes it true on the face of the message
 *      too, for a recipient who reads the footer and not the prose. California's
 *      B.O.T. Act is the sharpest version of that requirement, but a brand
 *      deciding whether to reply is owed it regardless.
 *
 * UK/EU note: this footer satisfies CAN-SPAM. PECR and GDPR are stricter about
 * unsolicited B2B mail, and neither is solved by a footer — that is a decision
 * about which markets to send into, not a template change.
 */

export interface OutreachContext {
  /** Iris's message, exactly as she wrote it. Never edited here. */
  body: string;
  personaName: string;
  creatorName: string;
  brandName: string;
  /** The deal room. Where the conversation is meant to continue. */
  portalUrl: string;
  /** Unsubscribe link for this brand. */
  optOutUrl: string;
}

function postalAddress(): string {
  const address = process.env.NSPIIRE_POSTAL_ADDRESS;
  if (!address) {
    // Failing loudly beats sending an unlawful email, and beats a placeholder
    // that would ship to a real brand.
    throw new Error(
      "NSPIIRE_POSTAL_ADDRESS is not set. Commercial email must carry a physical postal address (CAN-SPAM); refusing to send without one.",
    );
  }
  return address;
}

/**
 * The pointer into the deal room.
 *
 * Kept to two lines and placed after her message rather than instead of it. A
 * cold email that is only a link is a phishing email: the recipient has no idea
 * who is writing or why, and the click rate reflects that. The email has to
 * stand on its own; the link is what makes replying better than replying.
 */
function dealRoomBlock(ctx: OutreachContext): string {
  return [
    `Everything for this — the numbers, the deliverables, and my replies — is here:`,
    ctx.portalUrl,
    ``,
    `No account needed. Replying to this email works too.`,
  ].join("\n");
}

export function footer(ctx: OutreachContext): string {
  return [
    `—`,
    `${ctx.personaName} is a virtual agent operated by Nspiire on behalf of ${ctx.creatorName}. Replies are read by ${ctx.personaName} and by ${ctx.creatorName}.`,
    ``,
    `Nspiire — VerMar Design LLC`,
    postalAddress(),
    `Not interested? ${ctx.optOutUrl} and we won't contact ${ctx.brandName} again.`,
  ].join("\n");
}

/** Her message, the deal room, then the footer. Plain text, no tracking. */
export function outreachEmail(ctx: OutreachContext): string {
  return [ctx.body.trim(), ``, dealRoomBlock(ctx), ``, footer(ctx)].join("\n");
}

/**
 * Sent to a brand when Iris posts in the deal room, so the portal is not a page
 * nobody returns to. Deliberately thin: the message lives in the room, and
 * duplicating it here would mean maintaining two copies of the same
 * conversation and leaking the room's contents to whoever forwards the email.
 */
export function notificationEmail(
  ctx: OutreachContext & { preview: string },
): string {
  return [
    `${ctx.personaName} replied about ${ctx.creatorName} × ${ctx.brandName}:`,
    ``,
    `  "${ctx.preview.trim().slice(0, 180)}${ctx.preview.trim().length > 180 ? "…" : ""}"`,
    ``,
    `Read it and reply here: ${ctx.portalUrl}`,
    ``,
    footer(ctx),
  ].join("\n");
}
