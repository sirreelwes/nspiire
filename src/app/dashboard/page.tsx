import { requireOperator } from "@/lib/auth/operator";
import Link from "next/link";
import { arch } from "@/components/Button";
import { formatCount, formatRate, parseMetrics } from "@/lib/creators/metrics";
import { ConsoleNav } from "@/components/ConsoleNav";
import { prisma, hasDatabase } from "@/lib/prisma";
import { DEAL_FLOW, type DealState } from "@/lib/deals/stateMachine";
import { ASIDE, PIPELINE, STATE_LABELS } from "@/lib/deals/labels";

export const dynamic = "force-dynamic";

/** The four approval gates from ApprovalPolicySchema. The last two are
 *  hard rules — no creator setting turns them off. */
const GATES = [
  { key: "gateFirstOutreach", label: "First outreach to a brand", locked: false },
  { key: "gateOutsideGuardrails", label: "Anything outside guardrails", locked: true },
  { key: "gateContractSend", label: "Sending a contract", locked: false },
  { key: "gateMoney", label: "Money moving", locked: true },
] as const;

type Counts = Partial<Record<DealState, number>>;

/* Onboarding is an OPERATOR action — it adds a creator to the roster — so it
   sits with the page title rather than in ConsoleNav, which is for moving
   between pages rather than doing things. */
const ONBOARD_BUTTON = arch("primary", "md");

async function load() {
  if (!hasDatabase) return { ready: false as const };
  try {
    const [grouped, creatorCount, recent, creators] = await Promise.all([
      prisma.deal.groupBy({ by: ["state"], _count: { _all: true } }),
      prisma.creator.count(),
      prisma.deal.findMany({
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: { brand: true, creator: true },
      }),
      // Audience numbers live here now rather than on the creator's own page:
      // that page is a handshake, and a wall of stats above the shortlist made
      // it a report instead of a conversation.
      prisma.creator.findMany({
        orderBy: { name: "asc" },
        include: { socials: true },
      }),
    ]);
    const counts: Counts = {};
    for (const g of grouped) counts[g.state as DealState] = g._count._all;
    return { ready: true as const, counts, creatorCount, recent, creators };
  } catch {
    // Schema not migrated yet, or the database is unreachable. Say so rather
    // than 500 — this page is the first thing you open during setup.
    return { ready: false as const, unreachable: true };
  }
}

export default async function DashboardPage() {
  await requireOperator("/dashboard");

  const data = await load();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-16">
      <ConsoleNav current="/dashboard" />

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Dashboard
        </h1>
        {/* Invite, not onboard. The full form asks the operator to fill in
            someone else's niche, socials and rates from memory; this asks for
            an email and lets the creator do it themselves. The long form is
            still reachable from the invite page. */}
        <Link href="/creators/invite" className={ONBOARD_BUTTON}>
          Invite a creator
        </Link>
      </div>

      {!data.ready && (
        <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-base text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {"unreachable" in data && data.unreachable
            ? "Database unreachable, or the schema hasn't been migrated yet — run npx prisma migrate deploy."
            : "No DATABASE_URL set. Counts below are empty until Postgres is connected."}
        </p>
      )}

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
            Deal pipeline
          </h2>
          {data.ready && (
            <span className="text-base text-neutral-500">
              {data.creatorCount} creator{data.creatorCount === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PIPELINE.map((state) => (
            <StageCard
              key={state}
              state={state}
              count={data.ready ? (data.counts[state] ?? 0) : 0}
            />
          ))}
        </ol>

        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ASIDE.map((state) => (
            <StageCard
              key={state}
              state={state}
              count={data.ready ? (data.counts[state] ?? 0) : 0}
              muted
            />
          ))}
        </ul>
        <p className="mt-4 text-sm text-neutral-500">
          Every move between these is written through{" "}
          <code className="font-mono">transition()</code> and logged — that log
          is what the terms advisor learns from.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
          Creator audiences
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          {data.ready && data.creators.length > 0 ? (
            <table className="w-full min-w-[34rem] text-base">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-sm text-neutral-500 dark:border-neutral-800">
                  <th className="px-5 py-3 font-medium">Creator</th>
                  <th className="px-5 py-3 font-medium">Followers</th>
                  <th className="px-5 py-3 font-medium">Avg views</th>
                  <th className="px-5 py-3 font-medium">Eng / views</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">On roster</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {data.creators.map((c) => {
                  const s = c.socials[0];
                  const m = parseMetrics(s?.metrics);
                  return (
                    <tr key={c.id}>
                      <td className="px-5 py-4">
                        <Link
                          href={`/creators/${c.id}`}
                          className="font-medium underline underline-offset-4"
                        >
                          {c.name}
                        </Link>
                        {s && (
                          <span className="block text-sm text-neutral-500">
                            @{s.handle}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 tabular-nums">
                        {formatCount(s?.followerCount ?? null)}
                      </td>
                      <td className="px-5 py-4 tabular-nums">
                        {formatCount(m.avgViews)}
                      </td>
                      <td className="px-5 py-4 tabular-nums">
                        {formatRate(m.engagementRateByViews)}
                      </td>
                      <td className="px-5 py-4 text-sm text-neutral-500">
                        {/* Never let a hand-entered figure look synced. */}
                        {m.sampleSize === 0
                          ? "—"
                          : m.source === "tiktok-api"
                            ? "TikTok"
                            : "By hand"}
                      </td>
                      <td className="px-5 py-4 text-sm">
                        {/* Theirs to set, not the operator's. Shown here only
                            so it is obvious who brands can actually find. */}
                        {c.listedOnRoster ? (
                          <span className="font-medium text-[var(--logo-accent)]">
                            Listed
                          </span>
                        ) : (
                          <span className="text-neutral-500">Not listed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-4 text-base text-neutral-500">
              No creators yet.
            </p>
          )}
        </div>
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
            Approvals queue
          </h2>
          <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <p className="border-b border-neutral-200 px-5 py-4 text-base text-neutral-500 dark:border-neutral-800">
              Nothing waiting on you. Agents park here whenever a gate trips.
            </p>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {GATES.map((g) => (
                <li
                  key={g.key}
                  className="flex items-center justify-between gap-3 px-5 py-4 text-base"
                >
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {g.label}
                    {g.locked && (
                      <span className="ml-2 rounded border border-neutral-300 px-2 py-0.5 text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
                        always on
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-neutral-400">0</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
            Recent deals
          </h2>
          <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
            {data.ready && data.recent.length > 0 ? (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {data.recent.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/deals/${d.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-4 text-base"
                    >
                      <span className="truncate">
                        {d.brand.name}
                        <span className="text-neutral-500">
                          {" · "}
                          {d.creator.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-neutral-500">
                        {STATE_LABELS[d.state as DealState]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-base text-neutral-500">
                No deals yet. Scout is warming up —{" "}
                <Link href="/deals/new" className="underline underline-offset-4">
                  add one by hand
                </Link>{" "}
                in the meantime.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function StageCard({
  state,
  count,
  muted,
}: {
  state: DealState;
  count: number;
  muted?: boolean;
}) {
  const next = DEAL_FLOW[state];
  return (
    <li>
      <Link
        href={`/deals?state=${state}`}
        className={`block rounded-xl border px-4 py-5 ${
          muted
            ? "border-dashed border-neutral-200 dark:border-neutral-800"
            : "border-neutral-200 dark:border-neutral-800"
        }`}
        title={
          next.length
            ? `→ ${next.map((s) => STATE_LABELS[s]).join(", ")}`
            : "Terminal"
        }
      >
        <div className="text-3xl font-semibold tabular-nums">{count}</div>
        <div className="mt-1 text-sm text-neutral-500">
          {STATE_LABELS[state]}
        </div>
      </Link>
    </li>
  );
}
