import { z } from "zod";
import {
  ApprovalPolicySchema,
  GuardrailsSchema,
  type ApprovalPolicy,
} from "@/lib/agents/types";

/**
 * Creator onboarding — blueprint milestone 1.
 *
 * Mirrors the Platform enum in prisma/schema.prisma. Kept local so the
 * client form can import it without pulling in @prisma/client; if you
 * change one, change both.
 */
export const PLATFORMS = [
  "INSTAGRAM",
  "TIKTOK",
  "YOUTUBE",
  "X",
  "FACEBOOK",
  "SNAPCHAT",
  "TWITCH",
  "OTHER",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  X: "X",
  FACEBOOK: "Facebook",
  SNAPCHAT: "Snapchat",
  TWITCH: "Twitch",
  OTHER: "Other",
};

/** Starting points for the rate card — the creator can rename or add rows. */
export const SUGGESTED_FORMATS = [
  "Dedicated video",
  "Integration",
  "Story set",
  "Feed post",
  "Reel / Short",
  "UGC (no post)",
] as const;

const SocialInput = z.object({
  platform: z.enum(PLATFORMS),
  handle: z
    .string()
    .trim()
    .min(1, "Handle is required")
    .transform((h) => h.replace(/^@/, "")),
  followerCount: z.number().int().min(0).nullable().optional(),
});

/**
 * One rate-card row. `rateCents` is what we quote; `floorCents` is the
 * walk-away number the Negotiator may never go below without a human.
 */
const RateInput = z
  .object({
    format: z.string().trim().min(1, "Format is required"),
    rateCents: z.number().int().min(0),
    floorCents: z.number().int().min(0).nullable().optional(),
  })
  .refine((r) => r.floorCents == null || r.floorCents <= r.rateCents, {
    message: "Floor cannot be above the asking rate",
    path: ["floorCents"],
  });

export const CreatorOnboardingSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  niche: z.string().trim().min(1, "Niche is required"),
  socials: z.array(SocialInput).min(1, "Add at least one social account"),
  rates: z.array(RateInput).min(1, "Add at least one rate"),
  maxUsageDays: z.number().int().min(0).max(3650),
  maxExclusivityDays: z.number().int().min(0).max(3650),
  doNotWorkWith: z.array(z.string().trim().min(1)).default([]),
  voiceNotes: z.string().trim().default(""),
  voiceSamples: z.array(z.string().trim().min(1)).default([]),
});
export type CreatorOnboardingInput = z.input<typeof CreatorOnboardingSchema>;
export type CreatorOnboarding = z.output<typeof CreatorOnboardingSchema>;

/**
 * Shape the validated form into the three Json columns on Creator.
 * Rate card is `{ [format]: cents }` so it lines up 1:1 with
 * `guardrails.floorRatesCents`, which the Negotiator reads.
 */
export function toCreatorRecord(input: CreatorOnboarding) {
  const rateCard: Record<string, number> = {};
  const floorRatesCents: Record<string, number> = {};
  for (const r of input.rates) {
    rateCard[r.format] = r.rateCents;
    // No explicit floor means the asking rate IS the floor — never quietly
    // hand the agent room the creator didn't give it.
    floorRatesCents[r.format] = r.floorCents ?? r.rateCents;
  }

  const guardrails = GuardrailsSchema.parse({
    floorRatesCents,
    maxUsageDays: input.maxUsageDays,
    maxExclusivityDays: input.maxExclusivityDays,
    doNotWorkWith: input.doNotWorkWith,
    offeredFormats: Object.keys(rateCard),
  });

  return {
    rateCard,
    guardrails,
    voiceProfile: { notes: input.voiceNotes, samples: input.voiceSamples },
    approvalPolicy: defaultApprovalPolicy(),
  };
}

/**
 * Blueprint hard rule: `gateOutsideGuardrails` and `gateMoney` cannot be
 * disabled. Onboarding doesn't expose the policy at all, but this is the
 * one place a policy is written, so the clamp lives here too.
 */
export function defaultApprovalPolicy(
  overrides: Partial<ApprovalPolicy> = {},
): ApprovalPolicy {
  return ApprovalPolicySchema.parse({
    ...overrides,
    gateOutsideGuardrails: true,
    gateMoney: true,
  });
}
