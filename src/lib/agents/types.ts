import { z } from "zod";

/**
 * Shared agent contracts — blueprint §4.
 * Specialist agents never act outside guardrails; anything outside bounds
 * escalates to a human approval gate.
 */

export const GuardrailsSchema = z.object({
  // Minimum acceptable rate per deliverable format, in cents
  floorRatesCents: z.record(z.string(), z.number()).default({}),
  // Max usage-rights window the agent may accept without approval (days)
  maxUsageDays: z.number().default(30),
  // Max exclusivity window agent may accept without approval (days)
  maxExclusivityDays: z.number().default(0),
  // Categories/brands the creator refuses to work with
  doNotWorkWith: z.array(z.string()).default([]),
  // Deliverable formats the creator offers
  offeredFormats: z.array(z.string()).default([]),
});
export type Guardrails = z.infer<typeof GuardrailsSchema>;

export const ApprovalPolicySchema = z.object({
  // Blueprint defaults: all true. Creator can loosen as trust builds.
  gateFirstOutreach: z.boolean().default(true),
  gateOutsideGuardrails: z.boolean().default(true), // cannot be disabled
  gateContractSend: z.boolean().default(true),
  gateMoney: z.boolean().default(true), // cannot be disabled
});
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

export type AgentName =
  /** A virtual agent holding a conversation — see lib/agents/persona.ts. */
  | "persona"
  | "scout"
  | "pitch"
  | "negotiator"
  | "counsel"
  | "books"
  | "trends";

export interface AgentResult<T> {
  agent: AgentName;
  /** What the agent wants to do next */
  output: T;
  /** If set, a human must approve before the orchestrator proceeds */
  needsApproval?: { gate: string; reason: string };
  /** Escalation: agent hit a situation outside its competence/guardrails */
  escalation?: { reason: string };
}
