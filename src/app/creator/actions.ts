"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
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
