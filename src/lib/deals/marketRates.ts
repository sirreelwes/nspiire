import { followerBand } from "./stateMachine";

/**
 * Published going rates, for formats where a creator with no rate card and no
 * closed deals would otherwise get no number at all.
 *
 * The advisor's rule is that every figure is sourced. These are sourced too —
 * to public rate guides rather than to this creator's own history — which is
 * why they sit below the rate card in trust and are labelled as market rates
 * wherever they are shown. They are a floor for the conversation, not a
 * quote: the point is that a nano creator asked to use a song does not have
 * to guess whether $10 or $200 is normal.
 *
 * Sound placement, per video, USD, keyed by the same follower bands
 * writeBenchmark() uses. Ranges are the overlap of four 2026 rate guides
 * (Dynamoi, InfluencerFee, iKonX, Chartlex) plus Billboard/NPR reporting on
 * label campaigns; the wide spread inside each band is real, because dance
 * and lifestyle accounts price well above the rest.
 *
 * Revisit when Nspiire has closed sound placements of its own: three PAID
 * deals in a band and the benchmark path takes over automatically.
 */
export interface MarketRate {
  lowCents: number;
  highCents: number;
  /** Where Iris would open, inside the range. */
  askCents: number;
  /** One line a creator can be shown. */
  source: string;
}

const SOUND_PLACEMENT_2026: Record<string, MarketRate> = {
  "0-10K": { lowCents: 2_500, highCents: 20_000, askCents: 7_500, source: "2026 sound-campaign rate guides" },
  "10K-50K": { lowCents: 20_000, highCents: 80_000, askCents: 35_000, source: "2026 sound-campaign rate guides" },
  "50K-100K": { lowCents: 50_000, highCents: 200_000, askCents: 90_000, source: "2026 sound-campaign rate guides" },
  "100K-250K": { lowCents: 150_000, highCents: 500_000, askCents: 250_000, source: "2026 sound-campaign rate guides" },
  "250K-500K": { lowCents: 250_000, highCents: 1_000_000, askCents: 450_000, source: "2026 sound-campaign rate guides" },
  "500K-1M": { lowCents: 400_000, highCents: 1_500_000, askCents: 700_000, source: "2026 sound-campaign rate guides" },
  "1M-5M": { lowCents: 800_000, highCents: 3_000_000, askCents: 1_200_000, source: "2026 sound-campaign rate guides" },
  "5M+": { lowCents: 1_500_000, highCents: 8_000_000, askCents: 2_500_000, source: "2026 sound-campaign rate guides" },
};

const TABLES: Record<string, Record<string, MarketRate>> = {
  "sound placement": SOUND_PLACEMENT_2026,
};

/** Market rate for a format at a follower count, or null when there is no
 *  published table for that format. Formats match case-insensitively, the
 *  same way rate-card keys do. */
export function marketRate(format: string, followerCount: number | null): MarketRate | null {
  if (followerCount == null) return null;
  const table = TABLES[format.trim().toLowerCase()];
  if (!table) return null;
  return table[followerBand(followerCount)] ?? null;
}
