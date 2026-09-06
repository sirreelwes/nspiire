import { z } from "zod";
import { askStructured } from "@/lib/agents/claude";

/**
 * Give every brand on a shortlist the one-line summary Scout now produces,
 * and move a bracketed descriptor out of the brand's name.
 *
 * Opportunities sourced before Scout returned a summary show a rationale
 * sentence on the creator's card instead of one line on what the company is.
 * This fills the gap with Scout's own rule text. It writes only null
 * summaries and renames only when the clean name is free, so running it twice
 * is harmless and running it on a fresh roster does nothing.
 *
 * Lives here, not only in scripts/, so the operator can run it from the
 * console where the Claude key already is — a local run needs a key that
 * Vercel will not hand back.
 */

const Output = z.object({
  summaries: z.array(z.object({ name: z.string(), summary: z.string() })),
});

const SYSTEM = `For each brand, write "summary": one short line on what the company IS, in plain words, as you would say it to someone who has never heard of them. Under 12 words. No pitch, no fit reasoning, no adjectives like "leading" or "innovative". Use the notes only to identify the company. Return every brand, with "name" copied exactly.`;

export interface SummaryBackfillResult {
  summarised: number;
  renamed: number;
  /** Brands the model did not return a line for. */
  missed: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma client, typed loosely as elsewhere in lib
export async function backfillBrandSummaries(db: any): Promise<SummaryBackfillResult> {
  const brands: {
    id: string;
    name: string;
    category: string | null;
    opportunities: { rationale: string | null; evidence: string | null }[];
  }[] = await db.brand.findMany({
    where: { summary: null, opportunities: { some: {} } },
    include: {
      opportunities: { select: { rationale: true, evidence: true }, take: 1 },
    },
  });

  let summarised = 0;
  const missed: string[] = [];

  if (brands.length > 0) {
    const out = await askStructured(
      SYSTEM,
      JSON.stringify(
        brands.map((b) => ({
          name: b.name,
          category: b.category,
          notes: b.opportunities[0]?.evidence ?? b.opportunities[0]?.rationale ?? "",
        })),
      ),
      Output,
      { effort: "low" },
    );
    const byName = new Map(out.summaries.map((s) => [s.name, s.summary.trim()]));
    for (const b of brands) {
      const summary = byName.get(b.name);
      if (!summary) {
        missed.push(b.name);
        continue;
      }
      await db.brand.update({ where: { id: b.id }, data: { summary } });
      summarised += 1;
    }
  }

  let renamed = 0;
  const bracketed: { id: string; name: string }[] = await db.brand.findMany({
    where: { name: { endsWith: ")" } },
    select: { id: true, name: true },
  });
  for (const b of bracketed) {
    const clean = b.name.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (!clean || clean === b.name) continue;
    const taken = await db.brand.findUnique({ where: { name: clean }, select: { id: true } });
    if (taken) continue;
    await db.brand.update({ where: { id: b.id }, data: { name: clean } });
    renamed += 1;
  }

  return { summarised, renamed, missed };
}

/** How many shortlisted brands still lack a summary — drives whether the
 *  operator is offered the button at all. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function countBrandsWithoutSummary(db: any): Promise<number> {
  return db.brand.count({ where: { summary: null, opportunities: { some: {} } } });
}
