"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runScout } from "@/lib/agents/scout";
import { parseGuardrails } from "@/lib/deals/guardrails";
import { parseMetrics, AudienceMetricsSchema } from "@/lib/creators/metrics";
import { proposeTerms } from "@/lib/deals/advisor";
import { followerBand } from "@/lib/deals/stateMachine";
import { DealTermsSchema } from "@/lib/deals/terms";
import { z } from "zod";
import {
  ADDRESS_RELEASE_STATES,
  GiftingPolicySchema,
} from "@/lib/creators/shipping";

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function optionalNumber(form: FormData, key: string): number | null {
  const raw = text(form, key).replace(/[^0-9.]/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function withError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/**
 * Hand-entered metrics, for before the TikTok app is approved. Stored with
 * source "manual" so everything downstream — Scout's prompt, the advisor's
 * confidence, the UI — can tell it apart from a synced figure.
 */
export async function saveManualMetrics(form: FormData) {
  const accountId = text(form, "accountId");
  const creatorId = text(form, "creatorId");
  const base = `/creators/${creatorId}`;
  if (!accountId) withError(base, "Missing account.");

  const followerCount = optionalNumber(form, "followerCount");
  const avgViews = optionalNumber(form, "avgViews");
  const avgLikes = optionalNumber(form, "avgLikes");
  const avgComments = optionalNumber(form, "avgComments");
  const avgShares = optionalNumber(form, "avgShares");
  const sampleSize = optionalNumber(form, "sampleSize") ?? 0;

  const interactions =
    avgLikes == null && avgComments == null && avgShares == null
      ? null
      : (avgLikes ?? 0) + (avgComments ?? 0) + (avgShares ?? 0);

  const metrics = AudienceMetricsSchema.parse({
    followerCount,
    avgViews,
    avgLikes,
    avgComments,
    avgShares,
    engagementRateByViews:
      interactions != null && avgViews ? interactions / avgViews : null,
    engagementRateByFollowers:
      interactions != null && followerCount ? interactions / followerCount : null,
    sampleSize: Math.round(sampleSize),
    source: "manual",
    fetchedAt: new Date().toISOString(),
  });

  await prisma.socialAccount.update({
    where: { id: accountId },
    data: { followerCount, metrics, lastSyncedAt: new Date() },
  });

  revalidatePath(base);
  redirect(base);
}

/** Run Scout and store the shortlist as SOURCED opportunities for review. */
export async function findBrandPartners(form: FormData) {
  const creatorId = text(form, "creatorId");
  const base = `/creators/${creatorId}`;

  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    include: { socials: true, opportunities: { include: { brand: true } } },
  });
  if (!creator) withError("/creators", "No such creator.");

  const platforms = creator.socials.map((s) => ({
    platform: s.platform as string,
    handle: s.handle,
    followerCount: s.followerCount,
    metrics: parseMetrics(s.metrics),
  }));

  if (!platforms.some((p) => p.followerCount)) {
    withError(
      base,
      "Add follower numbers first — Scout prices fit on audience size, and won't guess it.",
    );
  }

  const result = await runScout({
    creator: {
      name: creator.name,
      niche: creator.niche ?? "unspecified",
      platforms,
      guardrails: parseGuardrails(creator.guardrails),
      // Scout needs the prices, not just the format names: it won't hunt for
      // formats under the house sourcing floor (lib/deals/policy.ts).
      rateCard: (creator.rateCard ?? {}) as Record<string, number>,
    },
    existingBrands: creator.opportunities.map((o) => o.brand.name),
  });

  if (result.escalation) withError(base, result.escalation.reason);
  if (result.output.length === 0) {
    withError(base, "Scout came back with nothing new. Try again or widen the niche.");
  }

  for (const o of result.output) {
    const brand = await prisma.brand.upsert({
      where: { name: o.brandName },
      update: {},
      create: {
        name: o.brandName,
        category: o.category || null,
        sponsorSignals: { evidence: o.evidence, sourcedBy: "scout" },
      },
    });
    await prisma.opportunity.upsert({
      where: { creatorId_brandId: { creatorId, brandId: brand.id } },
      update: {},
      create: {
        creatorId,
        brandId: brand.id,
        fitScore: o.fitScore,
        rationale: o.rationale,
        evidence: o.evidence,
        suggestedFormat: o.suggestedFormat,
      },
    });
  }

  revalidatePath(base);
  redirect(base);
}

export async function rejectOpportunity(form: FormData) {
  const id = text(form, "opportunityId");
  const creatorId = text(form, "creatorId");
  await prisma.opportunity.update({ where: { id }, data: { status: "REJECTED" } });
  revalidatePath(`/creators/${creatorId}`);
  redirect(`/creators/${creatorId}`);
}

/**
 * Approve an opportunity into a real deal at PITCHED, with a proposed rate
 * attached. The rate comes from the advisor — closed-deal benchmarks where they
 * exist, the creator's own rate card otherwise — never from a model.
 *
 * Creating the deal is not a state change, so it writes no DealTransition; the
 * deal is born at PITCHED and every move after that is logged.
 */
export async function approveOpportunity(form: FormData) {
  const id = text(form, "opportunityId");
  const creatorId = text(form, "creatorId");
  const base = `/creators/${creatorId}`;

  const opp = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      brand: true,
      deal: { select: { id: true } },
      creator: { include: { socials: true } },
    },
  });
  if (!opp) withError(base, "No such opportunity.");
  if (opp.deal) redirect(`/deals/${opp.deal.id}`);

  const primary = opp.creator.socials[0];
  const metrics = parseMetrics(primary?.metrics);
  const format = opp.suggestedFormat ?? "";

  const rateCard = (opp.creator.rateCard ?? {}) as Record<string, number>;
  const guardrails = parseGuardrails(opp.creator.guardrails);

  // Benchmarks are matched the same way writeBenchmark() records them.
  const benchmarks = primary
    ? await prisma.termsBenchmark.findMany({
        where: {
          niche: opp.creator.niche ?? "unknown",
          platform: primary.platform,
          followerBand: followerBand(primary.followerCount ?? 0),
        },
        select: { amountCents: true, format: true },
      })
    : [];

  const advice = proposeTerms({
    format,
    rateCard,
    floorRates: guardrails.floorRatesCents,
    metrics,
    benchmarks,
  });

  const terms = DealTermsSchema.parse({
    format,
    amountCents: advice.amountCents,
    usageDays: guardrails.maxUsageDays,
    exclusivityDays: guardrails.maxExclusivityDays,
    notes: [`Proposed by the terms advisor (${advice.basis}).`, ...advice.reasoning].join(
      " ",
    ),
  });

  const deal = await prisma.deal.create({
    data: {
      creatorId,
      brandId: opp.brandId,
      opportunityId: opp.id,
      terms,
    },
  });
  await prisma.opportunity.update({
    where: { id },
    data: { status: "CONVERTED" },
  });

  revalidatePath(base);
  revalidatePath("/deals");
  revalidatePath("/dashboard");
  redirect(`/deals/${deal.id}`);
}

/* ---------------------------------------------------------------------------
 * Where product goes.
 *
 * A creator's address is the one thing here they can never take back once it is
 * out, so these actions are written like it: every write is scoped by creatorId
 * as well as row id, so a wrong or guessed destination id touches nothing, and
 * a destination is archived rather than deleted because a parcel already in
 * flight was addressed to it.
 * ------------------------------------------------------------------------- */

const DestinationSchema = z.object({
  label: z.string().trim().min(1, "Give it a name — 'Studio', 'PO box'."),
  recipient: z.string().trim().min(1, "Say who the parcel should be addressed to."),
  line1: z.string().trim().min(1, "Street address is required."),
  line2: z.string().trim().default(""),
  city: z.string().trim().min(1, "City is required."),
  region: z.string().trim().default(""),
  postalCode: z.string().trim().min(1, "Postal code is required."),
  country: z.string().trim().min(1).default("US"),
  instructions: z.string().trim().default(""),
});

/** Empty text inputs are "not given", not an empty string in the column. */
function orNull(value: string): string | null {
  return value.length > 0 ? value : null;
}

/**
 * Add or edit a destination.
 *
 * The first one a creator adds is their default whatever the checkbox says —
 * a lone destination that nothing falls back to would be a silent trap.
 */
export async function saveShippingDestination(form: FormData) {
  const creatorId = text(form, "creatorId");
  const base = `/creators/${creatorId}`;
  if (!creatorId) withError("/creators", "Missing creator.");

  const parsed = DestinationSchema.safeParse({
    label: text(form, "label"),
    recipient: text(form, "recipient"),
    line1: text(form, "line1"),
    line2: text(form, "line2"),
    city: text(form, "city"),
    region: text(form, "region"),
    postalCode: text(form, "postalCode"),
    country: text(form, "country") || "US",
    instructions: text(form, "instructions"),
  });
  if (!parsed.success) {
    withError(base, parsed.error.issues[0]?.message ?? "Check the address.");
  }
  const d = parsed.data;
  const destinationId = text(form, "destinationId");
  const wantsDefault = form.get("isDefault") === "on";

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.shippingDestination.count({
        where: { creatorId, archivedAt: null },
      });
      const isDefault = wantsDefault || existing === 0;

      if (destinationId) {
        // Scoped by creatorId as well as id: updateMany takes a non-unique
        // filter, so a destination belonging to someone else matches nothing
        // rather than being updated.
        const { count } = await tx.shippingDestination.updateMany({
          where: { id: destinationId, creatorId },
          data: {
            label: d.label,
            recipient: d.recipient,
            line1: d.line1,
            line2: orNull(d.line2),
            city: d.city,
            region: orNull(d.region),
            postalCode: d.postalCode,
            country: d.country,
            instructions: orNull(d.instructions),
            isDefault,
          },
        });
        if (count === 0) throw new Error("not-found");
      } else {
        await tx.shippingDestination.create({
          data: {
            creatorId,
            label: d.label,
            recipient: d.recipient,
            line1: d.line1,
            line2: orNull(d.line2),
            city: d.city,
            region: orNull(d.region),
            postalCode: d.postalCode,
            country: d.country,
            instructions: orNull(d.instructions),
            isDefault,
          },
        });
      }

      // Exactly one default. Done inside the transaction so there is never a
      // moment with two, or with none.
      if (isDefault) {
        await tx.shippingDestination.updateMany({
          where: {
            creatorId,
            isDefault: true,
            ...(destinationId ? { id: { not: destinationId } } : {}),
          },
          data: { isDefault: false },
        });
        if (!destinationId) {
          const fresh = await tx.shippingDestination.findFirst({
            where: { creatorId, archivedAt: null },
            orderBy: { createdAt: "desc" },
          });
          if (fresh) {
            await tx.shippingDestination.update({
              where: { id: fresh.id },
              data: { isDefault: true },
            });
          }
        }
      }
    });
  } catch {
    withError(base, "Could not save that address.");
  }

  revalidatePath(base);
  redirect(base);
}

/**
 * Retire a destination. Archived, never deleted: a deal that already shipped
 * there still points at it, and "where did that box go" must stay answerable.
 */
export async function archiveShippingDestination(form: FormData) {
  const creatorId = text(form, "creatorId");
  const destinationId = text(form, "destinationId");
  const base = `/creators/${creatorId}`;
  if (!creatorId || !destinationId) withError(base, "Missing address.");

  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.shippingDestination.updateMany({
        where: { id: destinationId, creatorId, archivedAt: null },
        data: { archivedAt: new Date(), isDefault: false },
      });
      if (count === 0) throw new Error("not-found");
      // Never leave a creator with addresses but no default — the next deal
      // would resolve to nothing and look like they take no product.
      const remaining = await tx.shippingDestination.findMany({
        where: { creatorId, archivedAt: null },
        orderBy: { createdAt: "asc" },
      });
      if (remaining.length > 0 && !remaining.some((r) => r.isDefault)) {
        await tx.shippingDestination.update({
          where: { id: remaining[0].id },
          data: { isDefault: true },
        });
      }
    });
  } catch {
    withError(base, "Could not archive that address.");
  }

  revalidatePath(base);
  redirect(base);
}

/** Make one destination the default. */
export async function setDefaultDestination(form: FormData) {
  const creatorId = text(form, "creatorId");
  const destinationId = text(form, "destinationId");
  const base = `/creators/${creatorId}`;
  if (!creatorId || !destinationId) withError(base, "Missing address.");

  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.shippingDestination.updateMany({
        where: { id: destinationId, creatorId, archivedAt: null },
        data: { isDefault: true },
      });
      if (count === 0) throw new Error("not-found");
      await tx.shippingDestination.updateMany({
        where: { creatorId, isDefault: true, id: { not: destinationId } },
        data: { isDefault: false },
      });
    });
  } catch {
    withError(base, "Could not set that as the default.");
  }

  revalidatePath(base);
  redirect(base);
}

/** Whether they take product, whether a brand must ask, and when the address goes out. */
export async function saveGiftingPolicy(form: FormData) {
  const creatorId = text(form, "creatorId");
  const base = `/creators/${creatorId}`;
  if (!creatorId) withError("/creators", "Missing creator.");

  const releaseAt = text(form, "releaseAddressAt");
  const parsed = GiftingPolicySchema.safeParse({
    acceptsProduct: form.get("acceptsProduct") === "on",
    requiresApprovalBeforeSending:
      form.get("requiresApprovalBeforeSending") === "on",
    // An unrecognised value falls back to the schema default (SIGNED), which is
    // the strictest option — a bad form post must not loosen this.
    releaseAddressAt: (ADDRESS_RELEASE_STATES as readonly string[]).includes(
      releaseAt,
    )
      ? releaseAt
      : undefined,
    notes: text(form, "giftingNotes"),
  });
  if (!parsed.success) {
    withError(base, "Could not save those gifting preferences.");
  }

  try {
    await prisma.creator.update({
      where: { id: creatorId },
      data: { giftingPolicy: parsed.data },
    });
  } catch {
    withError(base, "Could not save those gifting preferences.");
  }

  revalidatePath(base);
  redirect(base);
}
