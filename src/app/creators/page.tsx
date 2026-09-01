import { ConsoleNav } from "@/components/ConsoleNav";
import { requireOperator } from "@/lib/auth/operator";
import Link from "next/link";
import { prisma, hasDatabase } from "@/lib/prisma";
import { parseMetrics, formatCount, formatRate } from "@/lib/creators/metrics";
import { Crumb, NotConnected, primaryBtn } from "@/app/deals/ui";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  await requireOperator("/creators");

  const creators = hasDatabase
    ? await prisma.creator.findMany({
        include: { socials: true, _count: { select: { deals: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:py-14">
      <ConsoleNav current="/creators" />
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Creators</h1>
        <Link href="/creators/invite" className={primaryBtn}>
          Invite a creator
        </Link>
      </div>

      {!hasDatabase && <NotConnected />}

      <div className="mt-8 rounded-xl border border-neutral-200 dark:border-neutral-800">
        {creators.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">
            No creators yet.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {creators.map((c) => {
              const primary = c.socials[0];
              // Onboarding writes followerCount to its own column and leaves
              // metrics empty until a sync runs, so fall back to the column
              // rather than showing a dash for a number we already have.
              const stored = parseMetrics(primary?.metrics);
              const m = {
                ...stored,
                followerCount: stored.followerCount ?? primary?.followerCount ?? null,
              };
              return (
                <li key={c.id}>
                  <Link
                    href={`/creators/${c.id}`}
                    className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-sm text-neutral-500">
                        {c.niche ?? "No niche"}
                        {primary ? ` · @${primary.handle}` : ""}
                        {m.source === "manual" && m.sampleSize > 0 && (
                          <span className="text-amber-700 dark:text-amber-500">
                            {" "}· metrics entered by hand
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-neutral-500">
                      {formatCount(m.followerCount)} followers ·{" "}
                      {formatRate(m.engagementRateByFollowers)} eng ·{" "}
                      {c._count.deals} deal{c._count.deals === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
