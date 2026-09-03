"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma, hasDatabase } from "@/lib/prisma";
import {
  InquirySchema,
  RATE_LIMIT_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
  clientIp,
  hashIp,
} from "@/lib/inquiries/schema";

/**
 * Take a submission from the public form.
 *
 * Every failure path here redirects back to the form rather than throwing, and
 * — importantly — the two abuse paths (honeypot, rate limit) redirect to the
 * SAME success screen a real submission gets. Telling a bot it was caught just
 * tells its author what to change.
 */

function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function back(kind: string, message: string): never {
  redirect(
    `/inquiries?as=${kind.toLowerCase()}&error=${encodeURIComponent(message)}`,
  );
}

export async function submitInquiry(form: FormData) {
  const kind = field(form, "kind") === "CREATOR" ? "CREATOR" : "BRAND";
  const sent = `/inquiries?as=${kind.toLowerCase()}&sent=1`;

  // The honeypot. A human never sees this input, so anything in it came from
  // something filling every field on the page. Answer as though it worked.
  if (field(form, "website")) redirect(sent);

  if (!hasDatabase) {
    back(kind, "We can't take inquiries right now. Try again shortly.");
  }

  const parsed = InquirySchema.safeParse({
    kind,
    name: field(form, "name"),
    email: field(form, "email"),
    company: field(form, "company"),
    message: field(form, "message"),
    budgetBand: field(form, "budgetBand"),
  });
  if (!parsed.success) {
    back(kind, parsed.error.issues[0]?.message ?? "Check the form.");
  }

  const forwardedFor = (await headers()).get("x-forwarded-for");
  const ipHash = hashIp(clientIp(forwardedFor));

  let overLimit = false;
  try {
    if (ipHash) {
      const recent = await prisma.inquiry.count({
        where: {
          ipHash,
          createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
        },
      });
      overLimit = recent >= RATE_LIMIT_PER_WINDOW;
    }
    if (!overLimit) {
      await prisma.inquiry.create({
        data: {
          kind: parsed.data.kind,
          name: parsed.data.name,
          email: parsed.data.email,
          company: parsed.data.company || null,
          message: parsed.data.message,
          budgetBand: parsed.data.budgetBand || null,
          ipHash,
        },
      });
    }
  } catch {
    back(kind, "Something went wrong sending that. Try again.");
  }

  // Over the limit gets the same screen as success — see the note above.
  redirect(sent);
}
