import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { arch } from "@/components/Button";
import { prisma } from "@/lib/prisma";
import { requireActiveBrand } from "@/lib/auth/brand";
import { formatCount, formatRate, parseMetrics } from "@/lib/creators/metrics";
import { brandExpressInterest, brandSignOut } from "../actions";

export const dynamic = "force-dynamic";

/**
 * The roster — what the $100 a month buys.
 *
 * What a brand does NOT see here, on purpose: rate cards and floor rates. That
 * is the creator's negotiating position, and handing it to the counterparty
 * before a conversation starts would gut Iris's leverage on their behalf. A
 * brand sees who the creator is and how their audience performs; the price is
 * something Iris quotes.
 *
 * Nor does it show contact details. Interest is one-way until the creator
 * accepts, which is the same consent rule that governs outreach in the other
 * direction.
 */
export default async function RosterPage() {
  const account = await requireActiveBrand();

  const [creators, interests] = await Promise.all([
    prisma.creator.findMany({
      // Consent first, completeness second. listedOnRoster is the creator
      // saying brands may find them; the rest is that a half-set-up account is
      // not a pitch and listing one wastes everybody's time.
      where: {
        listedOnRoster: true,
        niche: { not: null },
        socials: { some: {} },
      },
      include: { socials: true },
      orderBy: { name: "asc" },
    }),
    prisma.brandInterest.findMany({ where: { brandAccountId: account.id } }),
  ]);
  const byCreator = new Map(interests.map((i) => [i.creatorId, i]));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-14">
      <header className="mb-10 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link href="/" aria-label="Nspiire home page" className="shrink-0">
          <LogoMark size={34} />
        </Link>
        <Link href="/brand" className="text-base underline underline-offset-4">
          {account.companyName}
        </Link>
        <form action={brandSignOut} className="ml-auto">
          <button type="submit" className="text-base text-neutral-500 underline underline-offset-4">
            Sign out
          </button>
        </form>
      </header>

      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        The roster
      </h1>
      <p className="mt-3 text-base leading-snug text-neutral-500">
        Tell me who interests you and I&apos;ll pass it on. They decide whether
        to open a conversation — nothing reaches them until they say yes.
      </p>

      <ul className="mt-8 flex flex-col gap-4">
        {creators.length === 0 && (
          <li className="rounded-xl border border-neutral-200 px-5 py-4 text-base text-neutral-500 dark:border-neutral-800">
            Nobody on the roster yet.
          </li>
        )}
        {creators.map((c) => {
          const s = c.socials[0];
          const m = parseMetrics(s?.metrics);
          const interest = byCreator.get(c.id);
          return (
            <li
              key={c.id}
              className="rounded-xl border border-neutral-200 px-5 py-5 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-lg font-medium">{c.name}</span>
                {s && (
                  <span className="text-sm text-neutral-500">
                    @{s.handle} · {formatCount(s.followerCount)} followers
                  </span>
                )}
              </div>
              {c.niche && (
                <p className="mt-2 text-base leading-snug text-neutral-600 dark:text-neutral-300">
                  {c.niche}
                </p>
              )}

              <dl className="mt-3 grid grid-cols-3 gap-3 text-base">
                <div>
                  <dt className="text-sm text-neutral-500">Avg views</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">
                    {formatCount(m.avgViews)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-neutral-500">Eng / views</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">
                    {formatRate(m.engagementRateByViews)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-neutral-500">Posts sampled</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">
                    {m.sampleSize || "—"}
                  </dd>
                </div>
              </dl>

              {interest?.status === "ACCEPTED" ? (
                <p className="mt-4 text-base font-medium text-[var(--logo-accent)]">
                  {c.name.split(" ")[0]} accepted — I&apos;ll open a
                  conversation.
                </p>
              ) : interest?.status === "DECLINED" ? (
                <p className="mt-4 text-base text-neutral-500">
                  Not a fit right now.
                </p>
              ) : interest ? (
                <p className="mt-4 text-base text-neutral-500">
                  Interest passed on — waiting on {c.name.split(" ")[0]}.
                </p>
              ) : (
                <form action={brandExpressInterest} className="mt-4 flex flex-col gap-3">
                  <input type="hidden" name="creatorId" value={c.id} />
                  <input
                    name="note"
                    placeholder="What have you got in mind? (optional)"
                    className="rounded-xl border border-neutral-300 px-4 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <button type="submit" className={arch("primary", "md", "self-start")}>
                    I&apos;m interested
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
