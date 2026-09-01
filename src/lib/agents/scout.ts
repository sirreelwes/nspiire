import { z } from "zod";
import { askStructured } from "./claude";
import type { AgentResult } from "./types";
import type { Guardrails } from "./types";
import type { AudienceMetrics } from "@/lib/creators/metrics";
import { formatCount, formatRate } from "@/lib/creators/metrics";

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
  };
  /** Brands already in the pipeline, so Scout doesn't re-suggest them. */
  existingBrands?: string[];
  /** How many to return. Small on purpose — see BATCH_SIZE. */
  count?: number;
}

/**
 * A shortlist is only useful if a human will actually read it. Twelve brands
 * is a list you skim; four is a list you decide on. Scout is meant to be run
 * again — `existingBrands` already excludes everything in the pipeline, so
 * each run finds NEW brands rather than repeating itself.
 */
const BATCH_SIZE = 4;

const SYSTEM = `You are Scout, the brand-discovery agent for Nspiire, an AI manager for social media creators.

Given a creator's real audience numbers and their guardrails, propose brands that plausibly sponsor creators in this niche AND at this size band. Size matters as much as topic: a creator with 40k followers and a brand that only works with 5M-follower accounts is a bad fit however well the topic matches, and vice versa.

Rules:
- The do-not-work-with list is absolute. Never propose a brand on it, or one whose category is on it.
- Only suggest formats that appear in the creator's offered formats.
- Do not invent contact names or email addresses. "evidence" must be something a human could go and check — a named creator-sponsorship the brand has run, an affiliate or ambassador programme, a category norm — not a guess dressed up as a fact.
- If you are unsure a brand actually sponsors creators, say so in the evidence rather than asserting it.
- fitScore is about fit for THIS creator. Reserve above 0.8 for brands you would bet on.
- Prefer brands the creator could realistically reach now over aspirational household names.
- Return exactly the number asked for in "howMany". Fewer is better than padding the list with brands you do not believe in.`;

export async function runScout(
  input: ScoutInput,
): Promise<AgentResult<ScoredOpportunity[]>> {
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
      offeredFormats: input.creator.guardrails.offeredFormats,
    },
    alreadyInPipeline: input.existingBrands ?? [],
    howMany: input.count ?? BATCH_SIZE,
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

  const clean = parsed.opportunities.filter((o) => {
    const name = o.brandName.trim().toLowerCase();
    const category = o.category.trim().toLowerCase();
    if (!name || seen.has(name)) return false;
    if (blocked.some((b) => name.includes(b) || category.includes(b))) return false;
    seen.add(name);
    return true;
  });

  // Enforce the count in code too. "howMany" is a hint in a JSON payload, and
  // a run that asked for 12 came back with 17 — the same reason the guardrails
  // are re-checked above rather than trusted to the prompt. Sorted first, so a
  // trimmed batch is the best of what came back, not the first few.
  const batch = clean
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, input.count ?? BATCH_SIZE);

  return {
    agent: "scout",
    output: batch,
    needsApproval: {
      gate: "shortlist-review",
      reason: `${input.creator.name} reviews the shortlist before anything goes out`,
    },
  };
}
