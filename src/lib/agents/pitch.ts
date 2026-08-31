import { ask } from "./claude";
import type { AgentResult, ApprovalPolicy } from "./types";

/**
 * Pitch — crafts personalized outreach in the creator's voice (blueprint §4).
 * Email-first (blueprint §5: cleaner legally and technically than DMs).
 * Sending happens elsewhere (email infra TBD, §9.6); Pitch only drafts.
 */

export interface PitchInput {
  creator: {
    name: string;
    niche: string;
    voiceProfile: Record<string, unknown>;
    stats: string; // short human-readable stats line for the pitch
  };
  brand: { name: string; category?: string; rationale: string };
  contact?: { name?: string; email?: string };
  approvalPolicy: ApprovalPolicy;
  isFirstTouchToBrand: boolean;
}

export interface DraftEmail {
  to?: string;
  subject: string;
  body: string;
}

const SYSTEM = `You are Pitch, the outreach agent for Nspiire, an AI manager for social media creators.
Write a short, specific, human-sounding sponsorship pitch email from the creator (or their management) to the brand.
Use the creator's voice profile. No hype-speak, no "I hope this finds you well", no em-dash abuse.
2 short paragraphs max + a clear ask for a call or rate-card send. Include one concrete audience stat.
Return strict JSON: {"subject","body"}. No prose.`;

export async function runPitch(
  input: PitchInput
): Promise<AgentResult<DraftEmail>> {
  const raw = await ask(SYSTEM, JSON.stringify(input));
  let draft: DraftEmail;
  try {
    draft = JSON.parse(raw.replace(/```json?|```/g, "").trim());
  } catch {
    return {
      agent: "pitch",
      output: { subject: "", body: "" },
      escalation: { reason: "Pitch returned unparseable output" },
    };
  }
  draft.to = input.contact?.email;
  const needsApproval =
    input.isFirstTouchToBrand && input.approvalPolicy.gateFirstOutreach
      ? {
          gate: "first-outreach",
          reason: `First contact with ${input.brand.name} requires creator approval`,
        }
      : undefined;
  return { agent: "pitch", output: draft, needsApproval };
}
