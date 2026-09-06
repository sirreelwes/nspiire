"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/creator";
import {
  BRAND_COOKIE,
  issueBrandSession,
  requireActiveBrand,
  requireBrandAccount,
} from "@/lib/auth/brand";

/**
 * Brands joining the interest list, signing in, and asking for a creator.
 *
 * Nobody is charged and nobody is a member yet. Charging for a three-creator
 * roster is the one move that is hard to undo — a brand's first impression is
 * expensive to redo, and "marketplace" followed by three creators in three
 * niches reads as vapour. So brands join a list, and membership stays dormant
 * in the schema until the roster is worth paying for.
 *
 * The signal to switch it on: brands asking for creators we do not have.
 */

const MIN_PASSWORD = 12;

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function setSession(id: string) {
  const { value, maxAge } = issueBrandSession(id);
  (await cookies()).set(BRAND_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function brandApply(form: FormData): Promise<void> {
  // Which door they came in by. A manager's sign-up carries the first song
  // as a brief; everything else about the account is the same.
  const kind = form.get("kind") === "MUSIC" ? "MUSIC" : "BRAND";
  const back = kind === "MUSIC" ? "/music" : "/brand/apply";
  const companyName = text(form, "companyName");
  const contactName = text(form, "contactName");
  const email = text(form, "email").toLowerCase();
  const website = text(form, "website");
  const lookingFor = text(form, "lookingFor").slice(0, 500);
  const budgetRange = text(form, "budgetRange").slice(0, 100);
  const timing = text(form, "timing").slice(0, 100);
  const password = form.get("password");

  const brief = kind === "MUSIC" ? briefFromForm(form) : null;

  if (!companyName || !contactName) redirect(`${back}?error=missing`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`${back}?error=email`);
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    redirect(`${back}?error=short`);
  }
  if (kind === "MUSIC" && !brief) redirect(`${back}?error=track`);

  const existing = await prisma.brandAccount.findUnique({ where: { email } });
  if (existing) redirect(`${back}?error=exists`);

  const account = await prisma.brandAccount.create({
    data: {
      email,
      companyName,
      contactName,
      website: website || null,
      passwordHash: hashPassword(password),
      lookingFor: lookingFor || null,
      budgetRange: budgetRange || null,
      timing: timing || null,
      kind,
      briefs: brief ? { create: brief } : undefined,
      // PENDING by default — on the list, not a member.
    },
  });

  await setSession(account.id);
  revalidatePath("/brands");
  redirect("/brand");
}

/**
 * One song, as a manager briefs it. Free text, like the demand fields on the
 * account: a link, a feeling, a window, a count. Null when the two things a
 * brief cannot do without — who the artist is and where the song is — are
 * missing.
 */
function briefFromForm(form: FormData) {
  const artistName = text(form, "artistName").slice(0, 200);
  const trackUrl = text(form, "trackUrl").slice(0, 500);
  if (!artistName || !trackUrl) return null;
  const videosRaw = Number(text(form, "videosWanted").replace(/[^0-9]/g, ""));
  return {
    artistName,
    trackUrl,
    mood: text(form, "mood").slice(0, 200) || null,
    lookingFor: text(form, "lookingFor").slice(0, 500) || null,
    postingWindow: text(form, "postingWindow").slice(0, 100) || null,
    videosWanted:
      Number.isFinite(videosRaw) && videosRaw > 0 ? Math.min(videosRaw, 10_000) : null,
    budgetRange: text(form, "budgetRange").slice(0, 100) || null,
    releaseDate: text(form, "releaseDate").slice(0, 100) || null,
  };
}

/** A manager lines up the next song. Any membership state: a company on the
 *  list can queue a release while they wait. */
export async function addSoundBrief(form: FormData): Promise<void> {
  const account = await requireBrandAccount();
  if (account.kind !== "MUSIC") redirect("/brand");
  const brief = briefFromForm(form);
  if (!brief) redirect("/brand?error=track");

  await prisma.soundBrief.create({ data: { ...brief, brandAccountId: account.id } });

  revalidatePath("/brand");
  revalidatePath("/brand/roster");
  revalidatePath("/brands");
  redirect("/brand");
}

export async function brandSignIn(form: FormData): Promise<void> {
  const email = text(form, "email").toLowerCase();
  const password = form.get("password");

  const account = email
    ? await prisma.brandAccount.findUnique({ where: { email } })
    : null;

  // One message for every failure — distinguishing them tells an attacker
  // which companies have accounts.
  if (
    !account ||
    typeof password !== "string" ||
    !verifyPassword(password, account.passwordHash)
  ) {
    redirect("/brand/login?error=denied");
  }

  await prisma.brandAccount.update({
    where: { id: account.id },
    data: { lastLoginAt: new Date() },
  });
  await setSession(account.id);
  redirect("/brand");
}

export async function brandSignOut(): Promise<void> {
  (await cookies()).delete(BRAND_COOKIE);
  redirect("/");
}

/**
 * "We'd like to work with this creator."
 *
 * Records interest and nothing else — no thread, no contact details, no
 * message reaches the creator's inbox. The creator accepting is what opens a
 * channel, which is the same consent rule that governs outreach going the
 * other way.
 */
export async function brandExpressInterest(form: FormData): Promise<void> {
  const account = await requireActiveBrand();
  const creatorId = text(form, "creatorId");
  const note = text(form, "note").slice(0, 1000);
  const briefId = text(form, "briefId");
  if (!creatorId) redirect("/brand/roster");

  // The song has to be this account's. A brief id from the form is only ever
  // looked up together with the session's account, so someone else's song
  // simply is not found.
  const brief = briefId
    ? await prisma.soundBrief.findFirst({
        where: { id: briefId, brandAccountId: account.id },
        select: { id: true },
      })
    : null;
  if (account.kind === "MUSIC" && !brief) redirect("/brand/roster");

  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: { id: true },
  });
  if (!creator) redirect("/brand/roster");

  await prisma.brandInterest.upsert({
    where: {
      brandAccountId_creatorId: {
        brandAccountId: account.id,
        creatorId: creator.id,
      },
    },
    // Re-expressing interest must not reopen something the creator declined.
    update: { note: note || null, briefId: brief?.id ?? null },
    create: {
      brandAccountId: account.id,
      creatorId: creator.id,
      note: note || null,
      briefId: brief?.id ?? null,
    },
  });

  revalidatePath("/brand/roster");
  revalidatePath("/creator");
  redirect("/brand/roster");
}
