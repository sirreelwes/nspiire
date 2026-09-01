import { z } from "zod";
import { askStructured } from "./claude";
import type { AgentResult } from "./types";
import type { Guardrails } from "./types";
import type { AudienceMetrics } from "@/lib/creators/metrics";
import { formatCount, formatRate } from "@/lib/creators/metrics";
import { MIN_DEAL_CENTS } from "@/lib/deals/policy";
import { formatMoney, lookupByFormat } from "@/lib/deals/terms";

/**
 * Scout — finds and scores brand partners for a creator (blueprint §4).
 *
 * Grounded in the creator's real, synced metrics rather than vibes. Scout does
 * not invent contact details: a name and a category are things a human can
 * verify in a minute, an email address is something that gets sent to a
 * stranger. Contacts come from research later, not from a language model.
 *
 * The shortlist is ALWAYS human-reviewed before any outreach (blueprint §5),
 * so this returns needsApproval unconditionally.
 */

export const ScoredOpportunitySchema = z.object({
  brandName: z.string(),
  category: z.string(),
  /** 0-1. How well this brand fits THIS creator, not how big the brand is. */
  fitScore: z.number().min(0).max(1),
  /** Why, in one or two sentences a creator would actually find useful. */
  rationale: z.string(),
  /** What suggests they sponsor creators at this tier — the checkable part. */
  evidence: z.string(),
  /** Deliverable format from the creator's rate card this brand suits best. */
  suggestedFormat: z.string(),
});
export type ScoredOpportunity = z.infer<typeof ScoredOpportunitySchema>;

const ScoutOutputSchema = z.object({
  opportunities: z.array(ScoredOpportunitySchema),
});

export interface ScoutInput {
  creator: {
    name: string;
    niche: string;
    platforms: {
      platform: string;
      handle: string;
      followerCount: number | null;
      metrics: AudienceMetrics;
    }[];
    guardrails: Guardrails;
    /** The Creator.rateCard column — `{ [format]: cents }`. */
    rateCard: Record<string, number>;
  };
  /** Brands already in the pipeline, so Scout doesn't re-suggest them. */
  existingBrands?: string[];
  count?: number;
}

const SYSTEM = `You are Scout, the brand-discovery agent for Nspiire, an AI manager for social media creators.

Given a creator's real audience numbers and their guardrails, propose brands that plausibly sponsor creators in this niche AND at this size band. Size matters as much as topic: a creator with 40k followers and a brand that only works with 5M-follower accounts is a bad fit however well the topic matches, and vice versa.

Rules:
- The do-not-work-with list is absolute. Never propose a brand on it, or one whose category is on it.
- Only suggest formats that appear in the creator's offered formats. Those have already been filtered to the ones worth pursuing — do not suggest any other.
- Every brand you propose must plausibly have the budget for the rate shown against the format you suggest. A brand that only ever does product-gifting is not a lead.
- Do not invent contact names or email addresses. "evidence" must be something a human could go and check — a named creator-sponsorship the brand has run, an affiliate or ambassador programme, a category norm — not a guess dressed up as a fact.
- If you are unsure a brand actually sponsors creators, say so in the evidence rather than asserting it.
- fitScore is about fit for THIS creator. Reserve above 0.8 for brands you would bet on.
- Prefer brands the creator could realistically reach now over aspirational household names.`;

export async function runScout(
  input: ScoutInput,
): Promise<AgentResult<ScoredOpportunity[]>> {
  // House sourcing floor (lib/deals/policy.ts): Nspiire does not go looking
  // for deals under $250, so a format priced below it is not something to send
  // Scout hunting for. Filtering here rather than in the prompt means the
  // model is never offered the option, and never has to be trusted with it.
  const pursuable = input.creator.guardrails.offeredFormats.filter((format) => {
    const rate = lookupByFormat(input.creator.rateCard, format);
    return rate != null && rate >= MIN_DEAL_CENTS;
  });
  if (pursuable.length === 0) {
    return {
      agent: "scout",
      output: [],
      escalation: {
        reason: `Nothing on ${input.creator.name}'s rate card reaches the ${formatMoney(MIN_DEAL_CENTS)} minimum Nspiire sources at, so there's nothing to hunt for. Raise the rate card, or run this deal by hand.`,
      },
    };
  }

  const user = JSON.stringify({
    creator: {
      niche: input.creator.niche,
      platforms: input.creator.platforms.map((p) => ({
        platform: p.platform,
        followers: p.followerCount,
        // Send the readable forms too — a model reasons better about
        // "1.2M followers, 4.1% engagement" than about raw floats.
        readable: `${formatCount(p.followerCount)} followers, ${formatRate(
          p.metrics.engagementRateByFollowers,
        )} engagement by followers, ${formatCount(p.metrics.avgViews)} avg views over ${p.metrics.sampleSize} recent posts`,
        avgViews: p.metrics.avgViews,
        engagementRateByViews: p.metrics.engagementRateByViews,
        engagementRateByFollowers: p.metrics.engagementRateByFollowers,
        metricsSource: p.metrics.source,
      })),
    },
    guardrails: {
      doNotWorkWith: input.creator.guardrails.doNotWorkWith,
      // Only the formats worth pursuing, each with what the creator charges —
      // a brand that can't fund the rate isn't a lead.
      offeredFormats: pursuable.map((format) => ({
        format,
        rate: formatMoney(lookupByFormat(input.creator.rateCard, format)),
      })),
    },
    alreadyInPipeline: input.existingBrands ?? [],
    howMany: input.count ?? 12,
  });

  let parsed;
  try {
    parsed = await askStructured(SYSTEM, user, ScoutOutputSchema);
  } catch (err) {
    return {
      agent: "scout",
      output: [],
      escalation: {
        reason: err instanceof Error ? err.message : "Scout failed",
      },
    };
  }

  // Enforce the guardrails in code as well as in the prompt. A model that is
  // told not to suggest a blocked brand mostly won't; "mostly" is not a
  // guardrail.
  const blocked = input.creator.guardrails.doNotWorkWith
    .map((b) => b.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set(
    (input.existingBrands ?? []).map((b) => b.trim().toLowerCase()),
  );

  const pursuableKeys = new Set(pursuable.map((f) => f.trim().toLowerCase()));

  const clean = parsed.opportunities.filter((o) => {
    const name = o.brandName.trim().toLowerCase();
    const category = o.category.trim().toLowerCase();
    if (!name || seen.has(name)) return false;
    if (blocked.some((b) => name.includes(b) || category.includes(b))) return false;
    // Same reason as the blocked-brand filter above: a model told to stay
    // inside the pursuable formats mostly will, and "mostly" isn't a floor.
    if (!pursuableKeys.has(o.suggestedFormat.trim().toLowerCase())) return false;
    seen.add(name);
    return true;
  });

  return {
    agent: "scout",
    output: clean.sort((a, b) => b.fitScore - a.fitScore),
    needsApproval: {
      gate: "shortlist-review",
      reason: `${input.creator.name} reviews the shortlist before anything goes out`,
    },
  };
}
