import type { DealState } from "@/lib/deals/stateMachine";

/**
 * Presentation-only names for the deal states. Kept out of stateMachine.ts so
 * that file stays the rules and nothing else.
 */
export const STATE_LABELS: Record<DealState, string> = {
  PITCHED: "Pitched",
  NEGOTIATING: "Negotiating",
  TERMS_AGREED: "Terms agreed",
  CONTRACT_SENT: "Contract sent",
  SIGNED: "Signed",
  IN_PRODUCTION: "In production",
  DELIVERED: "Delivered",
  INVOICED: "Invoiced",
  PAID: "Paid",
  RENEWAL_WATCH: "Renewal watch",
  LOST: "Lost",
};

/** The happy path, in order. LOST and RENEWAL_WATCH hang off it. */
export const PIPELINE: DealState[] = [
  "PITCHED",
  "NEGOTIATING",
  "TERMS_AGREED",
  "CONTRACT_SENT",
  "SIGNED",
  "IN_PRODUCTION",
  "DELIVERED",
  "INVOICED",
  "PAID",
];

export const ASIDE: DealState[] = ["RENEWAL_WATCH", "LOST"];

export const ALL_STATES: DealState[] = [...PIPELINE, ...ASIDE];

export function isDealState(value: string | undefined): value is DealState {
  return !!value && (ALL_STATES as string[]).includes(value);
}

/** Human-readable actor. Transitions log "human:<id>" or a bare agent name. */
export function actorLabel(actor: string): string {
  if (actor.startsWith("human:")) {
    const who = actor.slice("human:".length);
    return who === "dashboard" ? "You (dashboard)" : `You (${who})`;
  }
  return actor.charAt(0).toUpperCase() + actor.slice(1);
}
