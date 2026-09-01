import { requireOperator } from "@/lib/auth/operator";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, hasDatabase } from "@/lib/prisma";
import { parseGuardrails } from "@/lib/deals/guardrails";
import { parseMetrics, formatCount, formatRate } from "@/lib/creators/metrics";
import {
  ADDRESS_RELEASE_STATES,
  formatDestination,
  parseGiftingPolicy,
  type Destination,
  type GiftingPolicy,
} from "@/lib/creators/shipping";
import { STATE_LABELS } from "@/lib/deals/labels";
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
  archiveShippingDestination,
  findBrandPartners,
  rejectOpportunity,
  saveGiftingPolicy,
  saveManualMetrics,
  saveShippingDestination,
  setCreatorPersona,
  setDefaultDestination,
} from "@/app/creators/actions";

export const dynamic = "force-dynamic";

export default async function CreatorPage(props: PageProps<"/creators/[id]">) {
  await requireOperator();

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
      persona: true,
      shippingDestinations: { orderBy: { createdAt: "asc" } },
      opportunities: {
        include: { brand: true, deal: { select: { id: true } } },
        orderBy: { fitScore: "desc" },
      },
    },
  });
  if (!creator) notFound();

  const roster = await prisma.persona.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const guardrails = parseGuardrails(creator.guardrails);
  const gifting = parseGiftingPolicy(creator.giftingPolicy);
  const destinations = creator.shippingDestinations;
  const activeDestinations = destinations.filter((d) => d.archivedAt == null);
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

        <Section title="Their agent">
          {roster.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No virtual agents on the roster yet.
            </p>
          ) : (
            <form action={setCreatorPersona} className="flex flex-col gap-3">
              <input type="hidden" name="creatorId" value={creator.id} />
              <div>
                <label className={label} htmlFor="personaId">
                  Runs this account by default
                </label>
                <select
                  id="personaId"
                  name="personaId"
                  className={field}
                  defaultValue={creator.personaId ?? ""}
                >
                  <option value="">
                    {roster[0].name} (first on the roster)
                  </option>
                  {roster.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.title}
                    </option>
                  ))}
                </select>
                <p className={hint}>
                  {creator.persona?.bio ??
                    roster[0].bio ??
                    "She runs outreach and brings deals back."}{" "}
                  Any deal can be handed to someone else.
                </p>
              </div>
              <button type="submit" className={`${primaryBtn} self-start`}>
                Save
              </button>
            </form>
          )}
        </Section>

        <Section title="Where product goes">
          <GiftingPolicyForm creatorId={creator.id} policy={gifting} />
          <DestinationList
            creatorId={creator.id}
            destinations={destinations}
            acceptsProduct={gifting.acceptsProduct}
          />
          <AddDestination
            creatorId={creator.id}
            isFirst={activeDestinations.length === 0}
          />
        </Section>
      </div>
    </main>
  );
}

/**
 * The three separate powers a creator has over gifting: whether they take
 * product at all, whether a brand may post one unasked, and how far a deal has
 * to get before their address is handed over. The last is the one that matters
 * most and the one nobody thinks to ask about, so it is a real control rather
 * than a policy sentence somewhere.
 */
function GiftingPolicyForm({
  creatorId,
  policy,
}: {
  creatorId: string;
  policy: GiftingPolicy;
}) {
  return (
    <form action={saveGiftingPolicy} className="flex flex-col gap-4">
      <input type="hidden" name="creatorId" value={creatorId} />

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="acceptsProduct"
          defaultChecked={policy.acceptsProduct}
          className="mt-0.5 size-4"
        />
        <span>
          Accepts physical product
          <span className="block text-xs text-neutral-500">
            Off means there is no address to give out, and nothing below is
            released to anyone.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="requiresApprovalBeforeSending"
          defaultChecked={policy.requiresApprovalBeforeSending}
          className="mt-0.5 size-4"
        />
        <span>
          A brand must ask before sending anything
          <span className="block text-xs text-neutral-500">
            An unsolicited parcel is a disclosure obligation and a tax event,
            not a treat.
          </span>
        </span>
      </label>

      <div>
        <label className={label} htmlFor="releaseAddressAt">
          Release the address at
        </label>
        <select
          id="releaseAddressAt"
          name="releaseAddressAt"
          className={field}
          defaultValue={policy.releaseAddressAt}
        >
          {ADDRESS_RELEASE_STATES.map((state) => (
            <option key={state} value={state}>
              {STATE_LABELS[state]}
            </option>
          ))}
        </select>
        <p className={hint}>
          Before this state the deal page shows that an address exists, not what
          it is. A brand that hasn&apos;t signed anything has no business holding
          a home address.
        </p>
      </div>

      <div>
        <label className={label} htmlFor="giftingNotes">
          Notes for brands
        </label>
        <textarea
          id="giftingNotes"
          name="giftingNotes"
          rows={2}
          className={field}
          defaultValue={policy.notes}
          placeholder="Sizes, allergies, what not to send"
        />
        <p className={hint}>
          Goes to brands. Don&apos;t put an address here — that&apos;s what the
          destinations below are for, and they&apos;re the part that&apos;s
          gated.
        </p>
      </div>

      <button type="submit" className={`${primaryBtn} self-start`}>
        Save gifting preferences
      </button>
    </form>
  );
}

function DestinationList({
  creatorId,
  destinations,
  acceptsProduct,
}: {
  creatorId: string;
  destinations: Destination[];
  acceptsProduct: boolean;
}) {
  if (destinations.length === 0) {
    return (
      <p className="mt-8 text-sm text-neutral-500">
        No destinations yet. Until there is one, a deal has nowhere to send
        product.
      </p>
    );
  }
  return (
    <ul className="mt-8 flex flex-col gap-3">
      {destinations.map((d) => {
        const archived = d.archivedAt != null;
        return (
          <li
            key={d.id}
            className={`rounded-xl border px-4 py-4 ${
              archived
                ? "border-dashed border-neutral-200 dark:border-neutral-800"
                : "border-neutral-200 dark:border-neutral-800"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {d.label}
                {d.isDefault && !archived && (
                  <span className="ml-2 rounded border border-neutral-300 px-2 py-0.5 text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
                    default
                  </span>
                )}
                {archived && (
                  <span className="ml-2 text-xs font-normal text-neutral-500">
                    archived
                  </span>
                )}
              </span>
              {!acceptsProduct && !archived && (
                <span className="text-xs text-amber-700 dark:text-amber-500">
                  Not in use — product is switched off above
                </span>
              )}
            </div>

            <address className="mt-2 text-sm not-italic text-neutral-700 dark:text-neutral-300">
              {formatDestination(d).map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            {d.instructions && (
              <p className="mt-2 text-xs text-neutral-500">{d.instructions}</p>
            )}

            {!archived && (
              <div className="mt-4 flex flex-wrap gap-2">
                {!d.isDefault && (
                  <form action={setDefaultDestination}>
                    <input type="hidden" name="creatorId" value={creatorId} />
                    <input type="hidden" name="destinationId" value={d.id} />
                    <button type="submit" className={ghostBtn}>
                      Make default
                    </button>
                  </form>
                )}
                <form action={archiveShippingDestination}>
                  <input type="hidden" name="creatorId" value={creatorId} />
                  <input type="hidden" name="destinationId" value={d.id} />
                  <button type="submit" className={ghostBtn}>
                    Archive
                  </button>
                </form>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AddDestination({
  creatorId,
  isFirst,
}: {
  creatorId: string;
  isFirst: boolean;
}) {
  return (
    <details className="mt-8" open={isFirst}>
      <summary className="cursor-pointer text-sm text-neutral-500">
        Add a destination
      </summary>
      <form action={saveShippingDestination} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="creatorId" value={creatorId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="label" label="Name it" placeholder="Studio, PO box…" />
          <TextField
            name="recipient"
            label="Addressed to"
            placeholder="Who's on the label"
          />
        </div>
        <TextField name="line1" label="Street address" />
        <TextField name="line2" label="Line 2" placeholder="Unit, floor (optional)" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="city" label="City" />
          <TextField name="region" label="State / region" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="postalCode" label="Postal code" />
          <TextField name="country" label="Country" placeholder="US" />
        </div>
        <div>
          <label className={label} htmlFor="instructions">
            Courier instructions
          </label>
          <input
            id="instructions"
            name="instructions"
            className={field}
            placeholder="Buzzer code, front desk, delivery window"
          />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="isDefault"
            defaultChecked={isFirst}
            disabled={isFirst}
            className="size-4"
          />
          <span>
            Make this the default
            {isFirst && (
              <span className="ml-1 text-neutral-500">
                — the first one always is
              </span>
            )}
          </span>
        </label>
        <button type="submit" className={`${primaryBtn} self-start`}>
          Save destination
        </button>
      </form>
    </details>
  );
}

function TextField({
  name,
  label: labelText,
  placeholder,
}: {
  name: string;
  label: string;
  placeholder?: string;
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
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
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
