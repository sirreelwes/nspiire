import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exchangeCode, fetchUser, tiktokConfig } from "@/lib/tiktok/client";
import { linkConnection, syncAccount } from "@/lib/tiktok/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send the creator back to their page with a message rather than a bare JSON error. */
function back(creatorId: string | null, params: Record<string, string>): never {
  const q = new URLSearchParams(params);
  redirect(creatorId ? `/creators/${creatorId}?${q}` : `/dashboard?${q}`);
}

export async function GET(request: Request) {
  const cfg = tiktokConfig();
  const url = new URL(request.url);

  const jar = await cookies();
  const raw = jar.get("tiktok_oauth")?.value;
  jar.delete("tiktok_oauth");

  let saved: { state?: string; creatorId?: string } = {};
  try {
    saved = raw ? JSON.parse(raw) : {};
  } catch {
    saved = {};
  }
  const creatorId = saved.creatorId ?? null;

  if (!cfg) back(creatorId, { error: "TikTok is not configured." });

  // TikTok reports user-side failures on the query string, not by status code.
  const denied = url.searchParams.get("error");
  if (denied) {
    back(creatorId, {
      error: url.searchParams.get("error_description") ?? `TikTok returned ${denied}.`,
    });
  }

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!saved.state || !state || state !== saved.state) {
    back(creatorId, { error: "That sign-in didn't match — start again." });
  }
  if (!code) back(creatorId, { error: "TikTok didn't return an authorization code." });
  if (!creatorId) back(null, { error: "Lost track of which creator this was for." });

  try {
    const tokens = await exchangeCode(cfg, code);
    const profile = await fetchUser(tokens.accessToken);
    const account = await linkConnection(creatorId, tokens, {
      handle: profile.displayName || profile.openId,
      followerCount: profile.followerCount,
    });
    // Pull the first set of metrics straight away — a connection with no
    // numbers behind it is not much use to the agent.
    await syncAccount(account.id);
  } catch (err) {
    back(creatorId, {
      error: err instanceof Error ? err.message : "Could not connect that account.",
    });
  }

  back(creatorId, { connected: "tiktok" });
}
