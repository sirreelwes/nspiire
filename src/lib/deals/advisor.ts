import type { AudienceMetrics } from "@/lib/creators/metrics";
import { formatMoney } from "@/lib/deals/terms";

/**
 * The deal-terms advisor — what a deal should be worth.
 *
 * DELIBERATELY NOT A MODEL CALL. Every number here is arithmetic over data the
 * creator or a closed deal actually supplied. A language model asked to price a
 * sponsorship will produce a confident, plausible, unsourced figure, and that
 * figure would go into a real negotiation about real money. Claude's judgement
 * is used elsewhere in this product; the price is not one of those places.
 *
 * Three bases, in descending order of trust:
 *   1. benchmarks — closed deals for this niche/platform/band/format. The moat.
 *   2. rate-card  — what the creator says they charge, nudged by how their
 *                   engagement compares with the band it was priced against.
 *   3. none       — say so. An unsourced number is worse than no number.
 */

export type AdviceBasis = "benchmarks" | "rate-card" | "none";

export interface TermsAdvice {
  basis: AdviceBasis;
  /** Suggested ask, in cents. Null when there is nothing to base it on. */
  amountCents: number | null;
  /** A defensible range to negotiate inside. */
  lowCents: number | null;
  highCents: number | null;
  /** The creator's walk-away for this format, straight from their guardrails. */
  floorCents: number | null;
  confidence: "high" | "medium" | "low";
  /** Plain sentences explaining every number above. Shown to the creator. */
  reasoning: string[];
}

export interface BenchmarkRow {
  amountCents: number;
  format: string;
}

export interface AdviceInput {
  format: string;
  /** rateCard[format] — the creator's asking price, in cents. */
  rateCard: Record<string, number>;
  /** guardrails.floorRatesCents[format] — the walk-away, in cents. */
  floorRates: Record<string, number>;
  metrics: AudienceMetrics;
  /** Closed-deal benchmarks already narrowed to this niche/platform/band. */
  benchmarks?: BenchmarkRow[];
}

/** Case-insensitive lookup — rate-card keys are typed by the creator. */
function lookup(map: Record<string, number>, format: string): number | null {
  const want = format.trim().toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.trim().toLowerCase() === want) return v;
  }
  return null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Engagement multiplier. A creator whose posts land well is worth more than
 * their follower count alone suggests, and vice versa — but the effect is
 * capped hard in both directions. This nudges a rate the creator already set;
 * it does not invent one, and it never pushes below their floor.
 *
 * 3% engagement-by-followers is the pivot: at or near it the rate card stands.
 */
const PIVOT_ENGAGEMENT = 0.03;
const MAX_ADJUSTMENT = 0.25;

function engagementMultiplier(m: AudienceMetrics): { factor: number; note: string | null } {
  const er = m.engagementRateByFollowers;
  if (er == null || m.sampleSize < 5) {
    return {
      factor: 1,
      note:
        m.sampleSize < 5
          ? "No engagement adjustment — fewer than 5 recent posts to average over."
          : "No engagement adjustment — engagement rate unknown.",
    };
  }
  const raw = er / PIVOT_ENGAGEMENT - 1;
  const factor = 1 + Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, raw));
  const pct = Math.round((factor - 1) * 100);
  if (pct === 0) return { factor, note: null };
  return {
    factor,
    note: `${pct > 0 ? "+" : ""}${pct}% for engagement of ${(er * 100).toFixed(1)}% against a 3.0% pivot${
      Math.abs(raw) > MAX_ADJUSTMENT ? " (capped at 25%)" : ""
    }.`,
  };
}

export function proposeTerms(input: AdviceInput): TermsAdvice {
  const floorCents = lookup(input.floorRates, input.format);
  const reasoning: string[] = [];

  if (input.metrics.source === "manual") {
    reasoning.push(
      "Metrics were entered by hand, not synced from the platform — treat this as an estimate until the account is connected.",
    );
  }

  // 1. Closed deals beat everything else.
  const relevant = (input.benchmarks ?? []).filter(
    (b) => b.format.trim().toLowerCase() === input.format.trim().toLowerCase(),
  );
  if (relevant.length >= 3) {
    const amounts = relevant.map((b) => b.amountCents);
    const mid = median(amounts);
    reasoning.push(
      `Based on ${relevant.length} closed ${input.format} deals for comparable creators: median ${formatMoney(mid)}, range ${formatMoney(Math.min(...amounts))}–${formatMoney(Math.max(...amounts))}.`,
    );
    return {
      basis: "benchmarks",
      amountCents: mid,
      lowCents: Math.min(...amounts),
      highCents: Math.max(...amounts),
      floorCents,
      confidence: relevant.length >= 8 ? "high" : "medium",
      reasoning,
    };
  }
  if (relevant.length > 0) {
    reasoning.push(
      `Only ${relevant.length} closed ${input.format} deal${relevant.length === 1 ? "" : "s"} on record — too few to price from, so falling back to the rate card.`,
    );
  }

  // 2. The creator's own rate card.
  const card = lookup(input.rateCard, input.format);
  if (card == null) {
    reasoning.push(
      `"${input.format}" isn't on the rate card and no closed deals match it, so there's nothing to price from. Add it to the rate card first.`,
    );
    return {
      basis: "none",
      amountCents: null,
      lowCents: null,
      highCents: null,
      floorCents,
      confidence: "low",
      reasoning,
    };
  }

  const { factor, note } = engagementMultiplier(input.metrics);
  const adjusted = Math.round(card * factor);
  // Never propose below the creator's own walk-away.
  const amountCents = floorCents != null ? Math.max(adjusted, floorCents) : adjusted;

  reasoning.push(`Rate card for ${input.format}: ${formatMoney(card)}.`);
  if (note) reasoning.push(note);
  if (floorCents != null && adjusted < floorCents) {
    reasoning.push(
      `The adjustment would have gone under the ${formatMoney(floorCents)} floor, so the floor stands.`,
    );
  }

  return {
    basis: "rate-card",
    amountCents,
    lowCents: floorCents ?? Math.round(amountCents * 0.85),
    highCents: Math.round(amountCents * 1.2),
    floorCents,
    confidence: input.metrics.source === "tiktok-api" ? "medium" : "low",
    reasoning,
  };
}
