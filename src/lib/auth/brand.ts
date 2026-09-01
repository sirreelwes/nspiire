import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Brand sign-in — the third identity, alongside the operator and the creator.
 *
 * Same construction as ./creator.ts and deliberately NOT shared with it: the
 * payload says "brand:<id>", so a creator cookie can never validate as a brand
 * one even though both are signed with the same secret. Three audiences, three
 * cookies, three login pages.
 *
 * Password hashing is reused from ./creator.ts rather than reimplemented —
 * one scrypt implementation, not two that could drift.
 */

const COOKIE = "nspiire_brand";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const BRAND_COOKIE = COOKIE;

function secret(): string {
  return (
    process.env.NSPIIRE_SESSION_SECRET ||
    process.env.NSPIIRE_OPERATOR_PASSWORD ||
    ""
  );
}

function sign(brandAccountId: string, expiresAt: number): string {
  return createHmac("sha256", secret())
    .update(`brand:${brandAccountId}:${expiresAt}`)
    .digest("hex");
}

export function issueBrandSession(brandAccountId: string): {
  value: string;
  maxAge: number;
} {
  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  return {
    value: `${brandAccountId}.${expiresAt}.${sign(brandAccountId, expiresAt)}`,
    maxAge: MAX_AGE_SECONDS,
  };
}

function equal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export async function currentBrandAccountId(): Promise<string | null> {
  if (!secret()) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, rawExpiry, mac] = raw.split(".");
  if (!id || !rawExpiry || !mac) return null;
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) return null;
  if (!equal(mac, sign(id, expiresAt))) return null;
  return id;
}

/**
 * The signed-in brand account, whatever its membership state.
 *
 * Signing in and being a MEMBER are different things: a pending applicant can
 * log in to see where their application stands. Anything that reads the roster
 * must use requireActiveBrand() instead.
 */
export async function requireBrandAccount() {
  const id = await currentBrandAccountId();
  if (!id) redirect("/brand/login");
  const account = await prisma.brandAccount.findUnique({ where: { id } });
  if (!account) redirect("/brand/login");
  return account;
}

/**
 * A brand whose membership an operator has approved.
 *
 * The roster is the product being sold, so this is the paywall and the consent
 * boundary in one: an unapproved account can reach its own status page and
 * nothing else.
 */
export async function requireActiveBrand() {
  const account = await requireBrandAccount();
  if (account.membership !== "ACTIVE") redirect("/brand");
  return account;
}
