import { ask } from "./claude";
import type { AgentResult } from "./types";

/**
 * Counsel — contract assembly + inbound-contract redlining (blueprint §4).
 * Document automation, not legal advice (blueprint §8): outputs carry a
 * disclaimer and contract-send is always human-gated.
 */

export interface CounselAssembleInput {
  mode: "assemble";
  templateId: string; // from the clause/template library
  terms: Record<string, unknown>;
}

export interface CounselRedlineInput {
  mode: "redline";
  contractText: string;
  guardrailsSummary: string;
}

export type CounselInput = CounselAssembleInput | CounselRedlineInput;

export interface RiskFlag {
  clause: string;
  severity: "low" | "medium" | "high";
  issue: string; // e.g. "perpetual usage rights", "broad exclusivity"
  suggestion: string;
}

export interface CounselOutput {
  documentText?: string; // assemble mode
  riskFlags: RiskFlag[]; // redline mode (and self-check in assemble mode)
}

const SYSTEM = `You are Counsel, the contract agent for Nspiire, an AI manager for social media creators.
Assemble mode: fill the given template's terms into a clean sponsorship agreement. Always include: deliverables, usage rights with a defined window, exclusivity scope+window, payment schedule, kill fee, and FTC disclosure obligations.
Redline mode: flag dangerous clauses — perpetual/undefined usage rights, broad or long exclusivity, payment terms >net-45, unlimited revisions, moral-rights waivers, non-mutual termination.
You produce document automation, NOT legal advice.
Return strict JSON: {"documentText":string|null,"riskFlags":[{"clause","severity","issue","suggestion"}]}. No prose.`;

export async function runCounsel(
  input: CounselInput
): Promise<AgentResult<CounselOutput>> {
  const raw = await ask(SYSTEM, JSON.stringify(input));
  let out: CounselOutput;
  try {
    out = JSON.parse(raw.replace(/```json?|```/g, "").trim());
  } catch {
    return {
      agent: "counsel",
      output: { riskFlags: [] },
      escalation: { reason: "Counsel returned unparseable output" },
    };
  }
  // Contract-send is ALWAYS gated (blueprint §4 approval gates)
  return {
    agent: "counsel",
    output: out,
    needsApproval: {
      gate: "contract-send",
      reason: "Contracts never leave without human sign-off",
    },
  };
}
