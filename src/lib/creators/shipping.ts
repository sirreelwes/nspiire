import { z } from "zod";
import { PIPELINE } from "@/lib/deals/labels";
import type { DealState } from "@/lib/deals/stateMachine";

/**
 * Where brand product and gifts go — and, just as much, when a brand is allowed
 * to know.
 *
 * A creator's shipping address is the most sensitive thing this product holds.
 * For most of them it is a home address, it is the one piece of data they can
 * never take back once it is out, and the request that leaks it is a completely
 * ordinary one: a brand asking where to send a box. So "control" here is three
 * separate powers, not one:
 *
 *   1. WHETHER — `acceptsProduct`. Plenty of creators want cash deals only, and
 *      the honest answer to "what's your address?" is that there isn't one.
 *   2. WHERE — several destinations, one default, and a per-deal override.
 *      Nobody has exactly one address: there's the PO box for strangers, the
 *      studio for bulky things, and home for almost nothing.
 *   3. WHEN — `releaseAddressAt`. A brand that hasn't signed anything has no
 *      business holding a home address, however friendly the thread is.
 *
 * The rule this module exists to make mechanical is (3). It is deliberately a
 * pure function of deal state and stated preference: no judgement, no model
 * call, nothing an agent can talk itself past.
 */

export const ADDRESS_RELEASE_STATES = [
  "TERMS_AGREED",
  "CONTRACT_SENT",
  "SIGNED",
] as const;
export type AddressReleaseState = (typeof ADDRESS_RELEASE_STATES)[number];

export const GiftingPolicySchema = z.object({
  /** Do they take physical product at all? False means there is no address. */
  acceptsProduct: z.boolean().default(true),
  /**
   * Must a brand ask before putting anything in the post? Defaults true: an
   * unsolicited parcel is a disclosure obligation and a tax event, not a treat.
   */
  requiresApprovalBeforeSending: z.boolean().default(true),
  /**
   * How far a deal must get before the address may be handed over. Defaults to
   * the strictest option — signed — because the safe default is the one a
   * creator would have picked if anyone had asked them.
   */
  releaseAddressAt: z.enum(ADDRESS_RELEASE_STATES).default("SIGNED"),
  /** Anything a brand or courier needs to know. Not the address itself. */
  notes: z.string().trim().default(""),
});
export type GiftingPolicy = z.output<typeof GiftingPolicySchema>;

/** Read a Creator.giftingPolicy Json column. Garbage falls back to defaults. */
export function parseGiftingPolicy(value: unknown): GiftingPolicy {
  const parsed = GiftingPolicySchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : GiftingPolicySchema.parse({});
}

/** The fields of a ShippingDestination row this module needs. */
export interface Destination {
  id: string;
  label: string;
  recipient: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
  instructions: string | null;
  isDefault: boolean;
  archivedAt: Date | null;
}

/**
 * Is the address releasable to the brand on a deal in this state?
 *
 * Ordered against PIPELINE — the happy path, in order — rather than a second
 * list kept in step by hand. A state off that path (LOST, RENEWAL_WATCH) is not
 * a deal anything ships on, so it releases nothing; failing closed on a state
 * this doesn't recognise is the only safe direction for a rule like this.
 */
export function addressReleased(
  state: DealState,
  policy: GiftingPolicy,
): boolean {
  if (!policy.acceptsProduct) return false;
  const reached = PIPELINE.indexOf(state);
  const gate = PIPELINE.indexOf(policy.releaseAddressAt);
  if (reached === -1 || gate === -1) return false;
  return reached >= gate;
}

/**
 * Which destination a deal ships to: the deal's explicit override, else the
 * creator's default, else nothing. Archived rows can still be a deal's
 * override — a parcel already went there — but are never picked as a fallback.
 */
export function resolveDestination(
  destinations: Destination[],
  shipToId: string | null,
): Destination | null {
  if (shipToId) {
    const chosen = destinations.find((d) => d.id === shipToId);
    if (chosen) return chosen;
  }
  const active = destinations.filter((d) => d.archivedAt == null);
  return active.find((d) => d.isDefault) ?? active[0] ?? null;
}

/** Postal-order lines, for display and for a courier label. */
export function formatDestination(d: Destination): string[] {
  const region = [d.city, d.region].filter(Boolean).join(", ");
  return [
    d.recipient,
    d.line1,
    d.line2 ?? "",
    [region, d.postalCode].filter(Boolean).join(" "),
    d.country,
  ].filter((line) => line.trim().length > 0);
}

/**
 * One line, safe to show before the address is released: enough for an operator
 * to know a destination exists and which one it is, with nothing in it a brand
 * could post a box to.
 */
export function describeDestination(d: Destination): string {
  const where = [d.city, d.country].filter(Boolean).join(", ");
  return where ? `${d.label} — ${where}` : d.label;
}
