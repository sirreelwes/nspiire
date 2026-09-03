"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DealTermsSchema } from "@/lib/deals/terms";
import { DEFAULT_USAGE_DAYS } from "@/lib/deals/policy";

/**
 * Triage — turning something a stranger wrote into something the pipeline can
 * hold, or deciding it isn't.
 *
 * Every action here is operator-only by virtue of the route: /inbox is not in
 * the proxy's public set, so an unauthenticated request never reaches these.
 * That is the opposite of /inquiries/actions.ts, which anyone can call and
 * which is written accordingly.
 */

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function withError(message: string): never {
  redirect(`/inbox?error=${encodeURIComponent(message)}`);
}

const STATUSES = ["NEW", "TRIAGED", "CONVERTED", "SPAM", "CLOSED"] as const;
type Status = (typeof STATUSES)[number];

/** Move an inquiry through the queue without converting it. */
export async function setInquiryStatus(form: FormData) {
  const id = text(form, "inquiryId");
  const status = text(form, "status");
  if (!id) withError("Missing inquiry.");
  if (!(STATUSES as readonly string[]).includes(status)) {
    withError("Unknown status.");
  }

  try {
    await prisma.inquiry.update({
      where: { id },
      data: { status: status as Status },
    });
  } catch {
    withError("Could not update that inquiry.");
  }

  revalidatePath("/inbox");
  revalidatePath("/dashboard");
  redirect("/inbox");
}

/** Operator notes. Never shown to the person who wrote in. */
export async function saveInquiryNotes(form: FormData) {
  const id = text(form, "inquiryId");
  if (!id) withError("Missing inquiry.");

  try {
    await prisma.inquiry.update({
      where: { id },
      data: { notes: text(form, "notes") || null },
    });
  } catch {
    withError("Could not save those notes.");
  }

  revalidatePath("/inbox");
  redirect("/inbox");
}

/**
 * A brand that asked not to be contacted has written in again.
 *
 * Not cleared automatically on conversion, even though writing in is a strong
 * signal they changed their mind: it may be a different person at the same
 * company, and the cost of being wrong is contacting someone who explicitly
 * said stop. So it takes a deliberate click, by a human who has read the
 * message.
 */
export async function reinstateBrand(form: FormData) {
  const brandId = text(form, "brandId");
  if (!brandId) withError("Missing brand.");

  try {
    await prisma.brand.update({
      where: { id: brandId },
      data: { optedOutAt: null },
    });
  } catch {
    withError("Could not reinstate that brand.");
  }

  revalidatePath("/inbox");
  redirect("/inbox");
}

/**
 * Turn a brand inquiry into a real deal.
 *
 * The part that matters is the last step: their message is written onto the
 * deal as an INBOUND brand interaction. That is not bookkeeping — `writeToBrand`
 * decides between an opening pitch and a reply by whether the brand thread is
 * empty, so seeding it means Iris answers the person who wrote in rather than
 * cold-pitching someone who already asked. An inbound brand should never
 * receive a first-contact email.
 */
export async function convertInquiry(form: FormData) {
  const inquiryId = text(form, "inquiryId");
  const creatorId = text(form, "creatorId");
  const brandName = text(form, "brandName");
  if (!inquiryId) withError("Missing inquiry.");
  if (!creatorId) withError("Pick which creator this is for.");
  if (!brandName) withError("Give the brand a name.");

  const inquiry = await prisma.inquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry) withError("No such inquiry.");
  if (inquiry.kind !== "BRAND") {
    withError("Only brand inquiries convert to deals.");
  }

  // A brand that opted out is a hard stop until a human reinstates it. Checked
  // before anything is written so a refused conversion leaves nothing behind.
  const existing = await prisma.brand.findUnique({ where: { name: brandName } });
  if (existing?.optedOutAt) {
    withError(
      `${brandName} previously asked not to be contacted. Reinstate them first if this message means they changed their mind.`,
    );
  }

  let dealId: string;
  try {
    dealId = await prisma.$transaction(async (tx) => {
      const brand = await tx.brand.upsert({
        where: { name: brandName },
        // Don't clobber what's already known about a brand we've met before.
        update: {},
        create: { name: brandName },
      });

      // Their email is the one contact detail an inquiry always carries, and
      // it is a contact who wrote to US — the opposite of Scout's guesses.
      await tx.contact.upsert({
        where: { brandId_email: { brandId: brand.id, email: inquiry.email } },
        update: { name: inquiry.name || undefined },
        create: {
          brandId: brand.id,
          name: inquiry.name || null,
          email: inquiry.email,
          source: "inquiry form",
        },
      });

      // House standard opening terms, same as /deals/new. The rate stays
      // unset: a budget band is not an offer and must not become one.
      const deal = await tx.deal.create({
        data: {
          creatorId,
          brandId: brand.id,
          terms: DealTermsSchema.parse({
            usageDays: DEFAULT_USAGE_DAYS,
            exclusivityDays: 0,
          }),
        },
      });

      await tx.interaction.create({
        data: {
          dealId: deal.id,
          channel: "portal",
          direction: "inbound",
          actor: "brand",
          audience: "brand",
          subject: "Inquiry from the website",
          body: inquiry.message,
          approval: {
            source: "inquiry",
            inquiryId: inquiry.id,
            budgetBand: inquiry.budgetBand ?? null,
            company: inquiry.company ?? null,
          },
        },
      });

      await tx.inquiry.update({
        where: { id: inquiry.id },
        data: { status: "CONVERTED" },
      });

      return deal.id;
    });
  } catch {
    withError("Could not convert that inquiry into a deal.");
  }

  revalidatePath("/inbox");
  revalidatePath("/deals");
  revalidatePath("/dashboard");
  redirect(`/deals/${dealId}`);
}
