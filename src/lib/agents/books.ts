import type { AgentResult } from "./types";

/**
 * Books — invoicing, payment tracking, chasing (blueprint §4).
 * MVP: tracking + invoicing only, never holds funds (blueprint §8 —
 * money-transmitter risk). Payment rails: CardPointe gateway (cards + ACH).
 * Everything money-touching is gated (gateMoney cannot be disabled).
 */

export interface BooksInput {
  action: "create-invoice" | "chase-overdue" | "record-payment";
  deal: { id: string; brandName: string };
  invoice?: { amountCents: number; currency: string; dueAt?: string };
  paymentRef?: Record<string, unknown>; // CardPointe txn/ACH reference
}

export interface BooksOutput {
  action: BooksInput["action"];
  payload: Record<string, unknown>;
}

export async function runBooks(
  input: BooksInput
): Promise<AgentResult<BooksOutput>> {
  // v0 is deterministic scaffolding; CardPointe integration lands here.
  // TODO(cardpointe): gateway auth, hosted payment link / ACH invoice,
  // webhook → record-payment → deal transition INVOICED → PAID.
  return {
    agent: "books",
    output: { action: input.action, payload: { ...input } },
    needsApproval: {
      gate: "money",
      reason: "All money actions require human approval",
    },
  };
}
