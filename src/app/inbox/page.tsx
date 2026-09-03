import Link from "next/link";
import { requireOperator } from "@/lib/auth/operator";
import { prisma, hasDatabase } from "@/lib/prisma";
import {
  Crumb,
  ErrorBanner,
  NotConnected,
  field,
  ghostBtn,
  hint,
  label,
  primaryBtn,
} from "@/app/deals/ui";
import {
  convertInquiry,
  reinstateBrand,
  saveInquiryNotes,
  setInquiryStatus,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * The inbound queue.
 *
 * Note the path: /inbox, not /inquiries. The public form owns /inquiries, and
 * the proxy's public set is matched exactly, so putting the operator view under
 * that prefix would have been one typo away from serving the queue — every
 * name, email and message anyone has ever sent — to the internet. Different
 * concern, different route.
 *
 * A brand inquiry converts to a deal. A creator inquiry does not: onboarding
 * needs a rate card, guardrails and socials that nobody has typed yet, and
 * inventing them from a paragraph would be worse than doing it by hand. So the
 * creator lane is honest about being a link to the onboarding form.
 */

const STATUS_FILTERS = ["NEW", "TRIAGED", "CONVERTED", "SPAM", "CLOSED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function isStatus(v: string | undefined): v is StatusFilter {
  return !!v && (STATUS_FILTERS as readonly string[]).includes(v);
}

export default async function InboxPage(props: PageProps<"/inbox">) {
  await requireOperator("/inbox");

  const { status, error } = await props.searchParams;
  const active: StatusFilter = isStatus(
    typeof status === "string" ? status : undefined,
  )
    ? (status as StatusFilter)
    : "NEW";

  if (!hasDatabase) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <Crumb href="/dashboard">← Dashboard</Crumb>
        <NotConnected />
      </main>
    );
  }

  const [inquiries, counts, creators] = await Promise.all([
    prisma.inquiry.findMany({
      where: { status: active },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.inquiry.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.creator.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, niche: true },
      take: 200,
    }),
  ]);

  // Brands named in these inquiries that previously opted out. Looked up by
  // the company they typed, which is a guess — the warning is advisory and the
  // real block lives in convertInquiry().
  const companies = inquiries
    .map((i) => i.company?.trim())
    .filter((c): c is string => Boolean(c));
  const optedOut = companies.length
    ? await prisma.brand.findMany({
        where: { name: { in: companies }, optedOutAt: { not: null } },
        select: { id: true, name: true },
      })
    : [];
  const optedOutByName = new Map(optedOut.map((b) => [b.name, b]));

  const countFor = (s: StatusFilter) =>
    counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:py-14">
      <Crumb href="/dashboard">← Dashboard</Crumb>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        Inbox
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        People who wrote in through the site. Nothing here has been replied to
        automatically.
      </p>

      <ErrorBanner message={typeof error === "string" ? error : undefined} />

      <nav className="mt-8 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={`/inbox?status=${s}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              s === active
                ? "border-neutral-900 text-neutral-900 dark:border-neutral-300 dark:text-neutral-100"
                : "border-neutral-200 text-neutral-500 dark:border-neutral-800"
            }`}
          >
            {s.toLowerCase()} {countFor(s)}
          </Link>
        ))}
      </nav>

      {inquiries.length === 0 ? (
        <p className="mt-10 text-sm text-neutral-500">
          Nothing {active.toLowerCase()}.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-5">
          {inquiries.map((i) => {
            const blocked = i.company ? optedOutByName.get(i.company) : undefined;
            return (
              <li
                key={i.id}
                className="rounded-xl border border-neutral-200 px-5 py-5 dark:border-neutral-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {i.name}
                    {i.company ? ` · ${i.company}` : ""}
                    <span className="ml-2 rounded border border-neutral-300 px-2 py-0.5 text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
                      {i.kind === "CREATOR" ? "creator" : "brand"}
                    </span>
                  </span>
                  <span className="text-sm text-neutral-500">
                    {i.budgetBand ? `${i.budgetBand} · ` : ""}
                    {new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "UTC",
                    }).format(i.createdAt)}{" "}
                    UTC
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                  <a
                    href={`mailto:${i.email}`}
                    className="underline underline-offset-4"
                  >
                    {i.email}
                  </a>
                </p>
                <p className="mt-3 whitespace-pre-wrap text-base text-neutral-700 dark:text-neutral-300">
                  {i.message}
                </p>

                {blocked && (
                  <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    <p>
                      {blocked.name} previously asked not to be contacted. This
                      message may be a different person there — read it before
                      deciding.
                    </p>
                    <form action={reinstateBrand} className="mt-3">
                      <input type="hidden" name="brandId" value={blocked.id} />
                      <button type="submit" className={ghostBtn}>
                        They changed their mind — reinstate
                      </button>
                    </form>
                  </div>
                )}

                {i.kind === "BRAND" ? (
                  <ConvertToDeal
                    inquiryId={i.id}
                    defaultBrandName={i.company ?? ""}
                    creators={creators}
                    disabled={Boolean(blocked)}
                  />
                ) : (
                  <p className={`${hint} mt-4`}>
                    Creator inquiries are onboarded by hand — a rate card and
                    guardrails aren&apos;t things to guess from a paragraph.{" "}
                    <Link
                      href="/onboarding"
                      className="underline underline-offset-4"
                    >
                      Open onboarding
                    </Link>
                    , then mark this converted.
                  </p>
                )}

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-neutral-500">
                    Notes{i.notes ? " · saved" : ""}
                  </summary>
                  <form
                    action={saveInquiryNotes}
                    className="mt-3 flex flex-col gap-2"
                  >
                    <input type="hidden" name="inquiryId" value={i.id} />
                    <textarea
                      name="notes"
                      rows={2}
                      className={field}
                      defaultValue={i.notes ?? ""}
                      placeholder="What you decided, and why"
                    />
                    <button type="submit" className={`${ghostBtn} self-start`}>
                      Save notes
                    </button>
                  </form>
                </details>

                <div className="mt-4 flex flex-wrap gap-2">
                  {STATUS_FILTERS.filter((s) => s !== i.status).map((s) => (
                    <form key={s} action={setInquiryStatus}>
                      <input type="hidden" name="inquiryId" value={i.id} />
                      <input type="hidden" name="status" value={s} />
                      <button type="submit" className={ghostBtn}>
                        Mark {s.toLowerCase()}
                      </button>
                    </form>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

/**
 * The conversion form.
 *
 * The brand name is editable rather than taken straight from what they typed:
 * `Brand.name` is unique and is what every future deal matches on, so "Acme"
 * and "Acme Inc." becoming two brands is a real cost. A human fixing it here
 * once is cheaper than merging later.
 *
 * There is no rate field. They may have given a budget band, and a band is not
 * an offer — the deal opens unpriced and the advisor prices it.
 */
function ConvertToDeal({
  inquiryId,
  defaultBrandName,
  creators,
  disabled,
}: {
  inquiryId: string;
  defaultBrandName: string;
  creators: { id: string; name: string; niche: string | null }[];
  disabled: boolean;
}) {
  if (creators.length === 0) {
    return (
      <p className={`${hint} mt-4`}>
        No creators on the roster yet — a deal needs someone to belong to.{" "}
        <Link href="/onboarding" className="underline underline-offset-4">
          Onboard one
        </Link>
        .
      </p>
    );
  }

  return (
    <form action={convertInquiry} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <div className="min-w-48 flex-1">
        <label className={label} htmlFor={`brandName-${inquiryId}`}>
          Brand
        </label>
        <input
          id={`brandName-${inquiryId}`}
          name="brandName"
          className={field}
          defaultValue={defaultBrandName}
          placeholder="Brand name"
          required
        />
      </div>
      <div className="min-w-48 flex-1">
        <label className={label} htmlFor={`creatorId-${inquiryId}`}>
          For
        </label>
        <select
          id={`creatorId-${inquiryId}`}
          name="creatorId"
          className={field}
          defaultValue={creators[0].id}
          required
        >
          {creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.niche ? ` — ${c.niche}` : ""}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={primaryBtn} disabled={disabled}>
        Open a deal
      </button>
    </form>
  );
}
