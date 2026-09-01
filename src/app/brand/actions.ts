"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/creator";
import { BRAND_COOKIE, issueBrandSession, requireActiveBrand } from "@/lib/auth/brand";

/**
 * Brand sign-up, sign-in, and expressing interest in a creator.
 *
 * Brands self-serve here, unlike creators — they APPLY, and an operator decides.
 * That is why the sign-up form creates an account outright rather than needing
 * an invite: the gate is membership, not registration.
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
  const companyName = text(form, "companyName");
  const contactName = text(form, "contactName");
  const email = text(form, "email").toLowerCase();
  const website = text(form, "website");
  const password = form.get("password");

  if (!companyName || !contactName) redirect("/brand/apply?error=missing");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect("/brand/apply?error=email");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    redirect("/brand/apply?error=short");
  }

  const existing = await prisma.brandAccount.findUnique({ where: { email } });
  if (existing) redirect("/brand/apply?error=exists");

  const account = await prisma.brandAccount.create({
    data: {
      email,
      companyName,
      contactName,
      website: website || null,
      passwordHash: hashPassword(password),
      // PENDING by default. Applying is not joining.
    },
  });

  await setSession(account.id);
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
  if (!creatorId) redirect("/brand/roster");

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
    update: { note: note || null },
    create: { brandAccountId: account.id, creatorId: creator.id, note: note || null },
  });

  revalidatePath("/brand/roster");
  revalidatePath("/creator");
  redirect("/brand/roster");
}
