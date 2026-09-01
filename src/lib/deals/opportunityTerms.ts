import { proposeTerms, type TermsAdvice } from "./advisor";
import { parseGuardrails } from "./guardrails";
import { parseMetrics } from "@/lib/creators/metrics";
import { followerBand } from "./stateMachine";

/**
 * What Iris would ask a brand for, for one opportunity.
 *
 * Lifted out of approveOpportunity so the creator sees the SAME number before
 * approving outreach that gets written onto the deal afterwards. Two code paths
 * computing a price independently is how a creator ends up approving one figure
 * and finding another on the deal.
 *
 * Not a model call — proposeTerms is deterministic arithmetic over closed-deal
 * benchmarks, the rate card and engagement. Safe to run while rendering a list.
 */
export async function adviseForOpportunity(
  // Prisma client; typed loosely for the same reason stateMachine does it —
  // this module must typecheck before `prisma generate` has run.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: {
    creator: { niche: string | null; rateCard: unknown; guardrails: unknown };
    social?: { platform: string; followerCount: number | null; metrics: unknown } | null;
    format: string;
  },
): Promise<TermsAdvice> {
  const guardrails = parseGuardrails(input.creator.guardrails);
  const metrics = parseMetrics(input.social?.metrics);

  // Matched exactly the way writeBenchmark() records them on PAID.
  const benchmarks = input.social
    ? await db.termsBenchmark.findMany({
        where: {
          niche: input.creator.niche ?? "unknown",
          platform: input.social.platform,
          followerBand: followerBand(input.social.followerCount ?? 0),
        },
        select: { amountCents: true, format: true },
      })
    : [];

  return proposeTerms({
    format: input.format,
    rateCard: (input.creator.rateCard ?? {}) as Record<string, number>,
    floorRates: guardrails.floorRatesCents,
    metrics,
    benchmarks,
  });
}

/** The usage and exclusivity Iris would open with — straight from guardrails. */
export function windowsFor(creatorGuardrails: unknown) {
  const g = parseGuardrails(creatorGuardrails);
  return { usageDays: g.maxUsageDays, exclusivityDays: g.maxExclusivityDays };
}
