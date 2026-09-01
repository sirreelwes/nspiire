import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authorizeUrl, tiktokConfig } from "@/lib/tiktok/client";
import { isOperator } from "@/lib/auth/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The console's API surface is operator-only, same gate as its pages. */
async function denyIfPublic(): Promise<Response | null> {
  if (await isOperator()) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}


/**
 * Kick off the TikTok Login Kit flow.
 *
 * `state` is a CSRF guard, not decoration: it is generated here, stored in an
 * httpOnly cookie, and compared on the way back. The creator id rides in the
 * same cookie so the callback knows who authorized without trusting the query
 * string. There is no auth yet — when there is, the creator comes from the
 * session and the query param goes away.
 */
export async function GET(request: Request) {
  const denied = await denyIfPublic();
  if (denied) return denied;

  const cfg = tiktokConfig();
  if (!cfg) {
    return Response.json(
      {
        error:
          "TikTok is not configured. Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REDIRECT_URI.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const creatorId = url.searchParams.get("creatorId");

  if (!creatorId) {
    // TikTok bouncing the user back HERE rather than to /callback is the
    // symptom of a redirect-URI mismatch, and it used to surface as a bare
    // "creatorId is required" — which sends you looking in entirely the wrong
    // place. If the request carries OAuth params, name the real problem.
    const looksLikeCallback =
      url.searchParams.has("code") ||
      url.searchParams.has("error") ||
      url.searchParams.has("error_code");

    if (looksLikeCallback) {
      const expected = new URL("/api/tiktok/callback", url.origin).toString();
      return Response.json(
        {
          error: "TikTok sent the user to /connect instead of /callback.",
          diagnosis:
            "TIKTOK_REDIRECT_URI does not match the callback route, or the value registered in the TikTok console differs from the one this app sends.",
          configuredRedirectUri: cfg.redirectUri,
          expectedRedirectUri: expected,
          matches: cfg.redirectUri === expected,
          tiktokSaid: {
            error: url.searchParams.get("error"),
            error_code: url.searchParams.get("error_code"),
            description: url.searchParams.get("error_description"),
          },
        },
        { status: 400 },
      );
    }

    return Response.json(
      {
        error: "creatorId is required",
        hint: "Open this from a creator's page rather than directly.",
        configuredRedirectUri: cfg.redirectUri,
      },
      { status: 400 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("tiktok_oauth", JSON.stringify({ state, creatorId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  redirect(authorizeUrl(cfg, state));
}
