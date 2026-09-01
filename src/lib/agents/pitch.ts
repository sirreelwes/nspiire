import { z } from "zod";
import { askStructured } from "./claude";
import type { AgentResult } from "./types";

/**
 * Pitch — drafts the outreach email in the creator's voice (blueprint §4).
 *
 * Email-first (blueprint §5: cleaner legally and technically than DMs). Pitch
 * only DRAFTS. Nothing in this codebase can send, and that is deliberate for
 * now — the creator reads the actual words and approves them, and the operator
 * sends by hand until an email provider is wired up.
 *
 * Drafted on demand rather than for every brand Scout finds: at four brands a
 * run most get declined, and a model call per brand up front is spend on
 * messages nobody will send.
 */

export const DraftEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
});
export type DraftEmail = z.infer<typeof DraftEmailSchema>;

export interface PitchInput {
  creator: {
    name: string;
    niche: string;
    /** Human-readable audience line — Pitch quotes from this, never invents. */
    stats: string;
    voiceProfile: Record<string, unknown>;
  };
  brand: { name: string; category?: string | null; rationale: string };
  format: string;
}

const SYSTEM = `You are Pitch, the outreach agent for Nspiire, an AI manager for social media creators.

Write a short sponsorship pitch email FROM the creator TO the brand.

Rules:
- Two short paragraphs at most, then one clear ask (a call, or their rate card / campaign calendar).
- Include exactly one concrete audience number, taken from the stats line you are given. Never invent or round a number you were not given.
- Say specifically why THIS brand and this creator fit. A pitch that would work for any brand is a bad pitch.
- Plain human English. No "I hope this finds you well", no "in today's landscape", no hype, no emoji, no exclamation marks.
- Do not promise results, reach figures or conversions you cannot evidence.
- Do not invent a contact name. If you have no name, open without one.
- Sign off as the creator by name.
- The subject line is under 60 characters and says something specific.`;

export async function runPitch(
  input: PitchInput,
): Promise<AgentResult<DraftEmail>> {
  try {
    const draft = await askStructured(
      SYSTEM,
      JSON.stringify(input),
      DraftEmailSchema,
      { effort: "medium" },
    );
    return {
      agent: "pitch",
      output: draft,
      // Always. The creator reads the words before anything leaves.
      needsApproval: {
        gate: "first-outreach",
        reason: `${input.creator.name} approves the message before it goes to ${input.brand.name}`,
      },
    };
  } catch (err) {
    return {
      agent: "pitch",
      output: { subject: "", body: "" },
      escalation: {
        reason: err instanceof Error ? err.message : "Pitch failed",
      },
    };
  }
}
