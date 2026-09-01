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
