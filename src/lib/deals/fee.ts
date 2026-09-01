import { formatMoney, type DealTerms } from "@/lib/deals/terms";

/**
 * The Nspiire deal fee — what the *brand* pays Nspiire when a deal closes.
 *
 * This is how the product makes money, and the direction matters: a human
 * manager takes 15–20% out of the creator's cheque. Nspiire does not. The fee
 * is charged to the brand on top of the negotiated rate, and the creator's
 * number is never touched by it. A creator who agreed $5,000 gets $5,000; the
 * brand pays $5,250. Anything that quietly nets the fee out of the creator's
 * side breaks the promise the product is built on.
 *
 * DELIBERATELY NOT A MODEL CALL, for the same reason as the terms advisor:
 * this is a price on an invoice. It is arithmetic over the agreed terms, it is
 * the same every time it runs, and every line of it can be read back to a
 * brand that asks "why $250?".
 *
 * The schedule
 * ------------
 * A marginal take rate, banded like tax brackets so a bigger deal never costs
 * a brand less than a smaller one, and so the take regresses as deals grow —
 * a $200K buy does not consume forty times the platform work of a $5K one.
 *
 *     first  $5,000   5%
 *     next  $20,000   4%   (to $25,000)
 *     next  $75,000   3%   (to $100,000)
 *     above $100,000  2%
 *
 * Baseline check: a 1M-follower creator at $5,000 a video sits exactly at the
 * top of the first band — 5% × $5,000 = **$250**.
 *
 * Then, in this order:
 *   1. surcharges for the terms that cost us work (long usage, exclusivity)
 *   2. the repeat-brand discount
 *   3. the $25 floor and the $25,000 cap, which clamp whatever comes out
 *
 * The $25 base fee is not a separate charge bolted onto the percentage — it is
 * the same 5% evaluated at $500. So it only ever binds below $500, and the
 * schedule stays continuous: no deal size where paying more gets you a smaller
 * bill. Below $500 the deal still has to be papered, tracked and chased, and
 * that costs the same as it does at $5,000.
 */

/** The floor. Also exactly the first-band rate at $500 — see the note above. */
export const BASE_FEE_CENTS = 2_500;

/**
 * Ceiling on a single deal fee. Rarely binds (it takes a ~$1.2M deal), and it
 * exists so an outlier buy never produces a number no one will sign off.
 */
export const FEE_CAP_CENTS = 2_500_000;

export interface FeeTier {
  /** Top of the band, in cents. null = everything above the previous band. */
  upToCents: number | null;
  rate: number;
}

/** Marginal, in order. Each rate applies only to the slice inside its band. */
export const FEE_TIERS: FeeTier[] = [
  { upToCents: 500_000, rate: 0.05 },
  { upToCents: 2_500_000, rate: 0.04 },
  { upToCents: 10_000_000, rate: 0.03 },
  { upToCents: null, rate: 0.02 },
];

/**
 * Surcharges. Both bill the brand for work the brand is asking for: a long
 * licence and a category lockout are extra value to them, and extra contract
 * and monitoring work for us. Thresholds sit well past what a normal deal
 * asks for, so an ordinary 30-day organic deal never sees them.
 */
export const LONG_USAGE_DAYS = 180;
export const LONG_USAGE_SURCHARGE = 0.1;
export const LONG_EXCLUSIVITY_DAYS = 90;
export const LONG_EXCLUSIVITY_SURCHARGE = 0.1;

/**
 * Repeat-brand discount, on the count of deals this brand has already taken to
 * PAID on Nspiire. This is the anti-disintermediation lever: the cheapest way
 * for a brand to keep booking a creator has to be through us, or they will
 * book the second deal over email and we never see it.
 */
export function repeatDiscountRate(priorPaidDeals: number): number {
  if (priorPaidDeals >= 4) return 0.2;
  if (priorPaidDeals >= 1) return 0.1;
  return 0;
}

export type FeeBasis =
  /** Terms carry an agreed amount; the schedule ran. */
  | "computed"
  /** Gifting or product-only. No fee. */
  | "zero-value"
  /** Nothing quoted yet, so nothing to take a percentage of. */
  | "unpriced";

export interface FeeLine {
  label: string;
  /** Signed cents: tier rows and surcharges positive, discounts negative. */
  amountCents: number;
}

export interface FeeQuote {
  basis: FeeBasis;
  /** What the brand owes Nspiire. Null only when the deal is unpriced. */
  feeCents: number | null;
  /** feeCents ÷ deal value. Null when there is no value to divide by. */
  effectiveRate: number | null;
  /** Deal value + fee — the whole cheque the brand writes. */
  brandTotalCents: number | null;
  /** What the creator is paid. Never reduced by the fee. */
  creatorCents: number | null;
  currency: string;
  /** The arithmetic, in order, for the invoice and the deal page. */
  lines: FeeLine[];
  /** Plain sentences explaining every number above. Shown to humans. */
  reasoning: string[];
}

export interface FeeInput {
  terms: DealTerms;
  /** Deals this brand has already taken to PAID on Nspiire. Drives the discount. */
  priorPaidDeals?: number;
}

/** "5%" | "4.5%" — trailing ".0" reads like false precision on a rate card. */
function formatRate(rate: number): string {
  const pct = rate * 100;
  return `${Number.isInteger(pct) ? pct : Number(pct.toFixed(2))}%`;
}

/**
 * Walk the bands, charging each rate only on the slice of the deal inside it.
 * Returns one line per band the deal actually reaches.
 */
function walkTiers(amountCents: number): { subtotal: number; lines: FeeLine[] } {
  const lines: FeeLine[] = [];
  let subtotal = 0;
  let from = 0;

  for (const tier of FEE_TIERS) {
    const top = tier.upToCents ?? Infinity;
    const portion = Math.min(amountCents, top) - from;
    if (portion <= 0) break;
    const cents = Math.round(portion * tier.rate);
    lines.push({
      label: `${formatRate(tier.rate)} on the ${from === 0 ? "first" : "next"} ${formatMoney(portion)}`,
      amountCents: cents,
    });
    subtotal += cents;
    from = top;
  }

  return { subtotal, lines };
}

/**
 * Quote the fee for a set of deal terms.
 *
 * Pure and total: same terms in, same number out, no I/O. Callers that want
 * the repeat discount pass `priorPaidDeals`; leaving it off just means no
 * discount, never a wrong one.
 */
export function quoteDealFee(input: FeeInput): FeeQuote {
  const { terms } = input;
  const currency = terms.currency || "USD";
  const priorPaidDeals = Math.max(0, Math.trunc(input.priorPaidDeals ?? 0));

  if (terms.amountCents == null) {
    return {
      basis: "unpriced",
      feeCents: null,
      effectiveRate: null,
      brandTotalCents: null,
      creatorCents: null,
      currency,
      lines: [],
      reasoning: [
        "No amount agreed yet, so there's no fee to quote — the fee follows the deal value.",
      ],
    };
  }

  if (terms.amountCents === 0) {
    return {
      basis: "zero-value",
      feeCents: 0,
      effectiveRate: null,
      brandTotalCents: 0,
      creatorCents: 0,
      currency,
      lines: [],
      reasoning: [
        "Zero-value deal — gifting or product-only. No fee: the base fee is a minimum on paid deals, not a charge for existing.",
      ],
    };
  }

  const reasoning: string[] = [];

  // The rates are just multiplication and work in any currency. The floor and
  // the cap are dollar figures, and this module has no FX rate to convert them
  // with. Say so rather than silently treating €25 as $25.
  if (currency !== "USD") {
    reasoning.push(
      `Terms are in ${currency}. The rates apply as-is, but the ${formatMoney(BASE_FEE_CENTS)} minimum and ${formatMoney(FEE_CAP_CENTS)} cap are USD figures used here without conversion — check them before invoicing.`,
    );
  }

  const { subtotal, lines } = walkTiers(terms.amountCents);
  let running = subtotal;
  reasoning.push(
    `Tiered take on ${formatMoney(terms.amountCents, currency)}: ${formatMoney(subtotal, currency)}.`,
  );

  // 1. Surcharges, on the tiered subtotal.
  const surcharges: { why: string; rate: number }[] = [];
  if (terms.usageDays != null && terms.usageDays >= LONG_USAGE_DAYS) {
    surcharges.push({
      why: `${terms.usageDays} days of usage rights`,
      rate: LONG_USAGE_SURCHARGE,
    });
  }
  if (
    terms.exclusivityDays != null &&
    terms.exclusivityDays >= LONG_EXCLUSIVITY_DAYS
  ) {
    surcharges.push({
      why: `${terms.exclusivityDays} days of category exclusivity`,
      rate: LONG_EXCLUSIVITY_SURCHARGE,
    });
  }
  if (surcharges.length > 0) {
    const rate = surcharges.reduce((sum, s) => sum + s.rate, 0);
    const cents = Math.round(subtotal * rate);
    lines.push({
      label: `Rights surcharge (+${formatRate(rate)})`,
      amountCents: cents,
    });
    running += cents;
    reasoning.push(
      `+${formatRate(rate)} for ${surcharges.map((s) => s.why).join(" and ")} — the brand is buying more than the post, and that's more contract and monitoring work.`,
    );
  }

  // 2. Repeat-brand discount, on the surcharged subtotal.
  const discountRate = repeatDiscountRate(priorPaidDeals);
  if (discountRate > 0) {
    const cents = Math.round(running * discountRate);
    lines.push({
      label: `Repeat-brand discount (−${formatRate(discountRate)})`,
      amountCents: -cents,
    });
    running -= cents;
    reasoning.push(
      `${priorPaidDeals} deal${priorPaidDeals === 1 ? "" : "s"} already paid on Nspiire, so −${formatRate(discountRate)}. Booking the next one through us stays cheaper than going direct.`,
    );
  }

  // 3. Floor and cap, applied last so no adjustment can duck under or over them.
  let feeCents = running;
  if (feeCents < BASE_FEE_CENTS) {
    lines.push({
      label: `Minimum fee (${formatMoney(BASE_FEE_CENTS, currency)})`,
      amountCents: BASE_FEE_CENTS - feeCents,
    });
    reasoning.push(
      `That comes to less than the ${formatMoney(BASE_FEE_CENTS, currency)} minimum, so the minimum stands — a small deal still has to be papered, tracked and chased.`,
    );
    feeCents = BASE_FEE_CENTS;
  } else if (feeCents > FEE_CAP_CENTS) {
    lines.push({
      label: `Fee cap (${formatMoney(FEE_CAP_CENTS, currency)})`,
      amountCents: FEE_CAP_CENTS - feeCents,
    });
    reasoning.push(
      `Capped at ${formatMoney(FEE_CAP_CENTS, currency)}, the most Nspiire charges on a single deal.`,
    );
    feeCents = FEE_CAP_CENTS;
  }

  const effectiveRate = feeCents / terms.amountCents;
  reasoning.push(
    `Fee: ${formatMoney(feeCents, currency)} — ${(effectiveRate * 100).toFixed(1)}% of the deal, paid by the brand on top. The creator is still paid ${formatMoney(terms.amountCents, currency)} in full.`,
  );

  return {
    basis: "computed",
    feeCents,
    effectiveRate,
    brandTotalCents: terms.amountCents + feeCents,
    creatorCents: terms.amountCents,
    currency,
    lines,
    reasoning,
  };
}
