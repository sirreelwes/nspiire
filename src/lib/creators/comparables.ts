import { z } from "zod";

/**
 * The creators a creator names as being like them — the Creator.comparables
 * Json column.
 *
 * This is the cheapest high-value question in onboarding. "Which brands sponsor
 * people like me" is a far better lead than niche and follower count alone: a
 * sponsorship a comparable creator has actually run is a checkable fact, at a
 * tier a brand has already shown it will pay for. Scout reads these.
 *
 * Two kinds, and the difference is the whole point
 * ------------------------------------------------
 * A creator asked "who is like you" answers two different questions at once:
 * who they sit alongside now, and who they want to be. Both are useful and they
 * are useful for opposite things.
 *
 *   peer          Comparable today. Real signal about tier. A brand that
 *                 sponsors them is a brand that pays for an audience this size,
 *                 which makes it a lead worth the creator's time.
 *   aspirational  Where they are heading. Signal about taste, direction and the
 *                 kind of work they want. NOT signal about tier.
 *
 * Collapsing the two would be actively harmful. A 40K creator who names a 5M
 * creator gets pitched to brands that only book 5M creators, every pitch is
 * ignored, and the shortlist looks busy while producing nothing. Scout is told
 * this explicitly, and the split exists in the data so it can be.
 *
 * Deliberately NOT used for pricing. The terms advisor prices from closed deals
 * and the creator's own rate card, never from a name typed into a form — see
 * the note at the top of lib/deals/advisor.ts. "Creators like me charge $8K" is
 * exactly the confident, unsourced figure that module exists to refuse.
 */

export const COMPARABLE_KINDS = ["peer", "aspirational"] as const;
export type ComparableKind = (typeof COMPARABLE_KINDS)[number];

export const COMPARABLE_KIND_LABELS: Record<ComparableKind, string> = {
  peer: "About where I am",
  aspirational: "Where I'm heading",
};

/**
 * One named creator.
 *
 * No platform field on purpose. Handles travel across platforms, most creators
 * name someone from their own, and a platform picker that defaults to Instagram
 * mostly collects wrong answers — a wrong field reads as fact downstream, a
 * missing one doesn't. Anything worth saying about where they post goes in the
 * note, in the creator's own words.
 */
export const ComparableSchema = z.object({
  /** Their handle or name, as the creator typed it. A leading @ is dropped. */
  handle: z
    .string()
    .trim()
    .min(1, "Add a handle or name")
    .max(120)
    .transform((h) => h.replace(/^@+/, "")),
  /**
   * `.catch("peer")` rather than a bare default: an unrecognised value should
   * land on the conservative side, not fail. Peer is conservative — it is the
   * list Scout sizes brands against, so a mis-typed row gets treated as "at
   * their level" rather than silently widening the search to a tier they are
   * not at.
   */
  kind: z.enum(COMPARABLE_KINDS).default("peer").catch("peer"),
  /** Why them — "same editing style", "posts the gear I post". */
  note: z.string().trim().max(500).default("").catch(""),
});
export type Comparable = z.output<typeof ComparableSchema>;

/** Onboarding asks for three. More is fine; the cap just stops abuse. */
export const COMPARABLES_ASKED_FOR = 3;

/** Hard ceiling. Not a product limit — a bound on what a form can post. */
export const COMPARABLES_MAX = 12;

/** Two rows naming the same person is a typo, not two data points. */
function dedupe(list: Comparable[]): Comparable[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const key = c.handle.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The WRITE path — a form or the API posting a list. Strict: a row with no
 * handle is a mistake the caller should hear about, not something to swallow.
 */
export const ComparablesSchema = z
  .array(ComparableSchema)
  .max(COMPARABLES_MAX)
  .default([])
  .transform(dedupe);

/**
 * The READ path — a Creator.comparables Json column.
 *
 * Parsed row by row on purpose. Running the array schema over a stored column
 * would mean one malformed row (an old shape, a hand-edited record) throwing
 * away every good row with it, and a creator would silently lose the list they
 * filled in. Salvage what parses, drop what doesn't, never throw.
 */
export function parseComparables(value: unknown): Comparable[] {
  if (!Array.isArray(value)) return [];
  const rows: Comparable[] = [];
  for (const row of value) {
    const parsed = ComparableSchema.safeParse(row);
    if (parsed.success) rows.push(parsed.data);
  }
  return dedupe(rows).slice(0, COMPARABLES_MAX);
}

export function peers(list: Comparable[]): Comparable[] {
  return list.filter((c) => c.kind === "peer");
}

export function aspirational(list: Comparable[]): Comparable[] {
  return list.filter((c) => c.kind === "aspirational");
}

/** "@handle — why they picked them", for display and for a prompt line. */
export function describeComparable(c: Comparable): string {
  return c.note ? `@${c.handle} — ${c.note}` : `@${c.handle}`;
}
