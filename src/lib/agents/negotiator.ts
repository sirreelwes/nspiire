import { ask } from "./claude";
import { GuardrailsSchema, type AgentResult, type Guardrails } from "./types";

/**
 * Negotiator — handles back-and-forth within creator guardrails (blueprint §4).
 * Hard rule: any term outside guardrails NEVER auto-sends. It escalates.
 * gateOutsideGuardrails cannot be disabled (types.ts).
 */

export interface NegotiatorInput {
  guardrails: Guardrails;
  dealTerms: Record<string, unknown>; // current live terms
  inboundMessage: { from: string; subject?: string; body: string };
  threadSummary: string; // orchestrator-maintained running summary
  brandRelationshipNotes?: Record<string, unknown>;
}

export interface NegotiatorOutput {
  analysis: {
    proposedTerms: Record<string, unknown>;
    withinGuardrails: boolean;
    violations: string[];
  };
  draftReply: { subject: string; body: string };
  recommendedAction: "reply" | "accept" | "counter" | "escalate";
}

const SYSTEM = `You are Negotiator, the deal-negotiation agent for Nspiire, an AI manager for social media creators.
You negotiate on the creator's behalf, within hard guardrails (floor rates, max usage days, max exclusivity days).
Analyze the brand's inbound message: extract any proposed terms, check each against guardrails, then draft the reply you would send.
Never accept or concede below floor rate. Be warm, professional, and firm; protect the relationship — this brand may pay for years.
Return strict JSON: {"analysis":{"proposedTerms":{},"withinGuardrails":bool,"violations":[]},"draftReply":{"subject","body"},"recommendedAction":"reply|accept|counter|escalate"}. No prose.`;

export async function runNegotiator(
  input: NegotiatorInput
): Promise<AgentResult<NegotiatorOutput>> {
  const guardrails = GuardrailsSchema.parse(input.guardrails);
  const raw = await ask(SYSTEM, JSON.stringify({ ...input, guardrails }));
  let out: NegotiatorOutput;
  try {
    out = JSON.parse(raw.replace(/```json?|```/g, "").trim());
  } catch {
    return {
      agent: "negotiator",
      output: {
        analysis: { proposedTerms: {}, withinGuardrails: false, violations: [] },
        draftReply: { subject: "", body: "" },
        recommendedAction: "escalate",
      },
      escalation: { reason: "Negotiator returned unparseable output" },
    };
  }
  // Belt-and-suspenders: model says outside guardrails OR recommends escalate → gate
  if (!out.analysis.withinGuardrails || out.recommendedAction === "escalate") {
    return {
      agent: "negotiator",
      output: out,
      needsApproval: {
        gate: "outside-guardrails",
        reason:
          out.analysis.violations.join("; ") ||
          "Negotiator recommends human review",
      },
    };
  }
  return { agent: "negotiator", output: out };
}
