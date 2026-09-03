import { requireOperator } from "@/lib/auth/operator";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { arch } from "@/components/Button";
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

/* The header actions are real buttons, not underlined text: this is a phone
   surface first, and a 14px link is not a thumb target. Same shape as the
   home page's pair so the two pages feel like one product.

   Note these are OPERATOR actions — "Creators" lists the whole roster and
   "Onboard a creator" adds one. This page is the agency console, not a
   creator's own view of their deals. */
const NAV_BUTTON = arch("secondary", "md");
const NAV_BUTTON_PRIMARY = arch("primary", "md");

async function load() {
  if (!hasDatabase) return { ready: false as const };
  try {
    const [grouped, creatorCount, recent, inquiries] = await Promise.all([
      prisma.deal.groupBy({ by: ["state"], _count: { _all: true } }),
      prisma.creator.count(),
      prisma.deal.findMany({
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: { brand: true, creator: true },
      }),
      // Unread inbound. Surfaced first on this page because it is the only
      // queue where the clock started on someone else's side.
      prisma.inquiry.findMany({
        where: { status: "NEW" },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, company: true },
        take: 25,
      }),
    ]);
    const counts: Counts = {};
    for (const g of grouped) counts[g.state as DealState] = g._count._all;
    return { ready: true as const, counts, creatorCount, recent, inquiries };
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
      <Link href="/" aria-label="Nspiire home" className="inline-block">
        <LogoMark size={34} />
      </Link>

      <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Dashboard
        </h1>
        <nav className="flex flex-wrap gap-3">
          <Link href="/creators" className={NAV_BUTTON}>
            Creators
          </Link>
          <Link href="/inbox" className={NAV_BUTTON}>
            Inbox
          </Link>
          <Link href="/deals" className={NAV_BUTTON}>
            All deals
          </Link>
          <Link href="/onboarding" className={NAV_BUTTON_PRIMARY}>
            Onboard a creator
          </Link>
        </nav>
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

      {data.ready && data.inquiries.length > 0 && (
        <section className="mt-12">
          <Link
            href="/inbox"
            className="flex flex-wrap items-baseline justify-between gap-3 rounded-xl border border-neutral-200 px-5 py-5 dark:border-neutral-800"
          >
            <span className="text-base">
              <span className="text-3xl font-semibold tabular-nums">
                {data.inquiries.length}
              </span>
              <span className="ml-3 text-neutral-500">
                unread{" "}
                {data.inquiries.length === 1 ? "inquiry" : "inquiries"} from the
                site
              </span>
            </span>
            <span className="text-base text-neutral-500">
              {data.inquiries
                .slice(0, 3)
                .map((i) => i.company || i.name)
                .join(", ")}
              {data.inquiries.length > 3 ? "…" : ""} →
            </span>
          </Link>
        </section>
      )}

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
