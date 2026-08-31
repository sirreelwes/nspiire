import type { AgentName, AgentResult } from "./types";

/**
 * Orchestrator — routes work between specialist agents, holds the approval
 * queue, drives the deal state machine (blueprint §4).
 *
 * v0: in-process dispatcher + DB-backed approval queue (Interaction rows with
 * approval.status = "pending"). Later: proper job queue + inbound-email
 * webhook ingestion feeding Negotiator.
 */

export interface PendingApproval {
  id: string;
  agent: AgentName;
  gate: string;
  reason: string;
  payload: unknown;
  createdAt: Date;
}

export class Orchestrator {
  private approvals: PendingApproval[] = [];

  /** Handle any agent result: queue approval if gated, else return for auto-continue. */
  handle<T>(result: AgentResult<T>): { autoContinue: boolean } {
    if (result.escalation) {
      this.approvals.push({
        id: crypto.randomUUID(),
        agent: result.agent,
        gate: "escalation",
        reason: result.escalation.reason,
        payload: result.output,
        createdAt: new Date(),
      });
      return { autoContinue: false };
    }
    if (result.needsApproval) {
      this.approvals.push({
        id: crypto.randomUUID(),
        agent: result.agent,
        gate: result.needsApproval.gate,
        reason: result.needsApproval.reason,
        payload: result.output,
        createdAt: new Date(),
      });
      return { autoContinue: false };
    }
    return { autoContinue: true };
  }

  pending(): PendingApproval[] {
    return [...this.approvals];
  }

  resolve(id: string): PendingApproval | undefined {
    const i = this.approvals.findIndex((a) => a.id === id);
    if (i === -1) return undefined;
    return this.approvals.splice(i, 1)[0];
  }
}
