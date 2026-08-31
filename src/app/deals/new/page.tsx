import Link from "next/link";
import { prisma, hasDatabase } from "@/lib/prisma";
import { createDeal } from "@/app/deals/actions";
import { parseGuardrails } from "@/lib/deals/guardrails";
import {
  Crumb,
  ErrorBanner,
  NotConnected,
  Section,
  TermsFields,
  field,
  ghostBtn,
  hint,
  label,
} from "@/app/deals/ui";

export const dynamic = "force-dynamic";

async function load() {
  if (!hasDatabase) return { ready: false as const };
  try {
    const creators = await prisma.creator.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, niche: true, guardrails: true },
      take: 200,
    });
    // Format suggestions come from the rate cards that already exist, so the
    // typed format lines up with a floor rate instead of inventing a new one.
    const formats = new Set<string>();
    for (const c of creators) {
      for (const f of parseGuardrails(c.guardrails).offeredFormats) formats.add(f);
    }
    return { ready: true as const, creators, formats: [...formats].sort() };
  } catch {
    return { ready: false as const, unreachable: true };
  }
}

export default async function NewDealPage(props: PageProps<"/deals/new">) {
  const { error } = await props.searchParams;
  const data = await load();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:py-16">
      <Crumb href="/deals">← Deals</Crumb>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        New deal
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        Starts at <strong className="font-medium">Pitched</strong>. Every move
        after this is logged. Terms are optional now — you can fill them in as
        the negotiation goes.
      </p>

      <ErrorBanner message={typeof error === "string" ? error : undefined} />
      {!data.ready && (
        <NotConnected unreachable={"unreachable" in data && data.unreachable} />
      )}

      {data.ready && data.creators.length === 0 && (
        <div className="mt-8 rounded-xl border border-neutral-200 px-4 py-6 dark:border-neutral-800">
          <p className="text-sm text-neutral-500">
            No creators yet. A deal needs someone to belong to.
          </p>
          <Link href="/onboarding" className={`${ghostBtn} mt-4 inline-block`}>
            Onboard a creator
          </Link>
        </div>
      )}

      {data.ready && data.creators.length > 0 && (
        <form action={createDeal} className="mt-10 flex flex-col gap-10">
          <Section title="Who and where">
            <div className="flex flex-col gap-4">
              <div>
                <label className={label} htmlFor="creatorId">
                  Creator
                </label>
                <select
                  id="creatorId"
                  name="creatorId"
                  className={field}
                  defaultValue={data.creators[0].id}
                  required
                >
                  {data.creators.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.niche ? ` — ${c.niche}` : ""}
                    </option>
                  ))}
                </select>
                <p className={hint}>
                  Their guardrails are what these terms get checked against.
                </p>
              </div>
              <div>
                <label className={label} htmlFor="brandName">
                  Brand
                </label>
                <input
                  id="brandName"
                  name="brandName"
                  className={field}
                  placeholder="Brand name"
                  required
                />
                <p className={hint}>
                  Matched by name — an existing brand keeps its history.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="brandCategory">
                    Category
                  </label>
                  <input
                    id="brandCategory"
                    name="brandCategory"
                    className={field}
                    placeholder="Outdoor gear"
                  />
                </div>
                <div>
                  <label className={label} htmlFor="brandWebsite">
                    Website
                  </label>
                  <input
                    id="brandWebsite"
                    name="brandWebsite"
                    className={field}
                    inputMode="url"
                    placeholder="example.com"
                  />
                </div>
              </div>
            </div>
          </Section>

          <Section title="Opening terms">
            <TermsFields formats={data.formats} />
          </Section>

          <div className="sticky bottom-0 -mx-5 border-t border-neutral-200 bg-[var(--background)] px-5 py-4 dark:border-neutral-800">
            <button
              type="submit"
              className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-base font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Create deal
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
