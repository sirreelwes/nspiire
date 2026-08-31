import { z } from "zod";

/**
 * Audience metrics for one social account — the JSON on SocialAccount.metrics.
 *
 * This is the one definition of that shape. Scout scores brand fit off it and
 * the terms advisor prices deals off it, so a wrong number here becomes a wrong
 * number in a real proposal. Every field records where it came from.
 *
 * Deliberately NOT here: audience age/gender/geo. TikTok's Display API does not
 * expose them (they need the Business or Creator Marketplace API), and guessing
 * them would be worse than not having them.
 */
export const AudienceMetricsSchema = z.object({
  followerCount: z.number().int().min(0).nullable().default(null),
  followingCount: z.number().int().min(0).nullable().default(null),
  /** Lifetime likes across the account, where the platform reports it. */
  likesCount: z.number().int().min(0).nullable().default(null),
  videoCount: z.number().int().min(0).nullable().default(null),

  /** Averages over the sampled recent posts — not lifetime. */
  avgViews: z.number().min(0).nullable().default(null),
  avgLikes: z.number().min(0).nullable().default(null),
  avgComments: z.number().min(0).nullable().default(null),
  avgShares: z.number().min(0).nullable().default(null),

  /**
   * Two engagement rates, because the industry quotes both and they differ by
   * an order of magnitude. Never show one without saying which it is.
   *   byViews     = (likes + comments + shares) / views   — how well a post lands
   *   byFollowers = (likes + comments + shares) / followers — what brands quote
   */
  engagementRateByViews: z.number().min(0).nullable().default(null),
  engagementRateByFollowers: z.number().min(0).nullable().default(null),

  /** How many posts the averages are over. One post is not a rate. */
  sampleSize: z.number().int().min(0).default(0),
  /** Where these came from. Never let a manual figure look like a synced one. */
  source: z.enum(["tiktok-api", "manual"]).default("manual"),
  fetchedAt: z.string().nullable().default(null),
});
export type AudienceMetrics = z.output<typeof AudienceMetricsSchema>;

export function parseMetrics(value: unknown): AudienceMetrics {
  const parsed = AudienceMetricsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : AudienceMetricsSchema.parse({});
}

/** One sampled post. Matches the fields TikTok's /v2/video/list/ returns. */
export interface PostStats {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
}

/**
 * Derive averages and engagement rates from a sample of recent posts.
 *
 * Averages over the sample, not lifetime — a creator's last 20 posts predict
 * the next sponsored one far better than their all-time totals do. Posts with
 * no views are dropped from the by-views rate rather than counted as zero,
 * which would drag the rate toward nothing.
 */
export function deriveMetrics(
  posts: PostStats[],
  account: {
    followerCount?: number | null;
    followingCount?: number | null;
    likesCount?: number | null;
    videoCount?: number | null;
  },
  source: AudienceMetrics["source"] = "tiktok-api",
): AudienceMetrics {
  const n = posts.length;
  const mean = (pick: (p: PostStats) => number) =>
    n === 0 ? null : posts.reduce((a, p) => a + pick(p), 0) / n;

  const avgViews = mean((p) => p.viewCount);
  const avgLikes = mean((p) => p.likeCount);
  const avgComments = mean((p) => p.commentCount);
  const avgShares = mean((p) => p.shareCount);

  const interactions =
    avgLikes == null || avgComments == null || avgShares == null
      ? null
      : avgLikes + avgComments + avgShares;

  const followers = account.followerCount ?? null;

  return AudienceMetricsSchema.parse({
    followerCount: followers,
    followingCount: account.followingCount ?? null,
    likesCount: account.likesCount ?? null,
    videoCount: account.videoCount ?? null,
    avgViews,
    avgLikes,
    avgComments,
    avgShares,
    engagementRateByViews:
      interactions != null && avgViews != null && avgViews > 0
        ? interactions / avgViews
        : null,
    engagementRateByFollowers:
      interactions != null && followers != null && followers > 0
        ? interactions / followers
        : null,
    sampleSize: n,
    source,
    fetchedAt: new Date().toISOString(),
  });
}

export function formatRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return String(Math.round(n));
}
