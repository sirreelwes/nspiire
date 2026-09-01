import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { prisma } from "@/lib/prisma";
import { requireCreator } from "@/lib/auth/creator";
import { parseMetrics, formatCount, formatRate } from "@/lib/creators/metrics";
import { parseTerms, formatMoney } from "@/lib/deals/terms";
import { STATE_LABELS } from "@/lib/deals/labels";
import type { DealState } from "@/lib/deals/stateMachine";
import {
  creatorApproveOutreach,
  creatorDeclineOutreach,
  creatorSignOut,
} from "./actions";
import { arch } from "@/components/Button";

export const dynamic = "force-dynamic";

/**
 * A creator's own view.
 *
 * Every query here scopes on the id from requireCreator() — never on a route
 * param or a form field, which is how one creator ends up reading another's
 * deals. This is a separate page tree from the operator console for the same
 * reason: there is no shared page where a missing `where` clause leaks a
 * roster.
 */
export default async function CreatorHomePage() {
  const creator = await requireCreator();

  const [socials, deals, opportunities] = await Promise.all([
    prisma.socialAccount.findMany({ where: { creatorId: creator.id } }),
    prisma.deal.findMany({
      where: { creatorId: creator.id },
      include: { brand: true },
      orderBy: { updatedAt: "desc" },
    }),
    // SOURCED = waiting on the creator. QUALIFIED = they said yes and it is
    // now with their manager. Both are shown, so approving something does not
    // make it vanish with no trace of what they decided.
    prisma.opportunity.findMany({
      where: { creatorId: creator.id, status: { in: ["SOURCED", "QUALIFIED"] } },
      include: { brand: true },
      orderBy: [{ status: "asc" }, { fitScore: "desc" }],
    }),
  ]);

  const primary = socials[0];
  const metrics = parseMetrics(primary?.metrics);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-16">
      <header className="mb-10 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link href="/" aria-label="Nspiire home page" className="shrink-0">
          <LogoMark size={34} />
        </Link>
        <form action={creatorSignOut} className="ml-auto">
          <button
            type="submit"
            className="text-base text-neutral-500 underline underline-offset-4"
          >
            Sign out
          </button>
        </form>
      </header>

      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {creator.name}
      </h1>
      {primary && (
        <p className="mt-2 text-lg text-neutral-500">
          @{primary.handle} · {formatCount(primary.followerCount)} followers
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
          Your numbers
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Avg views" value={formatCount(metrics.avgViews)} />
          <Stat label="Avg likes" value={formatCount(metrics.avgLikes)} />
          <Stat
            label="Engagement / views"
            value={formatRate(metrics.engagementRateByViews)}
          />
          <Stat label="Posts sampled" value={String(metrics.sampleSize)} />
        </dl>
        <p className="mt-4 text-sm text-neutral-500">
          {metrics.source === "tiktok-api"
            ? "Synced from TikTok."
            : "Entered by hand — not synced from TikTok yet."}
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
          Your deals
        </h2>
        <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
          {deals.length === 0 ? (
            <p className="px-5 py-4 text-base text-neutral-500">
              Nothing yet. Your agent is looking for brand partners.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {deals.map((d) => {
                const terms = parseTerms(d.terms);
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 px-5 py-4 text-base"
                  >
                    <span className="min-w-0 truncate">
                      {d.brand.name}
                      {terms.amountCents != null && (
                        <span className="text-neutral-500">
                          {" · "}
                          {formatMoney(terms.amountCents, terms.currency)}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-neutral-500">
                      {STATE_LABELS[d.state as DealState]}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
          Waiting on you
        </h2>
        <p className="mt-2 text-base text-neutral-500">
          Your agent found these. Nobody is contacted until you say yes.
        </p>

        <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
          {opportunities.length === 0 ? (
            <p className="px-5 py-4 text-base text-neutral-500">
              Nothing to review right now.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {opportunities.map((o) => (
                <li key={o.id} className="px-5 py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-lg font-medium">{o.brand.name}</span>
                    <span className="shrink-0 text-sm text-neutral-500">
                      {Math.round(o.fitScore * 100)}% fit
                      {o.suggestedFormat ? ` · ${o.suggestedFormat}` : ""}
                    </span>
                  </div>

                  {o.rationale && (
                    <p className="mt-2 text-base leading-snug text-neutral-600 dark:text-neutral-300">
                      {o.rationale}
                    </p>
                  )}
                  {o.evidence && (
                    <p className="mt-2 text-sm leading-snug text-neutral-500">
                      <span className="font-medium">Why them: </span>
                      {o.evidence}
                    </p>
                  )}

                  {o.status === "QUALIFIED" ? (
                    <p className="mt-4 text-base font-medium text-[var(--logo-accent)]">
                      You approved this — your manager is taking it from here.
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <form action={creatorApproveOutreach}>
                        <input type="hidden" name="opportunityId" value={o.id} />
                        <button type="submit" className={arch("primary", "md")}>
                          Approve outreach
                        </button>
                      </form>
                      <form action={creatorDeclineOutreach}>
                        <input type="hidden" name="opportunityId" value={o.id} />
                        <button type="submit" className={arch("secondary", "md")}>
                          Not interested
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
