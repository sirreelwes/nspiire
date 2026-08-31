"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { InvalidTransitionError, transition } from "@/lib/deals/stateMachine";
import { isDealState } from "@/lib/deals/labels";
import { DealTermsSchema, toCents } from "@/lib/deals/terms";

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
