import { prisma } from "@/lib/prisma";
import { deriveMetrics } from "@/lib/creators/metrics";
import {
  TikTokError,
  fetchRecentPosts,
  fetchUser,
  refreshTokens,
  tiktokConfig,
} from "@/lib/tiktok/client";

/** How many recent posts to average over. TikTok pages at 20; two pages is
 *  enough to smooth out one viral outlier without reaching back months. */
const SAMPLE_SIZE = 40;

/** Refresh a little before expiry rather than after a 401. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface SyncResult {
  handle: string;
  followerCount: number | null;
  sampleSize: number;
  engagementRateByFollowers: number | null;
}

/**
 * Return a usable access token for the account, refreshing first if it is
 * expired or close to it. A refresh can return a NEW refresh token, so the
 * stored one is always replaced with whatever comes back.
 */
async function freshAccessToken(accountId: string): Promise<string> {
  const cfg = tiktokConfig();
  if (!cfg) throw new TikTokError("TikTok is not configured on this environment");

  const account = await prisma.socialAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { accessToken: true, refreshToken: true, tokenExpiresAt: true },
  });
  if (!account.refreshToken) {
    throw new TikTokError("That account isn't connected to TikTok yet");
  }

  const stillValid =
    account.accessToken &&
    account.tokenExpiresAt &&
    account.tokenExpiresAt.getTime() - REFRESH_SKEW_MS > Date.now();
  if (stillValid) return account.accessToken as string;

  const tokens = await refreshTokens(cfg, account.refreshToken);
  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    },
  });
  return tokens.accessToken;
}

/**
 * Pull the account's current stats and recent posts, derive the metrics, and
 * persist them. followerCount is written to its own column as well as into
 * metrics, because Scout and the terms advisor both read the column.
 */
export async function syncAccount(accountId: string): Promise<SyncResult> {
  const accessToken = await freshAccessToken(accountId);

  const [user, posts] = await Promise.all([
    fetchUser(accessToken),
    fetchRecentPosts(accessToken, SAMPLE_SIZE),
  ]);

  const metrics = deriveMetrics(posts, user, "tiktok-api");

  const account = await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      followerCount: user.followerCount ?? null,
      metrics,
      externalId: user.openId || undefined,
      lastSyncedAt: new Date(),
    },
    select: { handle: true },
  });

  return {
    handle: account.handle,
    followerCount: metrics.followerCount,
    sampleSize: metrics.sampleSize,
    engagementRateByFollowers: metrics.engagementRateByFollowers,
  };
}

/**
 * Attach a freshly authorized TikTok connection to a creator.
 *
 * Matches on TikTok's open_id first — the handle can change, open_id cannot.
 * Falls back to the platform+handle row onboarding created, so connecting an
 * account the creator already typed in updates it rather than duplicating it.
 */
export async function linkConnection(
  creatorId: string,
  tokens: { accessToken: string; refreshToken: string; openId: string; scopes: string[]; expiresAt: Date },
  profile: { handle: string; followerCount?: number },
) {
  const existing =
    (tokens.openId
      ? await prisma.socialAccount.findFirst({
          where: { creatorId, platform: "TIKTOK", externalId: tokens.openId },
        })
      : null) ??
    (await prisma.socialAccount.findFirst({
      where: { creatorId, platform: "TIKTOK", handle: profile.handle },
    })) ??
    // The Display API returns display_name ("Wine Blind"), never the
    // @username, so the handle the creator typed at onboarding
    // ("wine.blind") will not match and the two lookups above both miss on a
    // first connection. Adopt the creator's existing unconnected TikTok row
    // rather than creating a second one — a duplicate is worse than a
    // mismatched label, because the page renders socials[0] and the synced
    // data would sit there invisible.
    (await prisma.socialAccount.findFirst({
      where: { creatorId, platform: "TIKTOK", externalId: null },
      orderBy: { id: "asc" },
    }));

  const data = {
    externalId: tokens.openId || null,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
    followerCount: profile.followerCount ?? undefined,
  };

  if (existing) {
    // Deliberately does not touch `handle`: the creator's own "@wine.blind" is
    // more useful than TikTok's display name, and overwriting it would break
    // the handle lookup above on the next connection.
    return prisma.socialAccount.update({ where: { id: existing.id }, data });
  }
  return prisma.socialAccount.create({
    data: { creatorId, platform: "TIKTOK", handle: profile.handle, ...data },
  });
}
