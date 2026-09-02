"use server";

import { requireOperator } from "@/lib/auth/operator";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runScout } from "@/lib/agents/scout";
import { parseGuardrails } from "@/lib/deals/guardrails";
import { parseMetrics, AudienceMetricsSchema } from "@/lib/creators/metrics";
import { adviseForOpportunity } from "@/lib/deals/opportunityTerms";
import { DealTermsSchema } from "@/lib/deals/terms";
import { newInviteToken } from "@/lib/auth/creator";

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
  // Server actions are POST endpoints in their own right: requireOperator() on
  // the PAGE does not protect them, and the proxy is an optimistic check by
  // Next's own account. This is the boundary for writes.
  await requireOperator();
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
  await requireOperator();
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
      // Fill in a summary for brands Scout met before it produced them,
      // without overwriting one that is already there.
      update: { summary: o.summary || undefined },
      create: {
        name: o.brandName,
        category: o.category || null,
        summary: o.summary || null,
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
  await requireOperator();
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
  await requireOperator();
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

  // The creator's outreach gate, enforced rather than assumed. QUALIFIED means
  // they have seen this brand and said yes; SOURCED means they have not looked
  // yet. Converting a SOURCED opportunity would create a deal for a brand the
  // creator has never been shown, which is exactly what this is here to stop.
  if (opp.status !== "QUALIFIED") {
    withError(
      base,
      opp.status === "REJECTED"
        ? `${opp.creator.name} declined ${opp.brand.name}.`
        : `${opp.creator.name} hasn't approved outreach to ${opp.brand.name} yet.`,
    );
  }

  const primary = opp.creator.socials[0];
  const format = opp.suggestedFormat ?? "";
  const guardrails = parseGuardrails(opp.creator.guardrails);

  // The SAME function the creator's page used to show them a number before
  // they approved outreach. Two independent price calculations is how someone
  // approves one figure and finds another on the deal.
  const advice = await adviseForOpportunity(prisma, {
    creator: opp.creator,
    social: primary,
    format,
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

/**
 * Issue a creator an invite to set their own password.
 *
 * Deliberately does NOT email anything — there is no mail provider wired up,
 * and pretending to send one would be worse than handing back a link. The
 * operator copies the link and sends it however they already talk to the
 * creator.
 *
 * Re-inviting replaces any outstanding token, so the previous link dies. That
 * is the revoke button: invite again and the old one stops working.
 */
export async function inviteCreator(form: FormData) {
  await requireOperator();
  const creatorId = text(form, "creatorId");
  const base = `/creators/${creatorId}`;
  if (!creatorId) withError("/creators", "Missing creator.");

  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: { id: true, email: true },
  });
  if (!creator) withError("/creators", "No such creator.");
  if (!creator.email) {
    withError(base, "This creator has no email address to sign in with.");
  }

  const { token, expiresAt } = newInviteToken();
  await prisma.creator.update({
    where: { id: creator.id },
    data: { inviteToken: token, inviteTokenExpiresAt: expiresAt },
  });

  revalidatePath(base);
  // The token rides back in the URL so the page can render a copyable link.
  // It is single-use and expires in 7 days.
  redirect(`${base}?invite=${encodeURIComponent(token)}`);
}

/**
 * Invite a creator by email — no profile required.
 *
 * The full onboarding form asks the operator for the creator's niche, socials,
 * rate card and guardrails, which is the operator filling in someone else's
 * details from memory. This creates the account with just a name and an email
 * and lets the creator fill in their own, which is both less work and better
 * data. They complete it on first sign-in.
 */
export async function inviteNewCreator(form: FormData) {
  await requireOperator();
  const name = text(form, "name");
  const email = text(form, "email").toLowerCase();
  const base = "/creators/invite";

  if (!name) withError(base, "Name is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    withError(base, "Enter a valid email address.");
  }

  const existing = await prisma.creator.findUnique({ where: { email } });
  if (existing) {
    withError(base, `${email} is already on the roster as ${existing.name}.`);
  }

  const { token, expiresAt } = newInviteToken();
  const creator = await prisma.creator.create({
    data: {
      name,
      email,
      inviteToken: token,
      inviteTokenExpiresAt: expiresAt,
      // Left empty on purpose — the creator fills these in themselves.
      guardrails: {},
      rateCard: {},
    },
  });

  revalidatePath("/creators");
  revalidatePath("/dashboard");
  redirect(`/creators/${creator.id}?invite=${encodeURIComponent(token)}`);
}
