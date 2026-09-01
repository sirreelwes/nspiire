import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/** Single Claude client for all agents. Reads ANTHROPIC_API_KEY from env. */
let _client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export const DEFAULT_MODEL = process.env.NSPIIRE_MODEL ?? "claude-opus-5";

export function hasClaude(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AgentUnavailableError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set on this environment");
    this.name = "AgentUnavailableError";
  }
}

/**
 * One structured call. The schema is enforced by the API rather than coaxed out
 * of the prose, so there is no fenced-JSON to strip and no half-parsed object
 * to guess at — either it validates or it throws.
 *
 * Adaptive thinking is on: every agent here is making a judgement (is this
 * brand a fit, is this rate fair) rather than reformatting text.
 */
export async function askStructured<T extends z.ZodType>(
  system: string,
  user: string,
  schema: T,
  opts: { effort?: "low" | "medium" | "high" | "xhigh" | "max" } = {},
): Promise<z.infer<T>> {
  if (!hasClaude()) throw new AgentUnavailableError();

  const res = await claude().messages.parse({
    model: DEFAULT_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: opts.effort ?? "high",
      format: zodOutputFormat(schema),
    },
    system,
    messages: [{ role: "user", content: user }],
  });

  if (res.stop_reason === "refusal") {
    throw new Error(
      `Claude declined this request${res.stop_details?.category ? ` (${res.stop_details.category})` : ""}`,
    );
  }
  if (!res.parsed_output) {
    throw new Error("Claude returned no structured output");
  }
  return res.parsed_output as z.infer<T>;
}

/**
 * A structured call over a running conversation rather than a single question.
 *
 * Same contract as `askStructured`, but the caller supplies the whole message
 * history — which is what a persona needs: she is mid-thread with a brand, or
 * mid-conversation with the creator, and her last four answers are context.
 *
 * The system prompt is sent as a cached block. It is the persona's voice plus
 * the deal brief, both of which are byte-identical across the turns of one
 * conversation, so it is the right prefix to keep warm; the volatile part (the
 * new message) is in `messages`, after it. Caching is best-effort — a short
 * prefix silently will not cache, which costs nothing but the saving.
 */
export async function askStructuredThread<T extends z.ZodType>(
  system: string,
  messages: Anthropic.MessageParam[],
  schema: T,
  opts: { effort?: "low" | "medium" | "high" | "xhigh" | "max" } = {},
): Promise<z.infer<T>> {
  if (!hasClaude()) throw new AgentUnavailableError();

  const res = await claude().messages.parse({
    model: DEFAULT_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: opts.effort ?? "high",
      format: zodOutputFormat(schema),
    },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  });

  if (res.stop_reason === "refusal") {
    throw new Error(
      `Claude declined this request${res.stop_details?.category ? ` (${res.stop_details.category})` : ""}`,
    );
  }
  if (!res.parsed_output) {
    throw new Error("Claude returned no structured output");
  }
  return res.parsed_output as z.infer<T>;
}

/**
 * Plain-text call. Only for the agents not yet wired up (pitch, negotiator,
 * counsel) — they still parse JSON out of the prose, which is exactly what
 * `askStructured` exists to avoid. Migrate each to `askStructured` when it is
 * actually put to work; nothing new should use this.
 */
export async function ask(system: string, user: string): Promise<string> {
  if (!hasClaude()) throw new AgentUnavailableError();
  const res = await claude().messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}
