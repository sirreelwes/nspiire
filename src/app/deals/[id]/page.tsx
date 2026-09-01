import { requireOperator } from "@/lib/auth/operator";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, hasDatabase } from "@/lib/prisma";
import { DEAL_FLOW, type DealState } from "@/lib/deals/stateMachine";
import { STATE_LABELS, actorLabel } from "@/lib/deals/labels";
import { formatDays, formatMoney, parseTerms } from "@/lib/deals/terms";
import { quoteDealFee, type FeeQuote } from "@/lib/deals/fee";
import { checkDealPolicy, type PolicyNote } from "@/lib/deals/policy";
import {
  addressReleased,
  describeDestination,
  formatDestination,
  parseGiftingPolicy,
  resolveDestination,
  type Destination,
  type GiftingPolicy,
} from "@/lib/creators/shipping";
import {
  checkDealGuardrails,
  parseGuardrails,
  type GuardrailViolation,
} from "@/lib/deals/guardrails";
import {
  setDealShipTo,
  transitionDeal,
  updateDealTerms,
} from "@/app/deals/actions";
import { AgentPanel } from "@/app/deals/agent-ui";
import { resolvePersona } from "@/lib/agents/persona";
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
        creator: {
          include: {
            shippingDestinations: { orderBy: { createdAt: "asc" } },
            persona: true,
          },
        },
        persona: true,
        // Both threads in one read, split by audience below. They must never be
        // rendered into each other: the creator's thread discusses floor rates.
        interactions: { orderBy: { createdAt: "asc" }, take: 80 },
        transitions: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!deal) {
      return { ready: true as const, deal: null, priorPaidDeals: 0, roster: [] };
    }
    const roster = await prisma.persona.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });
    // What this brand has already paid for on Nspiire — the repeat-brand
    // discount is priced off it. This deal is excluded: it can't be its own
    // precedent, and it isn't PAID yet anyway.
    const priorPaidDeals = await prisma.deal.count({
      where: { brandId: deal.brandId, state: "PAID", id: { not: deal.id } },
    });
    return { ready: true as const, deal, priorPaidDeals, roster };
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
  const gifting = parseGiftingPolicy(deal.creator.giftingPolicy);
  const destinations = deal.creator.shippingDestinations;
  const shipTo = resolveDestination(destinations, deal.shipToId);
  const persona = resolvePersona(deal.persona, deal.creator.persona, data.roster);
  const creatorThread = deal.interactions.filter((i) => i.audience === "creator");
  const brandThread = deal.interactions.filter((i) => i.audience === "brand");
  const policyNotes = checkDealPolicy(terms);
  const fee = quoteDealFee({ terms, priorPaidDeals: data.priorPaidDeals });
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
      {policyNotes.length > 0 && <PolicyNotes notes={policyNotes} />}

      <div className="mt-10 flex flex-col gap-12">
        <Section title="Move this deal">
          <MoveDeal dealId={deal.id} state={state} next={next} />
        </Section>

        <Section title="Your agent">
          <AgentPanel
            dealId={deal.id}
            persona={persona}
            roster={data.roster}
            assignedOnDeal={deal.personaId != null}
            creatorName={deal.creator.name}
            brandName={deal.brand.name}
            creatorThread={creatorThread}
            brandThread={brandThread}
          />
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

        <Section title="Where product goes">
          <ShipTo
            dealId={deal.id}
            state={state}
            policy={gifting}
            destination={shipTo}
            destinations={destinations}
            selectedId={deal.shipToId}
            creatorName={deal.creator.name}
            creatorId={deal.creatorId}
          />
        </Section>

        <Section title="Nspiire fee">
          <FeePanel fee={fee} brandName={deal.brand.name} />
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
 * Where this deal's product is sent, and whether the brand may know yet.
 *
 * The gate is `addressReleased()`: before the state the creator chose, this
 * shows that a destination exists and roughly where, never the lines a courier
 * could deliver to. That is not decoration — an address handed over early
 * cannot be handed back, and the request that leaks it ("where do we send the
 * box?") is an entirely ordinary one that arrives long before anyone signs.
 */
function ShipTo({
  dealId,
  state,
  policy,
  destination,
  destinations,
  selectedId,
  creatorName,
  creatorId,
}: {
  dealId: string;
  state: DealState;
  policy: GiftingPolicy;
  destination: Destination | null;
  destinations: Destination[];
  selectedId: string | null;
  creatorName: string;
  creatorId: string;
}) {
  if (!policy.acceptsProduct) {
    return (
      <p className="text-sm text-neutral-500">
        {creatorName} doesn&apos;t take physical product. There is no address to
        give this brand, whatever stage the deal reaches.
      </p>
    );
  }

  if (!destination) {
    return (
      <p className="text-sm text-neutral-500">
        No destination on file for {creatorName}.{" "}
        <Link
          href={`/creators/${creatorId}`}
          className="underline underline-offset-4"
        >
          Add one
        </Link>{" "}
        before anything is meant to ship.
      </p>
    );
  }

  const released = addressReleased(state, policy);
  const choosable = destinations.filter(
    (d) => d.archivedAt == null || d.id === selectedId,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-neutral-200 px-4 py-4 dark:border-neutral-800">
        {released ? (
          <>
            <address className="text-sm not-italic text-neutral-700 dark:text-neutral-300">
              {formatDestination(destination).map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            {destination.instructions && (
              <p className="mt-2 text-xs text-neutral-500">
                {destination.instructions}
              </p>
            )}
            <p className="mt-3 text-xs text-neutral-500">
              Released — this deal has reached{" "}
              {STATE_LABELS[policy.releaseAddressAt].toLowerCase()}.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              {describeDestination(destination)}
            </p>
            <p className="mt-3 text-xs text-neutral-500">
              The full address stays hidden until{" "}
              {STATE_LABELS[policy.releaseAddressAt].toLowerCase()} — this deal
              is at {STATE_LABELS[state].toLowerCase()}. {creatorName} set that,
              and it isn&apos;t yours to work around.
            </p>
          </>
        )}
      </div>

      {policy.requiresApprovalBeforeSending && (
        <p className="text-xs text-neutral-500">
          {creatorName} wants to be asked before anything is posted, including
          samples nobody billed for.
        </p>
      )}
      {policy.notes && (
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          {policy.notes}
        </p>
      )}

      {choosable.length > 1 && (
        <form action={setDealShipTo} className="flex flex-col gap-2">
          <input type="hidden" name="dealId" value={dealId} />
          <label className={label} htmlFor="shipToId">
            Send this deal somewhere else
          </label>
          <select
            id="shipToId"
            name="shipToId"
            className={field}
            defaultValue={selectedId ?? ""}
          >
            <option value="">Their default</option>
            {choosable.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
                {d.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </select>
          <button type="submit" className={`${ghostBtn} self-start`}>
            Save destination
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * House policy notes — deliberately quieter than GuardrailAlert. A guardrail is
 * a promise to the creator and stops an agent dead; this is Nspiire's own view
 * of which deals are worth doing, and it only ever tells you something.
 */
function PolicyNotes({ notes }: { notes: PolicyNote[] }) {
  return (
    <ul className="mt-6 flex flex-col gap-2 rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      {notes.map((n, i) => (
        <li key={`${n.field}-${i}`} className="text-sm text-neutral-500">
          {n.message}
        </li>
      ))}
    </ul>
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

/**
 * What the brand owes Nspiire on this deal, and the arithmetic behind it.
 *
 * Every line is shown, including the ones that reduce the fee, because a brand
 * that asks "why $250?" gets read this panel. The creator's number is shown
 * next to it on purpose: the fee is charged on top of the rate and never taken
 * out of it, and the panel should make that impossible to misread.
 */
function FeePanel({ fee, brandName }: { fee: FeeQuote; brandName: string }) {
  if (fee.basis !== "computed") {
    return <p className="text-sm text-neutral-500">{fee.reasoning[0]}</p>;
  }
  const rate = ((fee.effectiveRate ?? 0) * 100).toFixed(1);
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3">
        <span className="text-sm font-medium">{brandName} pays Nspiire</span>
        <span className="text-2xl font-semibold tabular-nums">
          {formatMoney(fee.feeCents, fee.currency)}
        </span>
      </div>

      <ul className="divide-y divide-neutral-200 border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {fee.lines.map((line, i) => (
          <li
            key={`${line.label}-${i}`}
            className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm"
          >
            <span className="text-neutral-600 dark:text-neutral-400">
              {line.label}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatMoney(line.amountCents, fee.currency)}
            </span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm font-medium">
          <span>Fee</span>
          <span className="shrink-0 tabular-nums">
            {formatMoney(fee.feeCents, fee.currency)} · {rate}% of the deal
          </span>
        </li>
      </ul>

      <dl className="grid grid-cols-2 gap-4 border-t border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
        <Stat
          term="Brand's total cheque"
          value={formatMoney(fee.brandTotalCents, fee.currency)}
        />
        <Stat
          term="Creator is paid"
          value={formatMoney(fee.creatorCents, fee.currency)}
        />
      </dl>

      <div className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
        {fee.reasoning.map((sentence, i) => (
          <p key={i} className="text-xs text-neutral-500">
            {sentence}
          </p>
        ))}
      </div>
    </div>
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
