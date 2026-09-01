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
 *   /api/tiktok/callback   TikTok redirects the user here after consent, so it
 *                          cannot require a session. It is protected instead by
 *                          the CSRF state cookie it already checks.
 */

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/terms",
  "/privacy",
  "/api/tiktok/callback",
  // A creator has to be able to reach their own sign-in and accept an invite
  // before they have any session at all.
  "/creator/login",
  "/creator/set-password",
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // Two different audiences, two different cookies. A creator session must NOT
  // open the operator console, and the operator cookie is not a creator
  // session either — /creator scopes every query to the id inside its own
  // cookie, so letting an operator cookie through would land on a page with no
  // creator to scope to. Signatures are checked server-side in
  // lib/auth/creator.ts; this only looks for presence.
  if (pathname === "/creator" || pathname.startsWith("/creator/")) {
    if (request.cookies.has("nspiire_creator")) return NextResponse.next();
    const login = new URL("/creator/login", request.url);
    return NextResponse.redirect(login);
  }

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
  // Everything except Next's own assets and the favicon. Gating by exclusion
  // so a new route is private by default — the opposite mistake (a new page
  // added to an allowlist-by-omission) is the one that leaks a roster.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
