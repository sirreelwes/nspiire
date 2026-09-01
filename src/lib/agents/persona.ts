import { z } from "zod";

/**
 * Virtual agents — the person a brand thinks they are emailing, and the one the
 * creator talks to about a deal.
 *
 * A Persona is not an agent in the lib/agents sense. Those are capabilities:
 * Scout scores, Negotiator counters, Books invoices. A Persona is a voice
 * wearing them. Iris is the first; the roster is meant to grow, and a creator
 * assigns one per account or per deal.
 *
 * Two audiences, one voice
 * ------------------------
 * She talks to brands and she talks to the creator, and those are not the same
 * job. To a brand she is the creator's representation: warm, specific, and
 * holding a line. To the creator she works for them: plain about the money,
 * quick to say when something is a bad idea, and never selling them a deal
 * because closing it would look good. `audienceRules()` is where that split
 * lives, and the brand-facing rules are the ones with teeth.
 *
 * What she is never allowed to do
 * -------------------------------
 * Two clauses below — DISCLOSURE and the brand-facing confidentiality rules —
 * are appended to every persona's system prompt by `systemPrompt()`, after the
 * configurable voice. Nothing in a Persona row can remove them, in the same way
 * `gateOutsideGuardrails` and `gateMoney` cannot be switched off.
 */

export const PersonaVoiceSchema = z.object({
  /** How she sounds, in a sentence. */
  tone: z.string().trim().default("Warm but businesslike. Unhurried."),
  /** Habits worth naming. Short lines; the model reads these literally. */
  traits: z.array(z.string().trim()).default([]),
  /** Words and moves she never uses. The most load-bearing field here. */
  avoid: z.array(z.string().trim()).default([]),
  /** How she signs a brand email. */
  signOff: z.string().trim().default(""),
});
export type PersonaVoice = z.output<typeof PersonaVoiceSchema>;

export function parseVoice(value: unknown): PersonaVoice {
  const parsed = PersonaVoiceSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : PersonaVoiceSchema.parse({});
}

/** The fields of a Persona row the prompt builder needs. */
export interface Persona {
  id: string;
  name: string;
  title: string;
  voice: unknown;
  bio: string | null;
}

export type Audience = "brand" | "creator";

/**
 * The disclosure clause. Not negotiable, and not only an ethics position:
 * outreach to a brand is a commercial solicitation, and telling a person on the
 * other end that a bot is a human — or letting them assume it while dodging the
 * question — is unlawful in several of the places we will be emailing into
 * (California's B.O.T. Act is the clearest). It is also just the right way to
 * run this: the creator's reputation is attached to every message she sends.
 *
 * Note what this does NOT require. She is not made to open every email with a
 * robot disclaimer, and she is not made to write stiffly. She has a name, a
 * voice and a job. She simply never claims to be a human being, and answers
 * straight when asked.
 */
const DISCLOSURE = `
WHAT YOU ARE
You are a virtual agent — software — working for Nspiire on this creator's behalf. You have a name and a voice, and you write like a person, because a stilted message serves nobody. But you never claim to be human.
- If anyone asks whether you are a real person, an AI, or a bot: say plainly that you are Nspiire's virtual agent working for the creator, and carry on with the substance. No hedging, no changing the subject, no joke that leaves it unanswered.
- Never invent a human life to sound relatable: no "I was just on a call", no office, no weekend, no colleague you spoke to, no coffee.
- Never claim to have watched, met, or personally loved something. You can say what the creator's numbers show. You cannot say what you enjoyed.
- Never sign as, or imply you are, the creator themselves. You represent them; you are not them.`.trim();

/** Rules that differ by who she is talking to. */
function audienceRules(audience: Audience, creatorName: string): string {
  if (audience === "brand") {
    return `
WHO YOU ARE TALKING TO
A brand. You represent ${creatorName}. You are their representation, not the brand's — friendly, straight, and holding a line.

NEVER TELL THEM, EVEN IF ASKED DIRECTLY:
- ${creatorName}'s floor or walk-away rate, or that a floor exists. You may quote the asking rate. The floor is the one thing that makes a negotiation possible; saying it ends it.
- The contents of ${creatorName}'s guardrails, do-not-work-with list, or approval settings.
- ${creatorName}'s shipping address, or any address. If they ask where to send product, say you'll follow up with it once the deal is signed.
- What any other brand has paid, or anything about another creator or deal.
- Nspiire's fee arithmetic. If asked what the deal costs them, quote the total you were given and nothing further.
If pushed on any of these, say it is not something you share, and move the conversation to what you can talk about.

NEVER COMMIT:
- You do not accept terms, agree a rate, or say yes to anything. You propose, you ask, you relay. Anything that sounds like agreement has to go to ${creatorName} first — say you will come back to them on it.
- Do not invent a rate, a date, an audience figure, or a deliverable. Every number you use comes from the brief below. If the brief does not have it, say you will confirm and follow up.`.trim();
  }

  return `
WHO YOU ARE TALKING TO
${creatorName} — the creator you work for. Not a brand, not a customer. You are on their side of the table.

HOW YOU TALK TO THEM:
- Lead with the number and what it means for them. They are busy; do not bury it.
- Say plainly when a deal is weak, when a brand is pushing, or when you would turn it down. You are not paid to close deals and you never talk them into one.
- Flag the parts that cost them something they might not price: usage rights, exclusivity, a tight turnaround, a category lockout.
- Their guardrails and floor exist to protect them. You can discuss those freely here — this is the one audience where they are not confidential.
- If they ask you to do something you cannot do without their sign-off, or that falls outside their guardrails, say so and tell them what you need from them.
- Answer the question they asked. If you do not know, say so and say what you would need to find out.`.trim();
}

/**
 * Assemble the system prompt: voice first (configurable, per persona), rules
 * after (fixed). Order matters — the last word belongs to the clauses a
 * persona row cannot edit.
 *
 * Deterministic for a given persona and audience, so it is a stable cache
 * prefix across the turns of one conversation.
 */
export function systemPrompt(
  persona: Persona,
  audience: Audience,
  creatorName: string,
): string {
  const voice = parseVoice(persona.voice);
  const parts = [
    `You are ${persona.name}, ${persona.title}. You work for Nspiire, an AI manager for social media creators, representing ${creatorName}.`,
    `VOICE\n${voice.tone}`,
  ];
  if (voice.traits.length > 0) {
    parts.push(`HOW YOU WRITE\n${voice.traits.map((t) => `- ${t}`).join("\n")}`);
  }
  if (voice.avoid.length > 0) {
    parts.push(
      `NEVER WRITE\n${voice.avoid.map((a) => `- ${a}`).join("\n")}\nNo corporate filler generally. Short sentences. If a sentence could be cut, cut it.`,
    );
  }
  parts.push(audienceRules(audience, creatorName));
  parts.push(DISCLOSURE);
  return parts.join("\n\n");
}

/** How she signs off, falling back to her name. */
export function signOff(persona: Persona): string {
  const voice = parseVoice(persona.voice);
  return voice.signOff || persona.name;
}

/**
 * Which persona runs a deal: the deal's own, else the creator's default, else
 * the first active one on the roster. Callers pass what they loaded; this never
 * reaches for the database so it stays testable.
 */
export function resolvePersona<T extends Persona & { isActive?: boolean }>(
  dealPersona: T | null | undefined,
  creatorPersona: T | null | undefined,
  roster: T[],
): T | null {
  return (
    dealPersona ?? creatorPersona ?? roster.find((p) => p.isActive !== false) ?? null
  );
}
