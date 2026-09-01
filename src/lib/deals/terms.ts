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

/**
 * Look a format up in a `{ [format]: cents }` map — a rate card, floor rates.
 * Those keys are typed by the creator, so "Dedicated Video" and "dedicated
 * video" are the same row. Shared, so the terms advisor, the guardrail check
 * and Scout all agree on what "the same format" means.
 */
export function lookupByFormat(
  map: Record<string, number>,
  format: string,
): number | null {
  const want = format.trim().toLowerCase();
  if (!want) return null;
  for (const [key, cents] of Object.entries(map)) {
    if (key.trim().toLowerCase() === want) return cents;
  }
  return null;
}

export function formatDays(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "None";
  return `${days} day${days === 1 ? "" : "s"}`;
}
