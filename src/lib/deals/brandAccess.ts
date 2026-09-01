import { randomBytes } from "node:crypto";
import { formatDays, formatMoney, type DealTerms } from "@/lib/deals/terms";

/**
 * The brand's way in — a capability URL, and the single definition of what it
 * grants.
 *
 * A brand cannot have an Nspiire login. Asking a marketing manager to create an
 * account before they will answer a cold pitch loses the deal, and the operator
 * password (lib/auth/operator.ts) is the whole agency console — it must never
 * go near a brand. So each deal mints an unguessable token and the brand gets
 * `/b/<token>`: no sign-in, no account, one deal.
 *
 * That means the token IS the authorisation, and the usual consequences apply.
 * It can be forwarded, it sits in a URL, and anyone holding it is treated as
 * the brand. Three things follow, and all three are implemented rather than
 * hoped for:
 *
 *   1. It is 32 bytes of CSPRNG, not a cuid. Deal ids are sequential-ish and
 *      guessable; this is not.
 *   2. It scopes to ONE deal. There is no listing, no other creator, no other
 *      brand reachable from it.
 *   3. `brandView()` below builds exactly what a holder may see. Same rule as
 *      the BrandBrief in lib/agents/conversation.ts: the floor rate, the
 *      guardrails, the fee arithmetic and the shipping address are not
 *      redacted from the page, they are never assembled into it.
 *
 * The page must also be excluded from the proxy's operator gate — see
 * src/proxy.ts — or a brand gets a login screen instead of their deal.
 */

/** 43 url-safe characters from 32 random bytes. */
export function mintBrandToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Tokens come out of a URL, so they are attacker-controlled input. Check the
 * shape before it reaches a database query rather than after.
 */
export function isBrandToken(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(value);
}

/** One line of terms, as the brand sees it. */
export interface BrandTermLine {
  label: string;
  value: string;
}

/**
 * Exactly what a token holder may see about a deal.
 *
 * Built field by field on purpose. A `Deal` row passed to a template would ship
 * whatever gets added to the model next; this ships what someone decided to
 * show. If a brand should learn something new, it is added here deliberately.
 */
export function brandView(input: {
  brandName: string;
  creatorName: string;
  creatorNiche: string | null;
  personaName: string;
  audienceLine: string;
  terms: DealTerms;
}): {
  headline: string;
  audienceLine: string;
  terms: BrandTermLine[];
} {
  const { terms } = input;
  return {
    headline: `${input.creatorName} × ${input.brandName}`,
    audienceLine: input.audienceLine,
    terms: [
      { label: "Creator", value: input.creatorName },
      ...(input.creatorNiche
        ? [{ label: "Niche", value: input.creatorNiche }]
        : []),
      { label: "Format", value: terms.format || "To be agreed" },
      {
        label: "Rate",
        value:
          terms.amountCents == null
            ? "To be agreed"
            : formatMoney(terms.amountCents, terms.currency),
      },
      { label: "Usage rights", value: formatDays(terms.usageDays) },
      { label: "Exclusivity", value: formatDays(terms.exclusivityDays) },
      ...(terms.deliverables
        ? [{ label: "Deliverables", value: terms.deliverables }]
        : []),
    ],
  };
  // Deliberately absent, and each for its own reason:
  //   floor rate        saying it ends the negotiation
  //   guardrails        the creator's private limits
  //   Nspiire's fee     a line on their invoice, not a negotiating position
  //   shipping address  released by deal state, in lib/creators/shipping.ts
  //   terms.notes       internal — it carries the advisor's reasoning
  //   the creator's email, other deals, other brands, benchmarks
}

/**
 * Where this deployment lives. Needed absolute: a link-unfurler and a brand's
 * mail client both fetch from a cold start with no notion of our origin.
 */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://nspiire.vercel.app";
}

/** Absolute URL to a deal's brand portal. */
export function brandPortalUrl(token: string, base = siteUrl()): string {
  return `${base.replace(/\/+$/, "")}/b/${token}`;
}

/**
 * Where the opt-out link points. The portal, anchored at its stop control —
 * one click to a page with a button that works. CAN-SPAM wants a mechanism a
 * recipient can actually operate, and a bare mailto to the thread they are
 * trying to leave is not one.
 */
export function optOutUrl(token: string, base = siteUrl()): string {
  return `${brandPortalUrl(token, base)}#stop`;
}
