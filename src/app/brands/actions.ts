"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOperator } from "@/lib/auth/operator";

/**
 * Membership decisions. Applying is not joining — an operator rules on every
 * application, and only ACTIVE accounts can see the roster.
 */

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function decide(
  form: FormData,
  membership: "ACTIVE" | "DECLINED" | "CANCELLED",
) {
  await requireOperator();
  const id = text(form, "accountId");
  const note = text(form, "note").slice(0, 500);
  if (!id) redirect("/brands");

  await prisma.brandAccount.update({
    where: { id },
    data: {
      membership,
      decidedAt: new Date(),
      decidedBy: "operator",
      decisionNote: note || null,
    },
  });

  revalidatePath("/brands");
  redirect("/brands");
}

export async function approveMembership(form: FormData) {
  await decide(form, "ACTIVE");
}

export async function declineMembership(form: FormData) {
  await decide(form, "DECLINED");
}

/** Ends access without deleting the account or its interest history. */
export async function cancelMembership(form: FormData) {
  await decide(form, "CANCELLED");
}

/**
 * Write the one-line summaries older shortlists are missing.
 *
 * Runs on the server, where the Claude key lives; a local run of
 * scripts/backfill-brand-summaries.cjs needs a key Vercel will not hand back.
 * Idempotent, so the button can be pressed twice without harm, and it only
 * shows while there is something to write.
 */
export async function writeMissingBrandSummaries(): Promise<void> {
  await requireOperator();
  const { backfillBrandSummaries } = await import("@/lib/brands/summaries");
  let message: string;
  try {
    const r = await backfillBrandSummaries(prisma);
    message = `Wrote ${r.summarised} summar${r.summarised === 1 ? "y" : "ies"}, tidied ${r.summarised === 0 && r.renamed === 0 ? "nothing" : `${r.renamed} name${r.renamed === 1 ? "" : "s"}`}.${r.missed.length ? ` No line came back for ${r.missed.join(", ")}.` : ""}`;
  } catch (err) {
    message = err instanceof Error ? err.message : "Could not write summaries.";
  }
  revalidatePath("/creators");
  revalidatePath("/creator");
  redirect(`/creators?notice=${encodeURIComponent(message)}`);
}
