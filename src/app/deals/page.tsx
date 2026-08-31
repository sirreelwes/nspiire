import Link from "next/link";
import { prisma, hasDatabase } from "@/lib/prisma";
import type { DealState } from "@/lib/deals/stateMachine";
import { ALL_STATES, STATE_LABELS, isDealState } from "@/lib/deals/labels";
import { formatMoney, parseTerms } from "@/lib/deals/terms";
import { checkDealGuardrails } from "@/lib/deals/guardrails";
import {
  Crumb,
  ErrorBanner,
  NotConnected,
  StateBadge,
  primaryBtn,
} from "@/app/deals/ui";

export const dynamic = "force-dynamic";

async function load(state: DealState | undefined) {
  if (!hasDatabase) return { ready: false as const };
  try {
    const [deals, counts] = await Promise.all([
      prisma.deal.findMany({
        where: state ? { state } : undefined,
        orderBy: { updatedAt: "desc" },
        include: { brand: true, creator: true },
        take: 200,
      }),
      prisma.deal.groupBy({ by: ["state"], _count: { _all: true } }),
    ]);
    const byState: Partial<Record<DealState, number>> = {};
    for (const c of counts) byState[c.state as DealState] = c._count._all;
    return { ready: true as const, deals, byState };
  } catch {
    return { ready: false as const, unreachable: true };
  }
}

export default async function DealsPage(props: PageProps<"/deals">) {
  const { state: rawState, error } = await props.searchParams;
  const stateParam = typeof rawState === "string" ? rawState : undefined;
  const state = isDealState(stateParam) ? stateParam : undefined;
  const data = await load(state);
  const total = data.ready
    ? Object.values(data.byState).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-16">
      <Crumb href="/dashboard">← Dashboard</Crumb>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Deals
        </h1>
        <Link href="/deals/new" className={primaryBtn}>
          New deal
        </Link>
      </div>

      <ErrorBanner message={typeof error === "string" ? error : undefined} />
      {!data.ready && (
        <NotConnected unreachable={"unreachable" in data && data.unreachable} />
      )}

      {data.ready && (
        <>
          <nav className="mt-8 flex flex-wrap gap-2">
            <FilterChip href="/deals" active={!state} label="All" count={total} />
            {ALL_STATES.map((s) => (
              <FilterChip
                key={s}
                href={`/deals?state=${s}`}
                active={state === s}
                label={STATE_LABELS[s]}
                count={data.byState[s] ?? 0}
              />
            ))}
          </nav>

          <div className="mt-6 rounded-xl border border-neutral-200 dark:border-neutral-800">
            {data.deals.length === 0 ? (
              <p className="px-4 py-6 text-sm text-neutral-500">
                {state
                  ? `Nothing in ${STATE_LABELS[state].toLowerCase()} right now.`
                  : "No deals yet. Create one to start exercising the pipeline."}
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {data.deals.map((deal) => {
                  const terms = parseTerms(deal.terms);
                  const violations = checkDealGuardrails({
                    terms,
                    guardrails: deal.creator.guardrails,
                    brandName: deal.brand.name,
                    brandCategory: deal.brand.category,
                  });
                  return (
                    <li key={deal.id}>
                      <Link
                        href={`/deals/${deal.id}`}
                        className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {deal.brand.name}
                          </span>
                          <span className="block truncate text-sm text-neutral-500">
                            {deal.creator.name}
                            {terms.format ? ` · ${terms.format}` : ""}
                            {violations.length > 0 && (
                              <span className="text-amber-700 dark:text-amber-500">
                                {" "}
                                · {violations.length} outside guardrails
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="tabular-nums text-sm text-neutral-500">
                            {formatMoney(terms.amountCents, terms.currency)}
                          </span>
                          <StateBadge state={deal.state as DealState} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1 text-sm ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
      }`}
    >
      {label}{" "}
      <span className={active ? "opacity-70" : "text-neutral-400"}>{count}</span>
    </Link>
  );
}
