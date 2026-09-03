import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic gate in front of the operator console.
 *
 * Next 16 renamed middleware.ts to proxy.ts; the docs are explicit that this
 * layer is for optimistic checks and NOT an authorization solution, so this
 * only looks for the presence of a session cookie. The signature is verified
 * server-side in requireOperator() (src/lib/auth/operator.ts), which is the
 * actual boundary — a forged cookie gets past this and dies there.
 *
 * What stays public, and why:
 *   /              the marketing page
 *   /login         obviously
 *   /terms         TikTok's review needs both of these reachable without
 *   /privacy       auth; gating them would fail the app submission
 *   /inquiries     the front door — a brand or a creator writing in. The only
 *                  unauthenticated write anyone can reach without a token, so
 *                  its abuse defences live in lib/inquiries/schema.ts
 *   /api/tiktok/callback   TikTok redirects the user here after consent, so it
 *                          cannot require a session. It is protected instead by
 *                          the CSRF state cookie it already checks.
 *   /b/<token>     the brand's deal room. A brand has no Nspiire account and
 *                  must never have the operator password, so the unguessable
 *                  token IS the authorisation — see lib/deals/brandAccess.ts.
 *                  Prefix-matched rather than listed, because the token varies.
 */

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/terms",
  "/privacy",
  "/api/tiktok/callback",
  "/inquiries",
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (pathname === "/b" || pathname.startsWith("/b/")) return NextResponse.next();
  if (request.cookies.has("nspiire_op")) return NextResponse.next();

  // An API client should get a status code, not a login page. Redirecting
  // /api/* to /login means a fetch() that follows redirects resolves to HTML
  // with a 200 — a caller checking res.ok would read that as success.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets, the favicon and the link-preview
  // images. Gating by exclusion so a new route is private by default — the
  // opposite mistake (a new page added to an allowlist-by-omission) is the one
  // that leaks a roster.
  //
  // opengraph-image/twitter-image have to be public or link previews break:
  // Slack, iMessage and X fetch them with no cookies, and a redirect to /login
  // is not an image. They are the wordmark on a white ground and leak nothing.
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|favicon.ico|opengraph-image.png|twitter-image.png).*)",
  ],
};
