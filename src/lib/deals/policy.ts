import { formatMoney, type DealTerms } from "@/lib/deals/terms";

/**
 * House deal policy — the rules that are Nspiire's, not the creator's.
 *
 * Creator guardrails (lib/deals/guardrails.ts) are per-creator: set at
 * onboarding, moved by the creator, and enforced on their behalf. These are
 * the house's. They apply to everyone on the platform, they are what Scout
 * hunts to, and they are where a new deal's terms start from.
 *
 * Both numbers are load-bearing elsewhere, so they live in one place:
 * lib/deals/fee.ts prices its surcharges off the standard usage window, and
 * Scout refuses to source formats priced under the minimum.
 */

/**
 * The smallest deal Nspiire goes looking for.
 *
 * Below this the economics stop working on both sides. Papering, chasing and
 * tracking a deal costs the same at $80 as at $8,000, and against the $25
 * minimum fee a $250 deal is already a 10% take — the highest rate the
 * schedule ever charges. Going lower would mean charging a brand more, for a
 * deal worth less, on a creator's time that would be better spent elsewhere.
 *
 * This is a *sourcing* floor, not a ban: Scout won't hunt under it, and the
 * deal page says so, but an operator can still record a smaller deal a creator
 * brought in themselves. The human is always allowed to overrule the house.
 */
export const MIN_DEAL_CENTS = 25_000;

/**
 * Where a usage window opens unless someone changes it.
 *
 * 30 days is the standard start on a new deal, and it is deliberately the same
 * number as `GuardrailsSchema.maxUsageDays`'s default — the opening ask sits
 * exactly at the ceiling a creator is assumed to accept without being asked.
 * Anything longer is the brand buying more, which is why the fee schedule
 * prices its usage surcharge off this number.
 */
export const DEFAULT_USAGE_DAYS = 30;

export interface PolicyNote {
  field: "amountCents" | "usageDays";
  message: string;
}

/**
 * House-policy notes on a set of terms. Advisory, never blocking: unlike
 * `checkDealGuardrails()`, nothing here stops an agent, because these are our
 * preferences about which deals are worth doing rather than promises made to
 * a creator.
 */
export function checkDealPolicy(terms: DealTerms): PolicyNote[] {
  const out: PolicyNote[] = [];

  if (
    terms.amountCents != null &&
    terms.amountCents > 0 &&
    terms.amountCents < MIN_DEAL_CENTS
  ) {
    out.push({
      field: "amountCents",
      message: `${formatMoney(terms.amountCents, terms.currency)} is under the ${formatMoney(MIN_DEAL_CENTS)} minimum Nspiire sources at. Fine to run one a creator brought in — Scout just won't go looking for them.`,
    });
  }

  if (terms.usageDays == null) {
    out.push({
      field: "usageDays",
      message: `No usage window agreed yet. Deals open at ${DEFAULT_USAGE_DAYS} days as standard — leaving it unstated is how a brand ends up assuming perpetual.`,
    });
  }

  return out;
}
