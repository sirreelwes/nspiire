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
