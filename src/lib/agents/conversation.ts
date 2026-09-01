import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { askStructuredThread } from "./claude";
import { signOff, systemPrompt, type Persona } from "./persona";
import type { AgentResult, ApprovalPolicy } from "./types";
import { formatMoney } from "@/lib/deals/terms";

/**
 * A persona holding a conversation — the interactive half of a virtual agent.
 *
 * Both directions run through here: Iris writing to a brand, and Iris talking
 * to the creator about a deal. Same machinery, same voice, two very different
 * sets of rules (see `audienceRules` in persona.ts). Keeping them in one module
 * is deliberate: the thing that must never happen is a brief meant for the
 * creator being used on a brand, and that is easiest to prevent when both
 * builders are on the same screen.
 *
 * The security property this file exists to hold
 * ----------------------------------------------
 * The brand-facing brief is built by `brandBrief()` and is a DIFFERENT SHAPE
 * from the creator-facing one. It has no floor rate, no guardrails, no
 * shipping address and no fee arithmetic — not because the prompt asks her to
 * keep quiet about them, but because they are not in the bytes she is given.
 * A prompt rule is a request; an absent field is a fact. The prompt rules in
 * persona.ts are the second line, for the things that legitimately have to be
 * in the brief.
 *
 * Nothing here sends anything. Every brand-facing result comes back gated.
 */

/** One message in a thread. `them` is the brand or the creator, never both. */
export interface ThreadMessage {
  from: "persona" | "them";
  body: string;
}

/* -------------------------------------------------------------------------
 * Brand-facing
 * ---------------------------------------------------------------------- */

/**
 * Everything Iris may know while writing to a brand.
 *
 * Read the omissions as the specification. There is an `askCents` and no
 * floor; there is a `whyThisBrand` and no note of what anyone else paid. If a
 * field is not here, she cannot leak it, and adding one to this interface is a
 * decision about what a brand is allowed to learn.
 */
export interface BrandBrief {
  brandName: string;
  brandCategory?: string | null;
  contactName?: string | null;
  creatorName: string;
  creatorNiche: string;
  /** Human-readable audience line. Real synced figures only. */
  audienceLine: string;
  /** Why Scout thought this brand fits — her actual argument. */
  whyThisBrand?: string;
  format: string;
  /** The ASKING rate. Never the floor: see the note at the top of this file. */
  askCents: number | null;
  currency: string;
  usageDays: number | null;
  exclusivityDays: number | null;
  deliverables?: string;
  /** Whether this is the first time we have ever written to this brand. */
  isFirstTouch: boolean;
}

export const BrandMessageSchema = z.object({
  /** Subject line. Reuse the thread's subject when replying. */
  subject: z.string(),
  /** The email body, signed off. No markdown — this goes into an email. */
  body: z.string(),
  /**
   * Anything she was asked and deliberately did not answer. Surfaced to the
   * human reviewing the draft so a dodge is visible rather than buried.
   */
  withheld: z.array(z.string()),
  /** A decision she cannot make. Null when the draft is ready to review. */
  needsDecision: z.string().nullable(),
});
export type BrandMessage = z.output<typeof BrandMessageSchema>;

function brandContext(brief: BrandBrief, persona: Persona): string {
  const lines = [
    `Brand: ${brief.brandName}${brief.brandCategory ? ` (${brief.brandCategory})` : ""}`,
    brief.contactName ? `Their contact: ${brief.contactName}` : null,
    `Creator you represent: ${brief.creatorName} — ${brief.creatorNiche}`,
    `Their audience: ${brief.audienceLine}`,
    brief.whyThisBrand ? `Why this brand fits: ${brief.whyThisBrand}` : null,
    `Format on the table: ${brief.format || "not yet specified"}`,
    `Rate to quote: ${brief.askCents == null ? "none agreed yet — do not invent one" : formatMoney(brief.askCents, brief.currency)}`,
    `Usage rights: ${brief.usageDays == null ? "not discussed" : `${brief.usageDays} days`}`,
    `Exclusivity: ${brief.exclusivityDays == null ? "not discussed" : brief.exclusivityDays === 0 ? "none" : `${brief.exclusivityDays} days`}`,
    brief.deliverables ? `Deliverables: ${brief.deliverables}` : null,
    brief.isFirstTouch
      ? "This is the first contact with this brand."
      : "You have written to this brand before.",
    `Sign off as: ${signOff(persona)}`,
  ].filter(Boolean);

  return `THE BRIEF\n${lines.join("\n")}\n\nThis brief is everything you know. Any figure not in it does not exist for you — say you will confirm and follow up rather than filling the gap.`;
}

/**
 * Draft the next message to a brand.
 *
 * ALWAYS returns needsApproval. There is no send path yet, and more to the
 * point the blueprint gates first outreach and every money-touching move; a
 * message that quotes a rate is money-touching. A human reads this before a
 * brand ever does.
 */
export async function writeToBrand(input: {
  persona: Persona;
  brief: BrandBrief;
  thread: ThreadMessage[];
  approvalPolicy: ApprovalPolicy;
}): Promise<AgentResult<BrandMessage>> {
  const { persona, brief, thread } = input;
  const system = `${systemPrompt(persona, "brand", brief.creatorName)}\n\n${brandContext(brief, persona)}`;

  const opening = `Write the opening email to ${brief.brandName}. Two short paragraphs at most, one concrete audience figure, and a clear ask — a call, or their rate card. Do not attach a rate unless the brief gives you one.`;
  const messages = toMessages(
    thread,
    opening,
    thread.length === 0 ? opening : `Write the next email in this thread.`,
  );

  let out: BrandMessage;
  try {
    out = await askStructuredThread(system, messages, BrandMessageSchema);
  } catch (err) {
    return {
      agent: "persona",
      output: { subject: "", body: "", withheld: [], needsDecision: null },
      escalation: {
        reason: err instanceof Error ? err.message : "Iris could not draft that",
      },
    };
  }

  return {
    agent: "persona",
    output: out,
    needsApproval: {
      gate: brief.isFirstTouch ? "first-outreach" : "outbound-message",
      reason: out.needsDecision
        ? out.needsDecision
        : `${persona.name} drafted this for ${brief.brandName}. Nothing reaches a brand without a human reading it first.`,
    },
  };
}

/* -------------------------------------------------------------------------
 * Creator-facing
 * ---------------------------------------------------------------------- */

/**
 * Everything Iris knows when she talks to the creator.
 *
 * The mirror image of BrandBrief: here the floor, the guardrail breaches and
 * her own read on the deal are exactly what the creator is owed. She works for
 * them. The only thing she is held back from is pressure.
 */
export interface CreatorBrief {
  creatorName: string;
  brandName: string;
  brandCategory?: string | null;
  dealState: string;
  format: string;
  amountCents: number | null;
  currency: string;
  usageDays: number | null;
  exclusivityDays: number | null;
  deliverables?: string;
  notes?: string;
  /** Their walk-away for this format. Theirs to know. */
  floorCents: number | null;
  /** Mechanical guardrail breaches, already computed. */
  violations: string[];
  /** House-policy notes on the deal. */
  policyNotes: string[];
  /** What the terms advisor said, and on what basis. */
  advice?: { basis: string; amountCents: number | null; reasoning: string[] };
  /** What the brand pays Nspiire on top — never deducted from the creator. */
  feeLine?: string;
}

export const CreatorMessageSchema = z.object({
  /** What she says. Conversational — this is a chat, not an email. */
  message: z.string(),
  /** Her actual read on the deal. "no-view" when it isn't that kind of question. */
  recommendation: z.enum([
    "take-it",
    "push-back",
    "walk-away",
    "need-more-info",
    "no-view",
  ]),
  /** Things worth the creator's attention, in their words not ours. */
  watchOuts: z.array(z.string()),
  /** What she would do next, if told to go ahead. Null when nothing is pending. */
  nextStep: z.string().nullable(),
});
export type CreatorMessage = z.output<typeof CreatorMessageSchema>;

function creatorContext(brief: CreatorBrief): string {
  const lines = [
    `Deal: ${brief.brandName}${brief.brandCategory ? ` (${brief.brandCategory})` : ""} — currently ${brief.dealState}`,
    `Format: ${brief.format || "not set"}`,
    `On the table: ${brief.amountCents == null ? "nothing quoted yet" : formatMoney(brief.amountCents, brief.currency)}`,
    `Their floor for this format: ${brief.floorCents == null ? "none set" : formatMoney(brief.floorCents, brief.currency)}`,
    `Usage rights: ${brief.usageDays == null ? "not discussed" : `${brief.usageDays} days`}`,
    `Exclusivity: ${brief.exclusivityDays == null ? "not discussed" : brief.exclusivityDays === 0 ? "none" : `${brief.exclusivityDays} days`}`,
    brief.deliverables ? `Deliverables: ${brief.deliverables}` : null,
    brief.notes ? `Notes on the deal: ${brief.notes}` : null,
    brief.feeLine ? `Nspiire's fee: ${brief.feeLine}` : null,
  ].filter(Boolean);

  if (brief.violations.length > 0) {
    lines.push(
      `OUTSIDE THEIR GUARDRAILS:\n${brief.violations.map((v) => `- ${v}`).join("\n")}`,
    );
  }
  if (brief.policyNotes.length > 0) {
    lines.push(`Notes:\n${brief.policyNotes.map((n) => `- ${n}`).join("\n")}`);
  }
  if (brief.advice) {
    lines.push(
      `What the terms advisor says (basis: ${brief.advice.basis}${
        brief.advice.amountCents != null
          ? `, suggests ${formatMoney(brief.advice.amountCents, brief.currency)}`
          : ""
      }):\n${brief.advice.reasoning.map((r) => `- ${r}`).join("\n")}`,
    );
  }

  return `THE DEAL\n${lines.join("\n")}\n\nThis is everything you know about it. If they ask something that is not here, say you will find out — do not guess at a number that affects their money.`;
}

/**
 * Talk to the creator about a deal — her opening brief, or a reply to whatever
 * they just asked.
 *
 * Not gated. She is talking to the person she works for about their own deal;
 * a human is already in the conversation. What she cannot do is act — anything
 * that changes the deal goes through the state machine and the approval gates,
 * and `nextStep` is a proposal for a human to click, never a thing she did.
 */
export async function talkToCreator(input: {
  persona: Persona;
  brief: CreatorBrief;
  thread: ThreadMessage[];
}): Promise<AgentResult<CreatorMessage>> {
  const { persona, brief, thread } = input;
  const system = `${systemPrompt(persona, "creator", brief.creatorName)}\n\n${creatorContext(brief)}`;

  const opening = `Bring this deal to ${brief.creatorName}. Open with the money and what it means for them, then anything that would cost them something they might not have priced. Keep it short — they can ask you follow-ups.`;
  const messages = toMessages(
    thread,
    opening,
    thread.length === 0 ? opening : `Answer their last message.`,
  );

  let out: CreatorMessage;
  try {
    out = await askStructuredThread(system, messages, CreatorMessageSchema);
  } catch (err) {
    return {
      agent: "persona",
      output: {
        message: "",
        recommendation: "no-view",
        watchOuts: [],
        nextStep: null,
      },
      escalation: {
        reason: err instanceof Error ? err.message : "Iris could not answer that",
      },
    };
  }

  return { agent: "negotiator", output: out };
}

/* -------------------------------------------------------------------------
 * Shared
 * ---------------------------------------------------------------------- */

/**
 * Turn a thread into Messages API turns, with this turn's instruction last so
 * it is the freshest thing in context.
 *
 * `them` becomes user, `persona` becomes assistant. Consecutive same-role turns
 * are legal and get merged, so a brand sending two emails in a row needs no
 * special handling.
 *
 * The one shape that needs care: she usually speaks first — she opens the
 * outreach, she brings the deal — and a messages array cannot start with an
 * assistant turn. Rather than drop her opening message (which is the thing the
 * other side is replying to, so losing it makes the next turn incoherent), put
 * back the instruction that produced it. The reconstruction is faithful: this
 * is exactly the array that existed when she wrote it.
 */
function toMessages(
  thread: ThreadMessage[],
  lead: string,
  instruction: string,
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = thread
    .filter((m) => m.body.trim().length > 0)
    .map((m) => ({
      role: m.from === "persona" ? ("assistant" as const) : ("user" as const),
      content: m.body,
    }));

  if (messages.length > 0 && messages[0].role === "assistant") {
    messages.unshift({ role: "user", content: lead });
  }

  messages.push({ role: "user", content: instruction });
  return messages;
}
