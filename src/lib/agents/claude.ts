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
