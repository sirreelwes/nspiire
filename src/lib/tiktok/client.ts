import type { PostStats } from "@/lib/creators/metrics";

/**
 * TikTok Display API v2 client.
 *
 * Endpoints and scopes verified against developers.tiktok.com (Aug 2026):
 *   POST https://open.tiktokapis.com/v2/oauth/token/   token exchange + refresh
 *   GET  https://open.tiktokapis.com/v2/user/info/     profile + stats
 *   POST https://open.tiktokapis.com/v2/video/list/    recent posts, max 20/page
 *
 * Field-to-scope mapping matters — asking for a field you lack the scope for
 * fails the whole request:
 *   user.info.basic    open_id, union_id, avatar_url, display_name
 *   user.info.profile  bio_description, is_verified, profile_deep_link
 *   user.info.stats    follower_count, following_count, likes_count, video_count
 *
 * Access tokens last 24 hours; refresh tokens 365 days. A refresh may return a
 * NEW refresh token, which must replace the stored one.
 */

const AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const VIDEO_LIST_URL = "https://open.tiktokapis.com/v2/video/list/";

export const TIKTOK_SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "user.info.stats",
  "video.list",
] as const;

const USER_FIELDS = [
  "open_id",
  "union_id",
  "display_name",
  "avatar_url",
  "bio_description",
  "is_verified",
  "profile_deep_link",
  "follower_count",
  "following_count",
  "likes_count",
  "video_count",
] as const;

const VIDEO_FIELDS = [
  "id",
  "create_time",
  "title",
  "view_count",
  "like_count",
  "comment_count",
  "share_count",
] as const;

export interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}

/** Reads config from env. Returns null when TikTok isn't configured yet, so
 *  callers can degrade to manual metrics rather than crash. */
export function tiktokConfig(): TikTokConfig | null {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  if (!clientKey || !clientSecret || !redirectUri) return null;
  return { clientKey, clientSecret, redirectUri };
}

export class TikTokError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TikTokError";
  }
}

/** The URL to send the creator to. `state` is echoed back — check it on return. */
export function authorizeUrl(cfg: TikTokConfig, state: string): string {
  const q = new URLSearchParams({
    client_key: cfg.clientKey,
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
    redirect_uri: cfg.redirectUri,
    state,
  });
  return `${AUTH_BASE}?${q.toString()}`;
}

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  openId: string;
  scopes: string[];
  /** Absolute expiry, computed from the relative expires_in TikTok returns. */
  expiresAt: Date;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function postToken(
  cfg: TikTokConfig,
  body: Record<string, string>,
): Promise<TikTokTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: cfg.clientKey,
      client_secret: cfg.clientSecret,
      ...body,
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error || !json.access_token || !json.refresh_token) {
    throw new TikTokError(
      json.error_description ?? json.error ?? `Token request failed (${res.status})`,
      res.status,
      json.error,
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    openId: json.open_id ?? "",
    scopes: (json.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    expiresAt: new Date(Date.now() + (json.expires_in ?? 86400) * 1000),
  };
}

/** The `code` from the callback must be URL-decoded before it is sent back. */
export function exchangeCode(cfg: TikTokConfig, code: string) {
  return postToken(cfg, {
    code: decodeURIComponent(code),
    grant_type: "authorization_code",
    redirect_uri: cfg.redirectUri,
  });
}

export function refreshTokens(cfg: TikTokConfig, refreshToken: string) {
  return postToken(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });
}

export interface TikTokUser {
  openId: string;
  unionId?: string;
  displayName?: string;
  avatarUrl?: string;
  bioDescription?: string;
  isVerified?: boolean;
  profileDeepLink?: string;
  followerCount?: number;
  followingCount?: number;
  likesCount?: number;
  videoCount?: number;
}

async function readOrThrow(res: Response, what: string) {
  const json = await res.json().catch(() => ({}));
  const err = (json as { error?: { code?: string; message?: string } }).error;
  // TikTok returns 200 with error.code "ok" on success, so check the body too.
  if (!res.ok || (err?.code && err.code !== "ok")) {
    throw new TikTokError(
      err?.message ?? `${what} failed (${res.status})`,
      res.status,
      err?.code,
    );
  }
  return json as Record<string, unknown>;
}

export async function fetchUser(accessToken: string): Promise<TikTokUser> {
  const url = `${USER_INFO_URL}?fields=${USER_FIELDS.join(",")}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = await readOrThrow(res, "user/info");
  const u = ((json.data as Record<string, unknown>)?.user ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  return {
    openId: String(u.open_id ?? ""),
    unionId: u.union_id ? String(u.union_id) : undefined,
    displayName: u.display_name ? String(u.display_name) : undefined,
    avatarUrl: u.avatar_url ? String(u.avatar_url) : undefined,
    bioDescription: u.bio_description ? String(u.bio_description) : undefined,
    isVerified: typeof u.is_verified === "boolean" ? u.is_verified : undefined,
    profileDeepLink: u.profile_deep_link ? String(u.profile_deep_link) : undefined,
    followerCount: num(u.follower_count),
    followingCount: num(u.following_count),
    likesCount: num(u.likes_count),
    videoCount: num(u.video_count),
  };
}

/**
 * Recent public posts. TikTok caps a page at 20, so `limit` above that pages
 * through using the cursor it hands back.
 */
export async function fetchRecentPosts(
  accessToken: string,
  limit = 20,
): Promise<PostStats[]> {
  const out: PostStats[] = [];
  let cursor: number | undefined;

  while (out.length < limit) {
    const res = await fetch(`${VIDEO_LIST_URL}?fields=${VIDEO_FIELDS.join(",")}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        max_count: Math.min(20, limit - out.length),
        ...(cursor ? { cursor } : {}),
      }),
      cache: "no-store",
    });
    const json = await readOrThrow(res, "video/list");
    const data = (json.data ?? {}) as Record<string, unknown>;
    const videos = Array.isArray(data.videos) ? data.videos : [];
    for (const v of videos as Record<string, unknown>[]) {
      out.push({
        viewCount: Number(v.view_count ?? 0),
        likeCount: Number(v.like_count ?? 0),
        commentCount: Number(v.comment_count ?? 0),
        shareCount: Number(v.share_count ?? 0),
      });
    }
    if (!data.has_more || videos.length === 0) break;
    cursor = Number(data.cursor);
    if (!Number.isFinite(cursor)) break;
  }
  return out.slice(0, limit);
}
