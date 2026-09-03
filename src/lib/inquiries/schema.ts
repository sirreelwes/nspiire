import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * The public inquiry form — the only unauthenticated write in the product that
 * anyone can reach without a token.
 *
 * The brand deal room is public too, but it is gated by 32 bytes of secret
 * (lib/deals/brandAccess.ts): to post there you must already have been sent a
 * link. This form is reachable by anyone who finds the site, which makes it a
 * different problem — not a data-exposure one, an abuse one. Three defences,
 * none of them clever:
 *
 *   1. A honeypot field. Naive bots fill every input they find; a human never
 *      sees this one. Cheap, silent, and catches the bulk of it.
 *   2. A per-address rate limit, counted in the database rather than in memory,
 *      because this deploys to serverless where each instance has its own
 *      memory and an in-process counter would reset constantly.
 *   3. Hard length caps in the schema, so a submission cannot be used to write
 *      a megabyte into a row.
 *
 * What is deliberately NOT stored: the IP address. Rate limiting needs to
 * recognise a repeat submitter, which a salted hash does — it does not need to
 * know where they are, and an address in a table is personal data we would then
 * have to justify holding.
 */

export const INQUIRY_KINDS = ["BRAND", "CREATOR"] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];

/** Bands, not a number. A figure typed in a first email is not an offer. */
export const BUDGET_BANDS = [
  "Not sure yet",
  "Under $1,000",
  "$1,000–$5,000",
  "$5,000–$25,000",
  "$25,000+",
] as const;

export const InquirySchema = z.object({
  kind: z.enum(INQUIRY_KINDS).default("BRAND").catch("BRAND"),
  name: z.string().trim().min(1, "Tell us your name").max(120),
  email: z.email("That email doesn't look right").max(200),
  company: z.string().trim().max(160).default(""),
  message: z
    .string()
    .trim()
    .min(10, "A sentence or two about what you're after")
    .max(4000),
  budgetBand: z.string().trim().max(40).default(""),
});
export type InquiryInput = z.output<typeof InquirySchema>;

/** How many submissions one address may make per window. */
export const RATE_LIMIT_PER_WINDOW = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Salted hash of the submitter's address.
 *
 * Salted with the session secret so the table cannot be brute-forced back into
 * addresses — the IPv4 space is small enough that a bare SHA-256 of an address
 * is reversible by anyone with a wordlist and an afternoon.
 *
 * Returns null when there is no address to hash, which disables rate limiting
 * for that request rather than silently bucketing every anonymous submitter
 * together under one key.
 */
export function hashIp(ip: string | null | undefined): string | null {
  const value = ip?.trim();
  if (!value) return null;
  const salt =
    process.env.NSPIIRE_SESSION_SECRET ??
    process.env.NSPIIRE_OPERATOR_PASSWORD ??
    "nspiire-inquiry";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

/**
 * First address in an X-Forwarded-For chain — the client, as the edge saw it.
 *
 * Everything after the first entry is a proxy hop, and the header is
 * caller-supplied, so a determined submitter can spoof it. That is acceptable
 * here: this bounds casual abuse and nothing more, and the honeypot catches a
 * different population. Treating it as security would be the mistake.
 */
export function clientIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  const first = forwardedFor.split(",")[0]?.trim();
  return first || null;
}

/** What the page says back, keyed by who wrote in. */
export function acknowledgement(kind: InquiryKind): string {
  return kind === "BRAND"
    ? "Thanks — that's with us. A real person reads every one of these, and you'll hear back at the address you gave."
    : "Thanks — that's with us. We're onboarding creators slowly and by hand right now, so it may be a little while, but you'll get an answer either way.";
}
