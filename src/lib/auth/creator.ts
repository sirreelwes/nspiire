import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Creator sign-in — a creator's own account, entirely separate from the
 * operator password in ./operator.ts.
 *
 * The two must not be confused: the operator sees the whole roster, a creator
 * sees only themselves. They use different cookies, different signing
 * payloads and different login pages, so holding one can never be mistaken for
 * the other. A creator session carries the creator id, which is what every
 * query under /creator scopes on.
 *
 * Passwords are scrypt via node:crypto rather than argon2 — no native module
 * to build on Vercel, and scrypt is memory-hard and in the standard library.
 */

const COOKIE = "nspiire_creator";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

export const CREATOR_COOKIE = COOKIE;

/* ---------------------------------------------------------------- passwords */

/** `scrypt$<salt-hex>$<hash-hex>` — the salt travels with the hash. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  let actual: Buffer;
  try {
    actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/* ------------------------------------------------------------------ invites */

export function newInviteToken(): { token: string; expiresAt: Date } {
  return {
    token: randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  };
}

/* ----------------------------------------------------------------- sessions */

function secret(): string {
  // Shares the operator's signing secret, but never its payload shape — a
  // creator cookie says "creator:<id>" and an operator cookie does not, so one
  // can never validate as the other.
  return process.env.NSPIIRE_SESSION_SECRET || process.env.NSPIIRE_OPERATOR_PASSWORD || "";
}

function sign(creatorId: string, expiresAt: number): string {
  return createHmac("sha256", secret())
    .update(`creator:${creatorId}:${expiresAt}`)
    .digest("hex");
}

export function issueCreatorSession(creatorId: string): {
  value: string;
  maxAge: number;
} {
  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  return {
    value: `${creatorId}.${expiresAt}.${sign(creatorId, expiresAt)}`,
    maxAge: MAX_AGE_SECONDS,
  };
}

function equal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/** The signed-in creator's id, or null. Verifies the signature — never trusts
 *  the id in the cookie on its own. */
export async function currentCreatorId(): Promise<string | null> {
  if (!secret()) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [creatorId, rawExpiry, mac] = raw.split(".");
  if (!creatorId || !rawExpiry || !mac) return null;
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) return null;
  if (!equal(mac, sign(creatorId, expiresAt))) return null;
  return creatorId;
}

/**
 * The signed-in creator, or a redirect to their login.
 *
 * Everything under /creator must go through this and scope on the id it
 * returns. Taking a creator id from a route param or a form field instead is
 * how one creator ends up reading another's deals.
 */
export async function requireCreator() {
  const id = await currentCreatorId();
  if (!id) redirect("/creator/login");
  const creator = await prisma.creator.findUnique({ where: { id } });
  // The row can vanish (deleted between requests) — a valid signature over a
  // creator that no longer exists is not a session.
  if (!creator) redirect("/creator/login");
  return creator;
}
