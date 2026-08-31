import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authorizeUrl, tiktokConfig } from "@/lib/tiktok/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const creatorId = new URL(request.url).searchParams.get("creatorId");
  if (!creatorId) {
    return Response.json({ error: "creatorId is required" }, { status: 400 });
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
