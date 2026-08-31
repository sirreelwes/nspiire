/* eslint-disable @typescript-eslint/no-explicit-any --
 * The Prisma client and its transaction client are taken as `any` on purpose:
 * this module must typecheck before `prisma generate` has run (CI/sandbox),
 * so it never imports @prisma/client. Callers pass the real client.
 */

/**
 * Mirrors the DealState enum in prisma/schema.prisma. Kept local so the app
 * builds before `prisma generate` has run (CI/sandbox); if you change one,
 * change both.
 */
export type DealState =
  | "PITCHED"
  | "NEGOTIATING"
  | "TERMS_AGREED"
  | "CONTRACT_SENT"
  | "SIGNED"
  | "IN_PRODUCTION"
  | "DELIVERED"
  | "INVOICED"
  | "PAID"
  | "RENEWAL_WATCH"
  | "LOST";

/**
 * Deal state machine — blueprint §4.
 *
 * sourced → qualified happen on Opportunity (pre-deal). A Deal is born at
 * PITCHED. Every transition MUST go through `transition()` so it is logged
 * to DealTransition — that append-only log is the training data for the
 * deal-terms advisor (P4).
 */

export const DEAL_FLOW: Record<DealState, DealState[]> = {
  PITCHED: ["NEGOTIATING", "LOST"],
  NEGOTIATING: ["TERMS_AGREED", "LOST"],
  TERMS_AGREED: ["CONTRACT_SENT", "NEGOTIATING", "LOST"],
  CONTRACT_SENT: ["SIGNED", "NEGOTIATING", "LOST"],
  SIGNED: ["IN_PRODUCTION"],
  IN_PRODUCTION: ["DELIVERED"],
  DELIVERED: ["INVOICED"],
  INVOICED: ["PAID"],
  PAID: ["RENEWAL_WATCH"],
  RENEWAL_WATCH: ["PITCHED"], // repeat-deal automation re-enters the loop
  LOST: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: DealState, to: DealState) {
    super(`Invalid deal transition: ${from} → ${to}`);
  }
}

export function canTransition(from: DealState, to: DealState): boolean {
  return DEAL_FLOW[from]?.includes(to) ?? false;
}

export interface TransitionInput {
  dealId: string;
  to: DealState;
  actor: string; // "scout" | "pitch" | "negotiator" | "counsel" | "books" | `human:${id}`
  note?: string;
}

/**
 * Perform a validated, logged transition. Uses an interactive transaction so
 * state change + log row are atomic. On PAID, also writes a TermsBenchmark
 * row (anonymized) — the moat gets fed automatically.
 */
export async function transition(prisma: any, input: TransitionInput) {
  return prisma.$transaction(async (tx: any) => {
    const deal = await tx.deal.findUniqueOrThrow({
      where: { id: input.dealId },
      include: { creator: { include: { socials: true } } },
    });
    if (!canTransition(deal.state, input.to)) {
      throw new InvalidTransitionError(deal.state, input.to);
    }
    const updated = await tx.deal.update({
      where: { id: deal.id },
      data: { state: input.to },
    });
    await tx.dealTransition.create({
      data: {
        dealId: deal.id,
        fromState: deal.state,
        toState: input.to,
        actor: input.actor,
        termsSnapshot: deal.terms ?? {},
        note: input.note,
      },
    });
    if (input.to === "PAID") {
      await writeBenchmark(tx, deal);
    }
    return updated;
  });
}

async function writeBenchmark(tx: any, deal: any) {
  const terms = (deal.terms ?? {}) as Record<string, unknown>;
  const primary = deal.creator?.socials?.[0];
  if (!terms.amountCents || !primary) return; // don't write junk benchmarks
  await tx.termsBenchmark.create({
    data: {
      niche: deal.creator.niche ?? "unknown",
      platform: primary.platform,
      followerBand: followerBand(primary.followerCount ?? 0),
      format: String(terms.format || "unknown"),
      usageRights: benchmarkWindow(terms.usageDays, terms.usageRights),
      exclusivity: benchmarkWindow(terms.exclusivityDays, terms.exclusivity),
      amountCents: Number(terms.amountCents),
      currency: String(terms.currency ?? "USD"),
      closedAt: new Date(),
    },
  });
}

/**
 * TermsBenchmark stores these windows as text, but deal terms carry day counts
 * (see lib/deals/terms.ts) so guardrails can be checked mechanically. Render
 * the number; fall back to any free-text value on older rows.
 */
function benchmarkWindow(days: unknown, legacy: unknown): string | null {
  if (typeof days === "number" && Number.isFinite(days)) {
    return days === 0 ? "none" : `${days} days`;
  }
  return legacy ? String(legacy) : null;
}

export function followerBand(count: number): string {
  if (count < 10_000) return "0-10K";
  if (count < 50_000) return "10K-50K";
  if (count < 100_000) return "50K-100K";
  if (count < 250_000) return "100K-250K";
  if (count < 500_000) return "250K-500K";
  if (count < 1_000_000) return "500K-1M";
  if (count < 5_000_000) return "1M-5M";
  return "5M+";
}
