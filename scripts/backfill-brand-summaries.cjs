/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS, run with node directly */
// Give every brand on a creator's shortlist the one-line summary Scout now
// produces, and move a bracketed descriptor out of the brand's name.
//
// Writes Brand.summary only where it is null; renames only when the clean name
// is free. Same rule text as Scout's SYSTEM prompt in src/lib/agents/scout.ts.
// Reads ANTHROPIC_API_KEY and DATABASE_URL from .env / .env.local.
//
// From the repo root:
//   node scripts/backfill-brand-summaries.cjs --dry   prints, writes nothing
//   node scripts/backfill-brand-summaries.cjs         writes
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
for (const f of [".env", ".env.local"]) {
  const file = path.join(root, f);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const { PrismaClient } = require("@prisma/client");
const Anthropic = require("@anthropic-ai/sdk").default;
const { zodOutputFormat } = require("@anthropic-ai/sdk/helpers/zod");
const { z } = require("zod");

const dry = process.argv.includes("--dry");
const prisma = new PrismaClient();
const ai = new Anthropic();

const Output = z.object({
  summaries: z.array(z.object({ name: z.string(), summary: z.string() })),
});

const SYSTEM = `For each brand, write "summary": one short line on what the company IS, in plain words, as you would say it to someone who has never heard of them. Under 12 words. No pitch, no fit reasoning, no adjectives like "leading" or "innovative". Use the notes only to identify the company. Return every brand, with "name" copied exactly.`;

async function main() {
  const brands = await prisma.brand.findMany({
    where: { summary: null, opportunities: { some: {} } },
    include: {
      opportunities: { select: { rationale: true, evidence: true }, take: 1 },
    },
  });
  console.log(`${brands.length} brand${brands.length === 1 ? "" : "s"} without a summary${dry ? " (dry run)" : ""}`);

  if (brands.length > 0) {
    const res = await ai.messages.parse({
      model: process.env.NSPIIRE_MODEL ?? "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Output) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            brands.map((b) => ({
              name: b.name,
              category: b.category,
              notes: b.opportunities[0]?.evidence ?? b.opportunities[0]?.rationale ?? "",
            })),
          ),
        },
      ],
    });
    const byName = new Map(res.parsed_output.summaries.map((s) => [s.name, s.summary.trim()]));
    for (const b of brands) {
      const summary = byName.get(b.name);
      if (!summary) {
        console.log(`  no summary returned for ${b.name}`);
        continue;
      }
      console.log(`  ${b.name} -> ${summary}`);
      if (!dry) await prisma.brand.update({ where: { id: b.id }, data: { summary } });
    }
  }

  const bracketed = await prisma.brand.findMany({ where: { name: { endsWith: ")" } } });
  for (const b of bracketed) {
    const clean = b.name.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (!clean || clean === b.name) continue;
    const taken = await prisma.brand.findUnique({ where: { name: clean } });
    console.log(`  rename "${b.name}" -> "${clean}"${taken ? "  SKIPPED, name taken" : ""}`);
    if (!dry && !taken) await prisma.brand.update({ where: { id: b.id }, data: { name: clean } });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
