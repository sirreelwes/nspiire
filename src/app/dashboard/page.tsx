import Link from "next/link";
import { prisma, hasDatabase } from "@/lib/prisma";
import { DEAL_FLOW, type DealState } from "@/lib/deals/stateMachine";

export const dynamic = "force-dynamic";

/** The happy path, in order. LOST and RENEWAL_WATCH hang off it. */
const PIPELINE: DealState[] = [
  "PITCHED",
  "NEGOTIATING",
  "TERMS_AGREED",
  "CONTRACT_SENT",
  "SIGNED",
  "IN_PRODUCTION",
  "DELIVERED",
  "INVOICED",
  "PAID",
];
const ASIDE: DealState[] = ["RENEWAL_WATCH", "LOST"];

const STATE_LABELS: Record<DealState, string> = {
  PITCHED: "Pitched",
  NEGOTIATING: "Negotiating",
  TERMS_AGREED: "Terms agreed",
  CONTRACT_SENT: "Contract sent",
  SIGNED: "Signed",
  IN_PRODUCTION: "In production",
  DELIVERED: "Delivered",
  INVOICED: "Invoiced",
  PAID: "Paid",
  RENEWAL_WATCH: "Renewal watch",
  LOST: "Lost",
};

/** The four approval gates from ApprovalPolicySchema. The last two are
 *  hard rules — no creator setting turns them off. */
const GATES = [
  { key: "gateFirstOutreach", label: "First outreach to a brand", locked: false },
  { key: "gateOutsideGuardrails", label: "Anything outside guardrails", locked: true },
  { key: "gateContractSend", label: "Sending a contract", locked: false },
  { key: "gateMoney", label: "Money moving", locked: true },
] as const;

type Counts = Partial<Record<DealState, number>>;

async function load() {
  if (!hasDatabase) return { ready: false as const };
  try {
    const [grouped, creatorCount, recent] = await Promise.all([
      prisma.deal.groupBy({ by: ["state"], _count: { _all: true } }),
      prisma.creator.count(),
      prisma.deal.findMany({
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: { brand: true, creator: true },
      }),
    ]);
    const counts: Counts = {};
    for (const g of grouped) counts[g.state as DealState] = g._count._all;
    return { ready: true as const, counts, creatorCount, recent };
  } catch {
    // Schema not migrated yet, or the database is unreachable. Say so rather
    // than 500 — this page is the first thing you open during setup.
    return { ready: false as const, unreachable: true };
  }
}

export default async function DashboardPage() {
  const data = await load();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Dashboard
        </h1>
        <Link
          href="/onboarding"
          className="text-sm font-medium underline underline-offset-4"
        >
          Onboard a creator
        </Link>
      </div>

      {!data.ready && (
        <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {"unreachable" in data && data.unreachable
            ? "Database unreachable, or the schema hasn't been migrated yet — run npx prisma migrate deploy."
            : "No DATABASE_URL set. Counts below are empty until Postgres is connected."}
        </p>
      )}

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
            Deal pipeline
          </h2>
          {data.ready && (
            <span className="text-sm text-neutral-500">
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
        <p className="mt-3 text-xs text-neutral-500">
          Every move between these is written through{" "}
          <code className="font-mono">transition()</code> and logged — that log
          is what the terms advisor learns from.
        </p>
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
            Approvals queue
          </h2>
          <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <p className="border-b border-neutral-200 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800">
              Nothing waiting on you. Agents park here whenever a gate trips.
            </p>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {GATES.map((g) => (
                <li
                  key={g.key}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {g.label}
                    {g.locked && (
                      <span className="ml-2 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
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
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
            Recent deals
          </h2>
          <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
            {data.ready && data.recent.length > 0 ? (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {data.recent.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <span className="truncate">
                      {d.brand.name}
                      <span className="text-neutral-500"> · {d.creator.name}</span>
                    </span>
                    <span className="shrink-0 text-neutral-500">
                      {STATE_LABELS[d.state as DealState]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-neutral-500">
                No deals yet. Scout is warming up.
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
    <li
      className={`rounded-xl border px-3 py-3 ${
        muted
          ? "border-dashed border-neutral-200 dark:border-neutral-800"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
      title={
        next.length ? `→ ${next.map((s) => STATE_LABELS[s]).join(", ")}` : "Terminal"
      }
    >
      <div className="text-2xl font-semibold tabular-nums">{count}</div>
      <div className="mt-0.5 text-xs text-neutral-500">
        {STATE_LABELS[state]}
      </div>
    </li>
  );
}
