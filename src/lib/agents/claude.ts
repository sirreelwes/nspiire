import Anthropic from "@anthropic-ai/sdk";

/** Single Claude client for all agents. Set ANTHROPIC_API_KEY in env. */
let _client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export const DEFAULT_MODEL = process.env.NSPIIRE_MODEL ?? "claude-sonnet-4-5";

/** Minimal helper: one-shot structured call, returns text. */
export async function ask(system: string, user: string): Promise<string> {
  const res = await claude().messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}
