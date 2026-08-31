import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, hasDatabase } from "@/lib/prisma";
import { parseGuardrails } from "@/lib/deals/guardrails";
import { parseMetrics, formatCount, formatRate } from "@/lib/creators/metrics";
import { formatMoney } from "@/lib/deals/terms";
import {
  Crumb,
  ErrorBanner,
  NotConnected,
  Section,
  field,
  ghostBtn,
  hint,
  label,
  primaryBtn,
} from "@/app/deals/ui";
import {
  approveOpportunity,
  findBrandPartners,
  rejectOpportunity,
  saveManualMetrics,
} from "@/app/creators/actions";

export const dynamic = "force-dynamic";

export default async function CreatorPage(props: PageProps<"/creators/[id]">) {
  const { id } = await props.params;
  const { error, connected } = await props.searchParams;

  if (!hasDatabase) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <NotConnected />
      </main>
    );
  }

  const creator = await prisma.creator.findUnique({
    where: { id },
    include: {
      socials: true,
      opportunities: {
        include: { brand: true, deal: { select: { id: true } } },
        orderBy: { fitScore: "desc" },
      },
    },
  });
  if (!creator) notFound();

  const guardrails = parseGuardrails(creator.guardrails);
  const primary = creator.socials[0];
  // Onboarding writes followerCount to its own column and leaves metrics empty,
  // so fall back to the column rather than showing a dash for a number we have.
  const stored = parseMetrics(primary?.metrics);
  const metrics = {
    ...stored,
    followerCount: stored.followerCount ?? primary?.followerCount ?? null,
  };
  const shortlist = creator.opportunities.filter((o) => o.status === "SOURCED");
  const decided = creator.opportunities.filter((o) => o.status !== "SOURCED");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:py-14">
      <Crumb href="/dashboard">← Dashboard</Crumb>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {creator.name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {creator.niche ?? "No niche set"}
            {primary ? ` · @${primary.handle} on ${primary.platform.toLowerCase()}` : ""}
          </p>
        </div>
      </div>

      <ErrorBanner message={typeof error === "string" ? error : undefined} />
      {connected === "tiktok" && (
        <p className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          TikTok connected — metrics synced.
        </p>
      )}

      <div className="mt-10 flex flex-col gap-12">
        <Section title="Audience">
          {primary ? (
            <>
              <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                <Stat term="Followers" value={formatCount(metrics.followerCount)} />
                <Stat term="Avg views" value={formatCount(metrics.avgViews)} />
                <Stat
                  term="Engagement / followers"
                  value={formatRate(metrics.engagementRateByFollowers)}
                />
                <Stat
                  term="Engagement / views"
                  value={formatRate(metrics.engagementRateByViews)}
                />
              </dl>
              <p className={`${hint} mt-4`}>
                {metrics.sampleSize > 0
                  ? `Averaged over ${metrics.sampleSize} recent post${metrics.sampleSize === 1 ? "" : "s"}. `
                  : "No posts sampled yet. "}
                {metrics.source === "tiktok-api" ? (
                  <>Synced from TikTok{primary.lastSyncedAt ? ` on ${primary.lastSyncedAt.toISOString().slice(0, 10)}` : ""}.</>
                ) : (
                  <strong className="font-medium text-amber-700 dark:text-amber-500">
                    Entered by hand — not synced. Connect TikTok to replace these with
                    real numbers.
                  </strong>
                )}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/api/tiktok/connect?creatorId=${creator.id}`}
                  className={primaryBtn}
                >
                  {metrics.source === "tiktok-api" ? "Reconnect TikTok" : "Connect TikTok"}
                </Link>
              </div>

              <details className="mt-8">
                <summary className="cursor-pointer text-sm text-neutral-500">
                  Enter metrics by hand
                </summary>
                <form action={saveManualMetrics} className="mt-4 flex flex-col gap-4">
                  <input type="hidden" name="creatorId" value={creator.id} />
                  <input type="hidden" name="accountId" value={primary.id} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field name="followerCount" label="Followers" defaultValue={metrics.followerCount} />
                    <Field name="avgViews" label="Avg views / post" defaultValue={metrics.avgViews} />
                    <Field name="sampleSize" label="Posts averaged" defaultValue={metrics.sampleSize} />
                    <Field name="avgLikes" label="Avg likes" defaultValue={metrics.avgLikes} />
                    <Field name="avgComments" label="Avg comments" defaultValue={metrics.avgComments} />
                    <Field name="avgShares" label="Avg shares" defaultValue={metrics.avgShares} />
                  </div>
                  <p className={hint}>
                    From her own TikTok analytics. Engagement rates are computed from
                    these, not entered.
                  </p>
                  <button type="submit" className={`${ghostBtn} self-start`}>
                    Save metrics
                  </button>
                </form>
              </details>
            </>
          ) : (
            <p className="text-sm text-neutral-500">
              No social accounts on file for this creator.
            </p>
          )}
        </Section>

        <Section title="Brand partners">
          <form action={findBrandPartners}>
            <input type="hidden" name="creatorId" value={creator.id} />
            <button type="submit" className={primaryBtn}>
              {creator.opportunities.length ? "Find more brands" : "Find brand partners"}
            </button>
            <p className={`${hint} mt-2`}>
              Scout scores fit against her niche, size and engagement. Nothing reaches a
              brand from here — the shortlist is yours to approve.
            </p>
          </form>

          {shortlist.length > 0 && (
            <ul className="mt-6 flex flex-col gap-3">
              {shortlist.map((o) => (
                <li
                  key={o.id}
                  className="rounded-xl border border-neutral-200 px-4 py-4 dark:border-neutral-800"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {o.brand.name}
                      {o.brand.category && (
                        <span className="text-neutral-500"> · {o.brand.category}</span>
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-neutral-500">
                      fit {(o.fitScore * 100).toFixed(0)}%
                      {o.suggestedFormat ? ` · ${o.suggestedFormat}` : ""}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                    {o.rationale}
                  </p>
                  {o.evidence && (
                    <p className="mt-2 text-xs text-neutral-500">
                      <span className="uppercase tracking-wide">Evidence · </span>
                      {o.evidence}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={approveOpportunity}>
                      <input type="hidden" name="creatorId" value={creator.id} />
                      <input type="hidden" name="opportunityId" value={o.id} />
                      <button type="submit" className={primaryBtn}>
                        Approve &amp; price it
                      </button>
                    </form>
                    <form action={rejectOpportunity}>
                      <input type="hidden" name="creatorId" value={creator.id} />
                      <input type="hidden" name="opportunityId" value={o.id} />
                      <button type="submit" className={ghostBtn}>
                        Not for me
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {decided.length > 0 && (
            <ul className="mt-6 divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {decided.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="truncate">{o.brand.name}</span>
                  <span className="shrink-0 text-neutral-500">
                    {o.deal ? (
                      <Link href={`/deals/${o.deal.id}`} className="underline underline-offset-4">
                        Deal open
                      </Link>
                    ) : (
                      o.status.toLowerCase()
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Guardrails">
          <dl className="grid grid-cols-2 gap-5 text-sm sm:grid-cols-4">
            <Stat term="Max usage" value={`${guardrails.maxUsageDays} days`} />
            <Stat term="Max exclusivity" value={`${guardrails.maxExclusivityDays} days`} />
            <Stat
              term="Formats"
              value={guardrails.offeredFormats.join(", ") || "—"}
            />
            <Stat
              term="Won't work with"
              value={guardrails.doNotWorkWith.join(", ") || "—"}
            />
          </dl>
          <p className={`${hint} mt-4`}>
            Floor rates:{" "}
            {Object.entries(guardrails.floorRatesCents)
              .map(([f, c]) => `${f} ${formatMoney(c)}`)
              .join(" · ") || "none set"}
          </p>
        </Section>
      </div>
    </main>
  );
}

function Stat({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-400">{term}</dt>
      <dd className="mt-1 break-words text-neutral-700 dark:text-neutral-300">{value}</dd>
    </div>
  );
}

function Field({
  name,
  label: labelText,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number | null;
}) {
  return (
    <div>
      <label className={label} htmlFor={name}>
        {labelText}
      </label>
      <input
        id={name}
        name={name}
        className={field}
        inputMode="numeric"
        defaultValue={defaultValue ?? ""}
      />
    </div>
  );
}
