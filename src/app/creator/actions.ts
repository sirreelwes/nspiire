"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseTerms, termsFingerprint } from "@/lib/deals/terms";
import { requireCreator } from "@/lib/auth/creator";
import {
  CREATOR_COOKIE,
  hashPassword,
  issueCreatorSession,
  verifyPassword,
} from "@/lib/auth/creator";

/**
 * Creator sign-in, activation and sign-out.
 *
 * As with the operator login, there is no rate limiting: an in-memory counter
 * is per-instance on serverless and would be theatre. Unlike the operator
 * password, though, creators choose their own — so the minimum length below is
 * the only floor there is.
 */

const MIN_PASSWORD = 12;

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function setSession(creatorId: string) {
  const { value, maxAge } = issueCreatorSession(creatorId);
  (await cookies()).set(CREATOR_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function creatorSignIn(form: FormData): Promise<void> {
  const email = text(form, "email").toLowerCase();
  const password = form.get("password");

  const creator = email
    ? await prisma.creator.findUnique({ where: { email } })
    : null;

  // One message for "no such account", "not activated" and "wrong password".
  // Distinguishing them tells an attacker which emails are real.
  if (
    !creator ||
    typeof password !== "string" ||
    !verifyPassword(password, creator.passwordHash)
  ) {
    redirect("/creator/login?error=denied");
  }

  await prisma.creator.update({
    where: { id: creator.id },
    data: { lastLoginAt: new Date() },
  });
  await setSession(creator.id);
  redirect("/creator");
}

export async function setCreatorPassword(form: FormData): Promise<void> {
  const token = text(form, "token");
  const password = form.get("password");
  const confirm = form.get("confirm");
  const back = `/creator/set-password?token=${encodeURIComponent(token)}`;

  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    redirect(`${back}&error=short`);
  }
  if (password !== confirm) {
    redirect(`${back}&error=mismatch`);
  }

  const creator = token
    ? await prisma.creator.findUnique({ where: { inviteToken: token } })
    : null;
  if (
    !creator ||
    !creator.inviteTokenExpiresAt ||
    creator.inviteTokenExpiresAt.getTime() <= Date.now()
  ) {
    redirect(`${back}&error=invalid`);
  }

  // Single use: the token is cleared in the same write that sets the password,
  // so a forwarded link is inert the moment it has been used once.
  await prisma.creator.update({
    where: { id: creator.id },
    data: {
      passwordHash: hashPassword(password),
      inviteToken: null,
      inviteTokenExpiresAt: null,
      lastLoginAt: new Date(),
    },
  });

  await setSession(creator.id);
  redirect("/creator");
}

export async function creatorSignOut(): Promise<void> {
  (await cookies()).delete(CREATOR_COOKIE);
  redirect("/");
}

/* ------------------------------------------------- reviewing the shortlist */

/**
 * The creator's decision on a brand their agent found.
 *
 * This is the outreach gate made real. The schema always had QUALIFIED
 * ("human-approved for outreach") but nothing set it — the operator's approve
 * jumped SOURCED straight to CONVERTED and created a deal, so a brand could be
 * pitched without the creator having seen it. Now only the creator moves an
 * opportunity out of SOURCED, and approveOpportunity refuses anything that is
 * not QUALIFIED.
 *
 * Scoped with updateMany and creatorId from the SESSION, never from the form:
 * a mismatched id updates zero rows rather than someone else's shortlist.
 */
async function decide(form: FormData, status: "QUALIFIED" | "REJECTED") {
  const creator = await requireCreator();
  const opportunityId = text(form, "opportunityId");
  if (!opportunityId) redirect("/creator");

  await prisma.opportunity.updateMany({
    where: { id: opportunityId, creatorId: creator.id, status: "SOURCED" },
    data: { status },
  });

  revalidatePath("/creator");
  revalidatePath(`/creators/${creator.id}`);
  redirect("/creator");
}

/** "Yes, you can approach them." */
export async function creatorApproveOutreach(form: FormData): Promise<void> {
  await decide(form, "QUALIFIED");
}

/** "No, don't." */
export async function creatorDeclineOutreach(form: FormData): Promise<void> {
  await decide(form, "REJECTED");
}

/* ------------------------------------------------ approving the deal terms */

/**
 * The creator's decision on what a brand is actually paying them.
 *
 * Approval stores a fingerprint of the terms as approved, not a boolean. If the
 * money, format, usage window, exclusivity or deliverables change afterwards,
 * the fingerprint no longer matches and transition() refuses to send a
 * contract until the creator has looked again. An approval means "I agreed to
 * THESE terms", not "I trust this deal forever".
 */
export async function creatorApproveTerms(form: FormData): Promise<void> {
  const creator = await requireCreator();
  const dealId = text(form, "dealId");
  if (!dealId) redirect("/creator");

  // Scoped read: a deal id from the form is only ever looked up together with
  // the session's creator id, so another creator's deal simply is not found.
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, creatorId: creator.id },
    select: { id: true, terms: true },
  });
  if (!deal) redirect("/creator");

  await prisma.deal.update({
    where: { id: deal.id },
    data: {
      termsApprovedAt: new Date(),
      termsApprovedFingerprint: termsFingerprint(parseTerms(deal.terms)),
      creatorTermsNote: null,
    },
  });

  revalidatePath("/creator");
  revalidatePath(`/deals/${deal.id}`);
  redirect("/creator");
}

/** "Not at this price" — clears any approval and records why. */
export async function creatorRequestTermsChanges(form: FormData): Promise<void> {
  const creator = await requireCreator();
  const dealId = text(form, "dealId");
  const note = text(form, "note").slice(0, 1000);
  if (!dealId) redirect("/creator");

  const updated = await prisma.deal.updateMany({
    where: { id: dealId, creatorId: creator.id },
    data: {
      termsApprovedAt: null,
      termsApprovedFingerprint: null,
      creatorTermsNote: note || "Asked for changes.",
    },
  });
  if (updated.count === 0) redirect("/creator");

  revalidatePath("/creator");
  revalidatePath(`/deals/${dealId}`);
  redirect("/creator");
}

/* ------------------------------------------------- completing the profile */

/**
 * A creator fills in their own niche, numbers and rates.
 *
 * Invites carry only a name and an email, so this is what turns an empty
 * account into one Scout and the terms advisor can work with: Scout needs the
 * niche, the follower count and the offered formats; the advisor needs the rate
 * card and the floor.
 *
 * The creator entering these rather than the operator is the point — the
 * operator would be filling in someone else's business from memory.
 */
export async function completeCreatorProfile(form: FormData): Promise<void> {
  const creator = await requireCreator();

  const niche = text(form, "niche");
  const handle = text(form, "handle").replace(/^@/, "");
  const followers = Number(text(form, "followerCount").replace(/[^0-9]/g, ""));
  const format = text(form, "format");
  const rate = Number(text(form, "rate").replace(/[^0-9.]/g, ""));
  const floor = Number(text(form, "floor").replace(/[^0-9.]/g, ""));
  const maxUsageDays = Number(text(form, "maxUsageDays").replace(/[^0-9]/g, ""));
  const maxExclusivityDays = Number(
    text(form, "maxExclusivityDays").replace(/[^0-9]/g, ""),
  );
  const doNotWorkWith = text(form, "doNotWorkWith")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!niche || !handle || !Number.isFinite(followers) || followers <= 0) {
    redirect("/creator?error=missing");
  }
  if (!format || !Number.isFinite(rate) || rate <= 0) {
    redirect("/creator?error=rate");
  }

  const rateCents = Math.round(rate * 100);
  // A floor above the asking rate would make every deal fail its own
  // guardrail, so an unset or nonsensical floor becomes half the rate.
  const floorCents =
    Number.isFinite(floor) && floor > 0 && floor * 100 <= rateCents
      ? Math.round(floor * 100)
      : Math.round(rateCents / 2);

  await prisma.creator.update({
    where: { id: creator.id },
    data: {
      niche,
      rateCard: { [format]: rateCents },
      guardrails: {
        offeredFormats: [format],
        floorRatesCents: { [format]: floorCents },
        maxUsageDays: Number.isFinite(maxUsageDays) ? maxUsageDays : 30,
        maxExclusivityDays: Number.isFinite(maxExclusivityDays)
          ? maxExclusivityDays
          : 0,
        doNotWorkWith,
      },
    },
  });

  // One TikTok account. Connecting TikTok later replaces the follower count
  // with synced numbers; this is the hand-entered starting point.
  const existing = await prisma.socialAccount.findFirst({
    where: { creatorId: creator.id, platform: "TIKTOK" },
  });
  if (existing) {
    await prisma.socialAccount.update({
      where: { id: existing.id },
      data: { handle, followerCount: followers },
    });
  } else {
    await prisma.socialAccount.create({
      data: { creatorId: creator.id, platform: "TIKTOK", handle, followerCount: followers },
    });
  }

  revalidatePath("/creator");
  revalidatePath(`/creators/${creator.id}`);
  redirect("/creator");
}
