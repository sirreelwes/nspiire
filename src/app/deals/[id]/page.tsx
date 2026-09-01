import { requireOperator } from "@/lib/auth/operator";
import { notFound } from "next/navigation";
import { prisma, hasDatabase } from "@/lib/prisma";
import { DEAL_FLOW, type DealState } from "@/lib/deals/stateMachine";
import { STATE_LABELS, actorLabel } from "@/lib/deals/labels";
import { formatDays, formatMoney, parseTerms } from "@/lib/deals/terms";
import {
  checkDealGuardrails,
  parseGuardrails,
  type GuardrailViolation,
} from "@/lib/deals/guardrails";
import { transitionDeal, updateDealTerms } from "@/app/deals/actions";
import {
  Crumb,
  ErrorBanner,
  NotConnected,
  Section,
  StateBadge,
  TermsFields,
  centsToInput,
  field,
  ghostBtn,
  hint,
  label,
  primaryBtn,
} from "@/app/deals/ui";

export const dynamic = "force-dynamic";

async function load(id: string) {
  if (!hasDatabase) return { ready: false as const };
  try {
    const deal = await prisma.deal.findUnique({
      where: { id },
      include: {
        brand: true,
        creator: true,
        transitions: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    return { ready: true as const, deal };
  } catch {
    return { ready: false as const, unreachable: true };
  }
}

export default async function DealPage(props: PageProps<"/deals/[id]">) {
  await requireOperator();

  const { id } = await props.params;
  const { error } = await props.searchParams;
  const data = await load(id);

  if (!data.ready) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-16">
        <Crumb href="/deals">← Deals</Crumb>
        <NotConnected unreachable={"unreachable" in data && data.unreachable} />
      </main>
    );
  }
  if (!data.deal) notFound();

  const deal = data.deal;
  const state = deal.state as DealState;
  const terms = parseTerms(deal.terms);
  const guardrails = parseGuardrails(deal.creator.guardrails);
  const violations = checkDealGuardrails({
    terms,
    guardrails: deal.creator.guardrails,
    brandName: deal.brand.name,
    brandCategory: deal.brand.category,
  });
  const next = DEAL_FLOW[state];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-16">
      <Crumb href="/deals">← Deals</Crumb>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {deal.brand.name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {deal.creator.name}
            {deal.creator.niche ? ` · ${deal.creator.niche}` : ""}
            {deal.brand.category ? ` · ${deal.brand.category}` : ""}
          </p>
        </div>
        <StateBadge state={state} />
      </div>

      <ErrorBanner message={typeof error === "string" ? error : undefined} />

      {violations.length > 0 && <GuardrailAlert violations={violations} />}

      <div className="mt-10 flex flex-col gap-12">
        <Section title="Move this deal">
          <MoveDeal dealId={deal.id} state={state} next={next} />
        </Section>

        <Section title="Terms">
          <form action={updateDealTerms} className="flex flex-col gap-4">
            <input type="hidden" name="dealId" value={deal.id} />
            <TermsFields
              formats={guardrails.offeredFormats}
              defaults={{
                format: terms.format,
                amount: centsToInput(terms.amountCents),
                usageDays: terms.usageDays?.toString() ?? "",
                exclusivityDays: terms.exclusivityDays?.toString() ?? "",
                deliverables: terms.deliverables,
                notes: terms.notes,
              }}
            />
            <button type="submit" className={`${primaryBtn} self-start`}>
              Save terms
            </button>
            <p className={hint}>
              Saving terms isn&apos;t a state change, so it isn&apos;t logged as
              one. The next move snapshots whatever the terms say at that moment.
            </p>
          </form>
        </Section>

        <Section title={`${deal.creator.name}'s guardrails`}>
          <GuardrailPanel guardrails={guardrails} format={terms.format} />
        </Section>

        <Section title="History">
          <Timeline
            transitions={deal.transitions}
            createdAt={deal.createdAt}
            creatorName={deal.creator.name}
            brandName={deal.brand.name}
          />
        </Section>
      </div>
    </main>
  );
}

function GuardrailAlert({ violations }: { violations: GuardrailViolation[] }) {
  return (
    <div
      role="alert"
      className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950"
    >
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        Outside guardrails
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-200">
        {violations.map((v, i) => (
          <li key={`${v.field}-${i}`}>{v.message}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
        You can still move this deal — you&apos;re the human. The Negotiator
        can&apos;t: terms outside guardrails always stop and ask.
      </p>
    </div>
  );
}

/**
 * One button per legal next state, read straight off DEAL_FLOW, plus a note
 * that goes into the log. Nothing else can move a deal.
 */
function MoveDeal({
  dealId,
  state,
  next,
}: {
  dealId: string;
  state: DealState;
  next: DealState[];
}) {
  if (next.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        {STATE_LABELS[state]} is the end of the line. Nothing moves from here.
      </p>
    );
  }
  return (
    <form action={transitionDeal} className="flex flex-col gap-4">
      <input type="hidden" name="dealId" value={dealId} />
      <div>
        <label className={label} htmlFor="note">
          Note for the log
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          className={field}
          placeholder="Why it moved — this is what the terms advisor learns from"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {next.map((to) => (
          <button
            key={to}
            type="submit"
            name="to"
            value={to}
            className={to === "LOST" ? ghostBtn : primaryBtn}
          >
            {to === "LOST" ? "Mark lost" : `→ ${STATE_LABELS[to]}`}
          </button>
        ))}
      </div>
    </form>
  );
}

function GuardrailPanel({
  guardrails,
  format,
}: {
  guardrails: ReturnType<typeof parseGuardrails>;
  format: string;
}) {
  const floorEntry = Object.entries(guardrails.floorRatesCents).find(
    ([k]) => k.trim().toLowerCase() === format.trim().toLowerCase(),
  );
  return (
    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
      <Stat
        term={floorEntry ? `Floor · ${floorEntry[0]}` : "Floor"}
        value={floorEntry ? formatMoney(floorEntry[1]) : "No matching format"}
      />
      <Stat term="Max usage" value={formatDays(guardrails.maxUsageDays)} />
      <Stat
        term="Max exclusivity"
        value={formatDays(guardrails.maxExclusivityDays)}
      />
      <Stat
        term="Won't work with"
        value={
          guardrails.doNotWorkWith.length
            ? guardrails.doNotWorkWith.join(", ")
            : "—"
        }
      />
    </dl>
  );
}

function Stat({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-400">
        {term}
      </dt>
      <dd className="mt-1 break-words text-neutral-700 dark:text-neutral-300">
        {value}
      </dd>
    </div>
  );
}

type TransitionRow = {
  id: string;
  fromState: string;
  toState: string;
  actor: string;
  note: string | null;
  termsSnapshot: unknown;
  createdAt: Date;
};

function Timeline({
  transitions,
  createdAt,
  creatorName,
  brandName,
}: {
  transitions: TransitionRow[];
  createdAt: Date;
  creatorName: string;
  brandName: string;
}) {
  return (
    <ol className="flex flex-col gap-4">
      {transitions.map((t) => {
        const snapshot = parseTerms(t.termsSnapshot);
        return (
          <li
            key={t.id}
            className="rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium">
                {STATE_LABELS[t.fromState as DealState]} →{" "}
                {STATE_LABELS[t.toState as DealState]}
              </span>
              <When at={t.createdAt} />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {actorLabel(t.actor)}
              {" · terms at the time: "}
              {snapshot.format || "no format"} ·{" "}
              {formatMoney(snapshot.amountCents, snapshot.currency)} · usage{" "}
              {formatDays(snapshot.usageDays).toLowerCase()} · exclusivity{" "}
              {formatDays(snapshot.exclusivityDays).toLowerCase()}
            </p>
            {t.note && (
              <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                {t.note}
              </p>
            )}
          </li>
        );
      })}
      <li className="rounded-xl border border-dashed border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">Deal created — Pitched</span>
          <When at={createdAt} />
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          {creatorName} → {brandName}. Creating a deal isn&apos;t a state change,
          so there&apos;s no log row for it.
        </p>
      </li>
    </ol>
  );
}

/** Rendered on the server only, so pin it to UTC and say so. */
function When({ at }: { at: Date }) {
  const iso = at.toISOString();
  const shown = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(at);
  return (
    <time dateTime={iso} className="text-xs tabular-nums text-neutral-400">
      {shown} UTC
    </time>
  );
}
