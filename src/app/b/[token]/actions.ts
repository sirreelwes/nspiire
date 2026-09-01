"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isBrandToken } from "@/lib/deals/brandAccess";

/**
 * What a brand can do from the deal room.
 *
 * Both actions take a token from a public page, so both treat every input as
 * hostile: the token's shape is checked before it is queried, the body is
 * length-capped, and neither action can reach anything the token does not
 * already open. There is no deal id in the form — a brand naming a deal is a
 * brand choosing one.
 *
 * Note what a brand cannot do here: change terms, move the deal, or make Iris
 * reply. They post a message. Everything that alters a deal still runs through
 * `transition()` and the approval gates on the operator side.
 */

const MAX_BODY = 5000;

function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Resolve a token to its deal, or send the caller nowhere. */
async function dealForToken(token: string) {
  if (!isBrandToken(token)) redirect("/");
  const deal = await prisma.deal.findUnique({
    where: { brandToken: token },
    select: { id: true, brandId: true },
  });
  if (!deal) redirect("/");
  return deal;
}

/**
 * Post the brand's message into the thread.
 *
 * Stored as an ordinary inbound Interaction, which is what makes the rest work:
 * the operator sees it on the deal page, and it becomes part of the thread
 * Iris is given when someone asks her to draft a reply.
 *
 * That last part is why the body is capped and why it is stored verbatim rather
 * than interpreted here. It is untrusted text that will reach a model, and the
 * defence against it is structural — the brand-facing brief has no field for
 * the floor rate, the guardrails or the address (see lib/agents/conversation.ts),
 * so an instruction buried in this message has nothing to reveal.
 */
export async function postBrandMessage(form: FormData) {
  const token = field(form, "token");
  const deal = await dealForToken(token);

  const body = field(form, "body").slice(0, MAX_BODY);
  if (!body) redirect(`/b/${token}`);

  await prisma.interaction.create({
    data: {
      dealId: deal.id,
      channel: "portal",
      direction: "inbound",
      actor: "brand",
      audience: "brand",
      body,
    },
  });

  revalidatePath(`/b/${token}`);
  revalidatePath(`/deals/${deal.id}`);
  redirect(`/b/${token}`);
}

/**
 * Stop contacting this brand.
 *
 * Set on the Brand, not the deal: someone who says stop means the company, not
 * this one thread, and a second creator's outreach next week would be exactly
 * the thing they asked us not to do. `sendBrandMessage()` refuses on it.
 */
export async function optOutBrand(form: FormData) {
  const token = field(form, "token");
  const deal = await dealForToken(token);

  await prisma.brand.update({
    where: { id: deal.brandId },
    data: { optedOutAt: new Date() },
  });

  revalidatePath(`/b/${token}`);
  revalidatePath(`/deals/${deal.id}`);
  redirect(`/b/${token}`);
}
