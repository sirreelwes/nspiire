import type { AgentResult } from "./types";
import { quoteDealFee, type FeeQuote } from "@/lib/deals/fee";
import type { DealTerms } from "@/lib/deals/terms";

/**
 * Books — invoicing, payment tracking, chasing (blueprint §4).
 * MVP: tracking + invoicing only, never holds funds (blueprint §8 —
 * money-transmitter risk). Payment rails: CardPointe gateway (cards + ACH).
 * Everything money-touching is gated (gateMoney cannot be disabled).
 *
 * A closed deal bills the brand twice: the creator's negotiated rate, and
 * Nspiire's deal fee on top (lib/deals/fee.ts). Two invoices, not one split
 * two ways — the fee is money owed to Nspiire, the rate is money owed to the
 * creator, and keeping them apart is what stops us sitting in the middle of
 * the creator's payment.
 */

export type InvoiceKind = "CREATOR_RATE" | "PLATFORM_FEE";

/** One invoice Books wants raised. Mirrors the Invoice model's columns. */
export interface DraftInvoice {
  kind: InvoiceKind;
  amountCents: number;
  currency: string;
  dueAt?: string;
  /** What the line says on the brand's invoice. */
  description: string;
}

export interface BooksInput {
  action: "create-invoice" | "chase-overdue" | "record-payment";
  deal: {
    id: string;
    brandName: string;
    /** Agreed terms. create-invoice bills from these and prices the fee off them. */
    terms?: DealTerms;
    /** Deals this brand has already taken to PAID — drives the repeat discount. */
    priorPaidDeals?: number;
  };
  invoice?: { amountCents: number; currency: string; dueAt?: string };
  paymentRef?: Record<string, unknown>; // CardPointe txn/ACH reference
}

export interface BooksOutput {
  action: BooksInput["action"];
  payload: Record<string, unknown>;
  /** create-invoice only: the rate invoice and the fee invoice, in that order. */
  invoices?: DraftInvoice[];
  /** create-invoice only: the fee arithmetic, to show a brand that asks. */
  fee?: FeeQuote;
}

/**
 * Build the two invoices a closed deal raises. Returns the fee invoice only
 * when there is a fee to charge — an unpriced or zero-value deal raises none.
 */
export function draftInvoices(
  terms: DealTerms,
  priorPaidDeals = 0,
  dueAt?: string,
): { invoices: DraftInvoice[]; fee: FeeQuote } {
  const fee = quoteDealFee({ terms, priorPaidDeals });
  const invoices: DraftInvoice[] = [];

  if (terms.amountCents != null && terms.amountCents > 0) {
    invoices.push({
      kind: "CREATOR_RATE",
      amountCents: terms.amountCents,
      currency: fee.currency,
      dueAt,
      description: terms.format
        ? `${terms.format} — agreed rate`
        : "Agreed rate",
    });
  }
  if (fee.feeCents != null && fee.feeCents > 0) {
    invoices.push({
      kind: "PLATFORM_FEE",
      amountCents: fee.feeCents,
      currency: fee.currency,
      dueAt,
      description: "Nspiire deal fee",
    });
  }

  return { invoices, fee };
}

export async function runBooks(
  input: BooksInput
): Promise<AgentResult<BooksOutput>> {
  // v0 is deterministic scaffolding; CardPointe integration lands here.
  // TODO(cardpointe): gateway auth, hosted payment link / ACH invoice,
  // webhook → record-payment → deal transition INVOICED → PAID.
  const output: BooksOutput = { action: input.action, payload: { ...input } };

  if (input.action === "create-invoice" && input.deal.terms) {
    const { invoices, fee } = draftInvoices(
      input.deal.terms,
      input.deal.priorPaidDeals ?? 0,
      input.invoice?.dueAt,
    );
    output.invoices = invoices;
    output.fee = fee;
  }

  return {
    agent: "books",
    output,
    needsApproval: {
      gate: "money",
      reason: "All money actions require human approval",
    },
  };
}
