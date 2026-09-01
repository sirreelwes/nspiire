import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Deal terms — the JSON blob on Deal.terms.
 *
 * This is the one definition of that shape. Three things read it and they
 * must agree: the terms editor on the deal page, `checkDealGuardrails()`,
 * and `writeBenchmark()` in stateMachine.ts (which turns a PAID deal into an
 * anonymized TermsBenchmark row). Change it here, check those three.
 *
 * Usage and exclusivity are stored as day counts, not prose, so they can be
 * compared directly against `Guardrails.maxUsageDays` / `maxExclusivityDays`.
 * A guardrail you can't mechanically check isn't a guardrail.
 */
export const DealTermsSchema = z.object({
  /** Deliverable format. Matches a rate-card key when it can. */
  format: z.string().trim().default(""),
  /** What the brand pays, in cents. null = not yet quoted. */
  amountCents: z.number().int().min(0).nullable().default(null),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code")
    .default("USD"),
  /** How long the brand may run the content. null = unstated, 0 = organic only. */
  usageDays: z.number().int().min(0).nullable().default(null),
  /** Category lockout window. null = unstated. */
  exclusivityDays: z.number().int().min(0).nullable().default(null),
  /** Free-text: what's actually being delivered, timing, revisions. */
  deliverables: z.string().trim().default(""),
  notes: z.string().trim().default(""),
});
export type DealTerms = z.output<typeof DealTermsSchema>;

/** Read a Deal.terms Json column. Unknown/legacy keys are dropped, not thrown. */
export function parseTerms(value: unknown): DealTerms {
  const parsed = DealTermsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DealTermsSchema.parse({});
}

/** "$1,250" | "1250.50" -> 125000 | 125050. Empty -> null. */
export function toCents(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function formatMoney(cents: number | null, currency = "USD"): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatDays(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "None";
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * A stable hash of the MATERIAL terms — what the creator is actually agreeing
 * to when they approve.
 *
 * Money, format, usage window, exclusivity window and deliverables are in.
 * `notes` is deliberately out: it carries the advisor's reasoning and operator
 * commentary, and re-wording that must not invalidate a creator's approval.
 *
 * Fields are listed explicitly rather than serialising the object, so adding a
 * field to DealTermsSchema is a decision about whether it is material rather
 * than something that silently starts invalidating every approval.
 */
export function termsFingerprint(terms: DealTerms): string {
  const material = [
    terms.amountCents ?? "",
    terms.currency,
    terms.format,
    terms.usageDays ?? "",
    terms.exclusivityDays ?? "",
    terms.deliverables,
  ].join("\u0000");
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

/** True when `deal` carries a live approval for the terms it currently holds. */
export function termsApprovalIsCurrent(deal: {
  termsApprovedAt: Date | null;
  termsApprovedFingerprint: string | null;
  terms: unknown;
}): boolean {
  if (!deal.termsApprovedAt || !deal.termsApprovedFingerprint) return false;
  return deal.termsApprovedFingerprint === termsFingerprint(parseTerms(deal.terms));
}
