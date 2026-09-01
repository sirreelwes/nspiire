import { z } from "zod";
import { formatCount } from "@/lib/creators/metrics";

/**
 * The creators a creator names as being like them — the Creator.comparables
 * Json column.
 *
 * This is the cheapest high-value question in onboarding. "Which brands sponsor
 * people like me" is a far better lead than niche and follower count alone: a
 * sponsorship a comparable creator has actually run is a checkable fact, at a
 * tier a brand has already shown it will pay for. Scout reads these.
 *
 * Two kinds, and why the creator is asked rather than measured
 * ------------------------------------------------------------
 *   peer          At roughly this creator's size today. Real signal about tier:
 *                 a brand that sponsors them pays for an audience this big,
 *                 which makes it a lead worth the creator's time.
 *   aspirational  Bigger — where they are heading. Signal about taste and
 *                 direction. NOT signal about tier.
 *
 * Collapsing the two would be actively harmful. A 40K creator who names a 5M
 * creator gets pitched to brands that only book 5M creators, every pitch is
 * ignored, and the shortlist looks busy while producing nothing. Scout is told
 * this explicitly, and the split exists in the data so it can be.
 *
 * Stated now, measured when we can
 * --------------------------------
 * The split IS a size comparison, so it should be computed rather than asked
 * wherever a number is available. `effectiveKind()` does exactly that: a
 * measured `followerCount` decides the tier and the creator's answer is only
 * the fallback — the same precedence a synced metric has over a hand-entered
 * one (`AudienceMetrics.source` in metrics.ts).
 *
 * Nothing populates `followerCount` yet, and what it would take differs a lot
 * by platform. Roughly, and worth re-verifying before building any of it:
 *
 *   YouTube    Data API v3 channels.list(part=statistics) returns
 *              subscriberCount for any public channel. Free, API key, quota'd.
 *              The easy one.
 *   Instagram  Graph API business_discovery looks up another PROFESSIONAL
 *              account by username and returns followers_count plus recent
 *              media engagement. Needs our own linked professional account and
 *              app review; personal accounts are invisible to it. Meta's
 *              surface moves often — check it before trusting this paragraph.
 *   TikTok     No public lookup. /v2/user/info/ reads the token holder's own
 *              profile (see lib/tiktok/client.ts), the Research API is limited
 *              to approved researchers, and the Creator Marketplace API needs a
 *              partner agreement. A named TikTok handle stays unmeasurable
 *              until one of those is in place.
 *   Vendors    Modash, HypeAuditor, Upfluence and similar sell exactly this
 *              across all three, with an engagement figure attached. Money, a
 *              contract, and someone else's numbers to trust.
 *
 * What is NOT an option: asking a model how big someone is. That produces a
 * confident unsourced number, which is the thing lib/deals/advisor.ts exists to
 * refuse, and here it would silently decide who gets pitched to whom.
 *
 * Until a source is wired up the label is the creator's estimate, asked as the
 * question they can actually answer — "bigger than me, or about my size?" —
 * anchored on their own follower count, which we do have. Nobody knows a
 * rival's exact numbers; everybody knows who is bigger than them.
 *
 * Deliberately NOT used for pricing. The terms advisor prices from closed deals
 * and the creator's own rate card, never from a name typed into a form — see
 * the note at the top of lib/deals/advisor.ts. "Creators like me charge $8K" is
 * exactly the confident, unsourced figure that module exists to refuse.
 */

export const COMPARABLE_KINDS = ["peer", "aspirational"] as const;
export type ComparableKind = (typeof COMPARABLE_KINDS)[number];

/**
 * Phrased as the size comparison it is, not as a feeling about direction.
 * "Where I'm heading" invited a creator to file a same-size peer under
 * aspiration because they admire them — which is exactly the row Scout most
 * needs in the other list.
 */
export const COMPARABLE_KIND_LABELS: Record<ComparableKind, string> = {
  peer: "About my size",
  aspirational: "Bigger than me",
};

/**
 * The anchor shown beside the question. Their own follower count is the one
 * number in this comparison we actually know, so it does the work the missing
 * measurement would have done.
 */
export function sizeAnchor(followerCount: number | null): string {
  return followerCount
    ? `You're at ${formatCount(followerCount)} followers — bigger or about the same?`
    : "Add your follower count above and this question gets easier to answer.";
}

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
  /**
   * Their real follower count, once something has actually looked it up. Null
   * means nobody has — which is every row today. When it is set it OVERRIDES
   * `kind`; see effectiveKind().
   */
  followerCount: z.number().int().min(0).nullable().default(null).catch(null),
  /** ISO timestamp of that lookup, so a stale figure is visible as stale. */
  measuredAt: z.string().nullable().default(null).catch(null),
  /** Which source measured it — "youtube-api", "modash", … Null when stated. */
  measuredBy: z.string().trim().max(60).nullable().default(null).catch(null),
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

/**
 * How far above a creator someone can be and still count as a peer.
 *
 * Brand budgets track audience size, so the question is really "would a brand
 * that books them also book me". Three times is generous enough to survive a
 * creator's rough guess and the fact that follower counts move, and tight
 * enough that a 40K creator naming a 5M one lands where it belongs. Smaller is
 * always a peer: someone below you is not an aspiration.
 */
export const PEER_MULTIPLE = 3;

/**
 * The tier actually used, measurement first.
 *
 * A looked-up follower count decides it. The creator's own answer is the
 * fallback for the rows — currently all of them — where nothing has measured
 * anything. Falls back rather than throwing when either number is missing.
 */
export function effectiveKind(
  c: Comparable,
  ownFollowerCount: number | null,
): ComparableKind {
  if (c.followerCount != null && ownFollowerCount) {
    return c.followerCount > ownFollowerCount * PEER_MULTIPLE
      ? "aspirational"
      : "peer";
  }
  return c.kind;
}

/** True when the row's tier came from a measurement rather than the creator. */
export function isMeasured(c: Comparable, ownFollowerCount: number | null): boolean {
  return c.followerCount != null && Boolean(ownFollowerCount);
}

export function peers(
  list: Comparable[],
  ownFollowerCount: number | null = null,
): Comparable[] {
  return list.filter((c) => effectiveKind(c, ownFollowerCount) === "peer");
}

export function aspirational(
  list: Comparable[],
  ownFollowerCount: number | null = null,
): Comparable[] {
  return list.filter((c) => effectiveKind(c, ownFollowerCount) === "aspirational");
}

/** "@handle — why they picked them", for display and for a prompt line. */
export function describeComparable(c: Comparable): string {
  return c.note ? `@${c.handle} — ${c.note}` : `@${c.handle}`;
}
