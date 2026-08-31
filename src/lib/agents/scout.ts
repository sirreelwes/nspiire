import { ask } from "./claude";
import type { AgentResult, Guardrails } from "./types";

/**
 * Scout — finds and scores brand opportunities for a creator (blueprint §4).
 * v0: LLM-assisted candidate generation + fit scoring. Later: dedicated
 * ingestion (competitor-creator sponsor lists, ad libraries, sponsor scraping).
 */

export interface ScoutInput {
  creator: {
    id: string;
    niche: string;
    platforms: { platform: string; handle: string; followerCount: number }[];
    guardrails: Guardrails;
  };
  /** Optional seed list from ingestion pipelines */
  candidateBrands?: { name: string; category?: string; evidence?: string }[];
}

export interface ScoredOpportunity {
  brandName: string;
  category?: string;
  fitScore: number; // 0–1
  rationale: string;
}

const SYSTEM = `You are Scout, the brand-discovery agent for Nspiire, an AI manager for social media creators.
Given a creator profile, produce brand sponsorship candidates that credibly sponsor creators in this niche and size band.
Respect the do-not-work-with list absolutely. Score fit 0-1 on niche match, audience match, and evidence the brand sponsors creators.
Return strict JSON: [{"brandName","category","fitScore","rationale"}]. No prose.`;

export async function runScout(
  input: ScoutInput
): Promise<AgentResult<ScoredOpportunity[]>> {
  const user = JSON.stringify({
    niche: input.creator.niche,
    platforms: input.creator.platforms,
    doNotWorkWith: input.creator.guardrails.doNotWorkWith,
    offeredFormats: input.creator.guardrails.offeredFormats,
    seedCandidates: input.candidateBrands ?? [],
  });
  const raw = await ask(SYSTEM, user);
  let parsed: ScoredOpportunity[] = [];
  try {
    parsed = JSON.parse(raw.replace(/```json?|```/g, "").trim());
  } catch {
    return {
      agent: "scout",
      output: [],
      escalation: { reason: "Scout returned unparseable output" },
    };
  }
  const blocked = new Set(
    input.creator.guardrails.doNotWorkWith.map((b) => b.toLowerCase())
  );
  const clean = parsed.filter((o) => !blocked.has(o.brandName.toLowerCase()));
  // Shortlist is always human-reviewed in MVP (blueprint §5)
  return {
    agent: "scout",
    output: clean.sort((a, b) => b.fitScore - a.fitScore),
    needsApproval: {
      gate: "shortlist-review",
      reason: "MVP: creator reviews Scout shortlist before any outreach",
    },
  };
}
