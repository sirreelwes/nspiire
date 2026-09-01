"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { InvalidTransitionError, transition } from "@/lib/deals/stateMachine";
import { isDealState } from "@/lib/deals/labels";
import { DealTermsSchema, formatMoney, parseTerms, toCents } from "@/lib/deals/terms";
import { checkDealGuardrails, parseGuardrails } from "@/lib/deals/guardrails";
import { checkDealPolicy } from "@/lib/deals/policy";
import { quoteDealFee } from "@/lib/deals/fee";
import { proposeTerms } from "@/lib/deals/advisor";
import { followerBand } from "@/lib/deals/stateMachine";
import { parseMetrics, formatCount, formatRate } from "@/lib/creators/metrics";
import { resolvePersona } from "@/lib/agents/persona";
import {
  talkToCreator,
  writeToBrand,
  type ThreadMessage,
} from "@/lib/agents/conversation";
import { defaultApprovalPolicy } from "@/lib/creators/onboarding";

/**
 * Deal pipeline mutations.
 *
 * There is no auth yet, so every human action is logged as `human:dashboard`.
 * When sign-in lands that string becomes `human:<userId>` and nothing else here
 * changes — the actor column already carries the distinction.
 */
const ACTOR = "human:dashboard";

/** Failures come back as ?error= on the submitting page, not a 500 screen. */
function withError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Optional whole number: blank stays blank rather than silently becoming 0. */
function optionalInt(form: FormData, key: string): number | null {
  const raw = text(form, key).replace(/[^0-9]/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function termsFromForm(form: FormData) {
  return DealTermsSchema.safeParse({
    format: text(form, "format"),
    amountCents: toCents(text(form, "amount")),
    currency: text(form, "currency").toUpperCase() || "USD",
    usageDays: optionalInt(form, "usageDays"),
    exclusivityDays: optionalInt(form, "exclusivityDays"),
    deliverables: text(form, "deliverables"),
    notes: text(form, "notes"),
  });
}

const NewDealSchema = z.object({
  creatorId: z.string().min(1, "Pick a creator"),
  brandName: z.string().trim().min(1, "Brand name is required"),
  brandCategory: z.string().trim().default(""),
  brandWebsite: z.string().trim().default(""),
});

/**
 * Create a deal at PITCHED.
 *
 * Creating a deal is not a state change, so it writes no DealTransition row —
 * Deal.createdAt already records the birth. The append-only log stays a log of
 * transitions only, which is what the terms advisor learns from.
 */
export async function createDeal(form: FormData) {
  const base = "/deals/new";

  const parsed = NewDealSchema.safeParse({
    creatorId: text(form, "creatorId"),
    brandName: text(form, "brandName"),
    brandCategory: text(form, "brandCategory"),
    brandWebsite: text(form, "brandWebsite"),
  });
  if (!parsed.success) {
    withError(base, parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const terms = termsFromForm(form);
  if (!terms.success) {
    withError(base, terms.error.issues[0]?.message ?? "Check the terms.");
  }

  const { creatorId, brandName, brandCategory, brandWebsite } = parsed.data;

  let dealId: string;
  try {
    const brand = await prisma.brand.upsert({
      where: { name: brandName },
      // Don't clobber what's already known about an existing brand; only fill
      // in fields the operator actually typed.
      update: {
        category: brandCategory || undefined,
        website: brandWebsite || undefined,
      },
      create: {
        name: brandName,
        category: brandCategory || null,
        website: brandWebsite || null,
      },
    });
    const deal = await prisma.deal.create({
      data: { creatorId, brandId: brand.id, terms: terms.data },
    });
    dealId = deal.id;
  } catch {
    withError(base, "Could not create the deal. Is that creator still there?");
  }

  revalidatePath("/deals");
  revalidatePath("/dashboard");
  redirect(`/deals/${dealId}`);
}

/**
 * Save edited terms. Not a state change, so not logged as one; the next
 * transition snapshots whatever the terms are at that moment.
 */
export async function updateDealTerms(form: FormData) {
  const dealId = text(form, "dealId");
  if (!dealId) withError("/deals", "Missing deal.");
  const base = `/deals/${dealId}`;

  const terms = termsFromForm(form);
  if (!terms.success) {
    withError(base, terms.error.issues[0]?.message ?? "Check the terms.");
  }

  try {
    await prisma.deal.update({
      where: { id: dealId },
      data: { terms: terms.data },
    });
  } catch {
    withError(base, "Could not save the terms.");
  }

  revalidatePath(base);
  revalidatePath("/deals");
  redirect(base);
}

/**
 * Move a deal to a new state. Always through `transition()` — the only writer
 * of Deal.state and the only thing that appends to DealTransition.
 */
export async function transitionDeal(form: FormData) {
  const dealId = text(form, "dealId");
  if (!dealId) withError("/deals", "Missing deal.");
  const base = `/deals/${dealId}`;

  const to = text(form, "to");
  if (!isDealState(to)) withError(base, "Unknown deal state.");


  const note = text(form, "note");

  try {
    await transition(prisma, {
      dealId,
      to,
      actor: ACTOR,
      note: note || undefined,
    });
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      // Usually a stale tab: the deal moved on since this page was rendered.
      withError(base, `${err.message}. Reload and try again.`);
    }
    withError(base, "Could not move the deal.");
  }

  revalidatePath(base);
  revalidatePath("/deals");
  revalidatePath("/dashboard");
  redirect(base);
}

/**
 * Point one deal at a specific destination, or clear it back to the creator's
 * default. This is the "send this one to the studio" case.
 *
 * The destination is re-checked against THIS deal's creator before it is
 * stored. Deal.shipToId is a plain foreign key, so without that check a stray
 * id would happily attach one creator's home address to another creator's deal.
 */
export async function setDealShipTo(form: FormData) {
  const dealId = text(form, "dealId");
  if (!dealId) withError("/deals", "Missing deal.");
  const base = `/deals/${dealId}`;
  const shipToId = text(form, "shipToId");

  // Resolved inside the try, acted on outside it: withError() redirects, and
  // Next signals a redirect by throwing — a redirect thrown inside the try
  // would be caught by its own catch and turned into the wrong message.
  let ownedByThisCreator = true;
  try {
    const deal = await prisma.deal.findUniqueOrThrow({
      where: { id: dealId },
      select: { creatorId: true },
    });

    if (shipToId) {
      const owned = await prisma.shippingDestination.count({
        where: { id: shipToId, creatorId: deal.creatorId },
      });
      ownedByThisCreator = owned > 0;
    }

    if (ownedByThisCreator) {
      await prisma.deal.update({
        where: { id: dealId },
        // Empty means "follow the creator's default", which is a null column,
        // not a blank string — resolveDestination() reads null as "fall back".
        data: { shipToId: shipToId || null },
      });
    }
  } catch {
    withError(base, "Could not set where this ships.");
  }

  if (!ownedByThisCreator) {
    withError(base, "That destination doesn't belong to this creator.");
  }

  revalidatePath(base);
  redirect(base);
}

/* ---------------------------------------------------------------------------
 * The virtual agent on a deal.
 *
 * Two conversations, two audiences, and they must never mix: Interaction rows
 * carry an `audience` and every read here filters on it. What Iris said to the
 * brand is not shown to the creator's thread and — much more importantly — the
 * creator's thread is never replayed into a brand-facing call, because it is
 * full of floor rates and guardrail talk.
 * ------------------------------------------------------------------------- */

/** Everything a persona call needs, loaded once. */
async function loadDealForPersona(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      brand: { include: { contacts: { take: 1 } } },
      creator: { include: { socials: true, persona: true } },
      persona: true,
      opportunity: { select: { rationale: true, evidence: true } },
    },
  });
  if (!deal) return null;
  const roster = await prisma.persona.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const persona = resolvePersona(deal.persona, deal.creator.persona, roster);
  return { deal, persona };
}

/** Thread for one audience, oldest first — the order a conversation happened in. */
async function loadThread(
  dealId: string,
  audience: "creator" | "brand",
): Promise<ThreadMessage[]> {
  const rows = await prisma.interaction.findMany({
    where: { dealId, audience },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  return rows.map((r) => ({
    from: r.direction === "outbound" ? ("persona" as const) : ("them" as const),
    body: r.body ?? "",
  }));
}

/**
 * Ask the deal's virtual agent something, or — with no question — have her
 * bring the deal to the creator for the first time.
 *
 * She answers; she never acts. Anything that would move the deal still goes
 * through `transition()` and the approval gates, so her `nextStep` is a
 * suggestion for a human to click, not a thing she has already done.
 */
export async function askIris(form: FormData) {
  const dealId = text(form, "dealId");
  if (!dealId) withError("/deals", "Missing deal.");
  const base = `/deals/${dealId}`;
  const question = text(form, "question");

  const loaded = await loadDealForPersona(dealId);
  if (!loaded) withError(base, "No such deal.");
  const { deal, persona } = loaded;
  if (!persona) {
    withError(base, "No virtual agent is available. Add one before asking.");
  }

  const terms = parseTerms(deal.terms);
  const guardrails = parseGuardrails(deal.creator.guardrails);
  const primary = deal.creator.socials[0];
  const metrics = parseMetrics(primary?.metrics);

  const violations = checkDealGuardrails({
    terms,
    guardrails: deal.creator.guardrails,
    brandName: deal.brand.name,
    brandCategory: deal.brand.category,
  }).map((v) => v.message);

  const priorPaidDeals = await prisma.deal.count({
    where: { brandId: deal.brandId, state: "PAID", id: { not: deal.id } },
  });
  const fee = quoteDealFee({ terms, priorPaidDeals });

  // The advisor's view, so she has a defensible opinion on the number rather
  // than a feeling about it. Same inputs the deal page uses.
  const benchmarks = primary
    ? await prisma.termsBenchmark.findMany({
        where: {
          niche: deal.creator.niche ?? "unknown",
          platform: primary.platform,
          followerBand: followerBand(primary.followerCount ?? 0),
        },
        select: { amountCents: true, format: true },
      })
    : [];
  const advice = terms.format
    ? proposeTerms({
        format: terms.format,
        rateCard: (deal.creator.rateCard ?? {}) as Record<string, number>,
        floorRates: guardrails.floorRatesCents,
        metrics,
        benchmarks,
      })
    : null;

  const thread = await loadThread(dealId, "creator");

  // Persist their question BEFORE the call. If the model errors, the thing they
  // typed is still on the record rather than lost with the request.
  if (question) {
    await prisma.interaction.create({
      data: {
        dealId,
        channel: "dashboard",
        direction: "inbound",
        actor: ACTOR,
        audience: "creator",
        body: question,
        personaId: persona.id,
      },
    });
    thread.push({ from: "them", body: question });
  }

  const result = await talkToCreator({
    persona,
    brief: {
      creatorName: deal.creator.name,
      brandName: deal.brand.name,
      brandCategory: deal.brand.category,
      dealState: deal.state,
      format: terms.format,
      amountCents: terms.amountCents,
      currency: terms.currency,
      usageDays: terms.usageDays,
      exclusivityDays: terms.exclusivityDays,
      deliverables: terms.deliverables,
      notes: terms.notes,
      floorCents:
        advice?.floorCents ??
        (terms.format ? (guardrails.floorRatesCents[terms.format] ?? null) : null),
      violations,
      policyNotes: checkDealPolicy(terms).map((n) => n.message),
      advice: advice
        ? {
            basis: advice.basis,
            amountCents: advice.amountCents,
            reasoning: advice.reasoning,
          }
        : undefined,
      feeLine:
        fee.feeCents == null
          ? undefined
          : `the brand pays ${formatMoney(fee.feeCents, fee.currency)} to Nspiire on top of the rate; ${deal.creator.name} still receives ${formatMoney(terms.amountCents, terms.currency)} in full`,
    },
    thread,
  });

  if (result.escalation) withError(base, result.escalation.reason);

  await prisma.interaction.create({
    data: {
      dealId,
      channel: "dashboard",
      direction: "outbound",
      actor: persona.name.toLowerCase(),
      audience: "creator",
      body: result.output.message,
      personaId: persona.id,
      approval: {
        recommendation: result.output.recommendation,
        watchOuts: result.output.watchOuts,
        nextStep: result.output.nextStep,
      },
    },
  });

  revalidatePath(base);
  redirect(base);
}

/**
 * Have her draft the next email to the brand.
 *
 * The brief built here is deliberately narrow — see BrandBrief in
 * lib/agents/conversation.ts. The floor rate, the guardrails and the shipping
 * address are not omitted by instruction, they are absent from the object.
 *
 * The result is always a draft. Nothing sends.
 */
export async function draftBrandOutreach(form: FormData) {
  const dealId = text(form, "dealId");
  if (!dealId) withError("/deals", "Missing deal.");
  const base = `/deals/${dealId}`;

  const loaded = await loadDealForPersona(dealId);
  if (!loaded) withError(base, "No such deal.");
  const { deal, persona } = loaded;
  if (!persona) {
    withError(base, "No virtual agent is available. Assign one first.");
  }

  const terms = parseTerms(deal.terms);
  const primary = deal.creator.socials[0];
  const metrics = parseMetrics(primary?.metrics);
  const followers = metrics.followerCount ?? primary?.followerCount ?? null;

  const thread = await loadThread(dealId, "brand");

  const result = await writeToBrand({
    persona,
    approvalPolicy: defaultApprovalPolicy(),
    brief: {
      brandName: deal.brand.name,
      brandCategory: deal.brand.category,
      contactName: deal.brand.contacts[0]?.name ?? null,
      creatorName: deal.creator.name,
      creatorNiche: deal.creator.niche ?? "unspecified",
      audienceLine: primary
        ? `${formatCount(followers)} followers on ${primary.platform.toLowerCase()}, ${formatRate(metrics.engagementRateByFollowers)} engagement by followers${
            metrics.avgViews ? `, ${formatCount(metrics.avgViews)} average views` : ""
          }${metrics.source === "manual" ? " (self-reported, not yet synced)" : ""}`
        : "no audience figures on file yet",
      whyThisBrand: deal.opportunity?.rationale ?? undefined,
      format: terms.format,
      askCents: terms.amountCents,
      currency: terms.currency,
      usageDays: terms.usageDays,
      exclusivityDays: terms.exclusivityDays,
      deliverables: terms.deliverables,
      isFirstTouch: thread.length === 0,
    },
    thread,
  });

  if (result.escalation) withError(base, result.escalation.reason);

  await prisma.interaction.create({
    data: {
      dealId,
      channel: "email",
      direction: "outbound",
      actor: persona.name.toLowerCase(),
      audience: "brand",
      subject: result.output.subject,
      body: result.output.body,
      personaId: persona.id,
      approval: {
        status: "pending",
        gate: result.needsApproval?.gate ?? "outbound-message",
        reason: result.needsApproval?.reason ?? "",
        withheld: result.output.withheld,
      },
    },
  });

  revalidatePath(base);
  redirect(base);
}

/** Record what a brand wrote back, so her next draft is a reply and not a repeat. */
export async function logBrandReply(form: FormData) {
  const dealId = text(form, "dealId");
  if (!dealId) withError("/deals", "Missing deal.");
  const base = `/deals/${dealId}`;
  const body = text(form, "body");
  if (!body) withError(base, "Nothing to log.");

  try {
    await prisma.interaction.create({
      data: {
        dealId,
        channel: "email",
        direction: "inbound",
        actor: "brand",
        audience: "brand",
        subject: text(form, "subject") || null,
        body,
      },
    });
  } catch {
    withError(base, "Could not log that reply.");
  }

  revalidatePath(base);
  redirect(base);
}

/** Assign a virtual agent to this deal, or clear it back to the account default. */
export async function setDealPersona(form: FormData) {
  const dealId = text(form, "dealId");
  if (!dealId) withError("/deals", "Missing deal.");
  const base = `/deals/${dealId}`;
  const personaId = text(form, "personaId");

  try {
    await prisma.deal.update({
      where: { id: dealId },
      data: { personaId: personaId || null },
    });
  } catch {
    withError(base, "Could not assign that agent.");
  }

  revalidatePath(base);
  redirect(base);
}
