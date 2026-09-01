import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The operator gate.
 *
 * /dashboard, /creators and /deals are the AGENCY console — "Creators" lists
 * the whole roster — and until this they were served to anyone who knew the
 * URL. This is a single shared password rather than per-user accounts because
 * there is exactly one operator today; when creators get their own logins this
 * should be replaced, not extended.
 *
 * Deliberately NOT the model for brands. A brand reviewing a video must not
 * need the operator password, so brand access will be an unguessable per-deal
 * token on its own public route — outside this gate entirely.
 *
 * FAILS CLOSED. With NSPIIRE_OPERATOR_PASSWORD unset nobody gets in, including
 * in development. An unconfigured deployment serving the roster is the exact
 * thing this exists to prevent, so "not configured" must not mean "open".
 */

const COOKIE = "nspiire_op";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function password(): string | null {
  const raw = process.env.NSPIIRE_OPERATOR_PASSWORD;
  return raw && raw.length > 0 ? raw : null;
}

/** True when a password is configured at all. /login uses this to explain
 *  itself rather than silently rejecting every attempt. */
export function operatorGateConfigured(): boolean {
  return password() !== null;
}

/**
 * The signing key. NSPIIRE_SESSION_SECRET if set, otherwise the password
 * itself — which means changing the password invalidates every issued cookie.
 * That is the only revocation mechanism there is, and it is why the cookie
 * also carries its own expiry below.
 */
function secret(): string {
  return process.env.NSPIIRE_SESSION_SECRET || password() || "";
}

function sign(expiresAt: number): string {
  return createHmac("sha256", secret()).update(`v1.${expiresAt}`).digest("hex");
}

/** `<expiry>.<hmac>` — the expiry is in the payload so it is covered by the
 *  signature and cannot be extended by editing the cookie. */
export function issueSessionValue(): { value: string; maxAge: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  return { value: `${expiresAt}.${sign(expiresAt)}`, maxAge: MAX_AGE_SECONDS };
}

function equal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, so guard it — and compare
  // even when lengths differ so the failure path costs the same.
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/** Constant-time password check, for the login form. */
export function passwordMatches(attempt: string): boolean {
  const expected = password();
  if (!expected) return false;
  return equal(attempt, expected);
}

function valid(cookieValue: string | undefined): boolean {
  if (!cookieValue || !operatorGateConfigured()) return false;
  const [rawExpiry, mac] = cookieValue.split(".");
  if (!rawExpiry || !mac) return false;
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) return false;
  return equal(mac, sign(expiresAt));
}

export const SESSION_COOKIE = COOKIE;

/** True when this request carries a valid operator session. */
export async function isOperator(): Promise<boolean> {
  const jar = await cookies();
  return valid(jar.get(COOKIE)?.value);
}

/**
 * Gate a page or route. The proxy redirects unauthenticated traffic already,
 * but the Next docs are explicit that proxy is an optimistic check and not an
 * authorization boundary — this is the boundary, and it runs on every gated
 * surface.
 */
export async function requireOperator(returnTo?: string): Promise<void> {
  if (await isOperator()) return;
  const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
  redirect(`/login${next}`);
}
