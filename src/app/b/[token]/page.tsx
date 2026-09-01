import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, hasDatabase } from "@/lib/prisma";
import { parseTerms } from "@/lib/deals/terms";
import { brandView, isBrandToken } from "@/lib/deals/brandAccess";
import { parseMetrics, formatCount, formatRate } from "@/lib/creators/metrics";
import { resolvePersona } from "@/lib/agents/persona";
import { Logo } from "@/components/Logo";
import { optOutBrand, postBrandMessage } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The deal room — the one page a brand ever sees.
 *
 * Public by design: a brand cannot have an Nspiire login (lib/auth/operator.ts
 * explains why), so the token in the URL is the whole authorisation. That makes
 * this the most exposed surface in the product, and it is built accordingly:
 *
 *   - The token's shape is checked before it reaches a query.
 *   - `brandView()` decides what is on the page. This file renders that and
 *     nothing else — no Deal row is handed to a template, so a column added
 *     later cannot appear here by accident.
 *   - Only SENT messages are shown. Drafts Iris has written and a human has not
 *     approved do not exist as far as this page is concerned.
 *   - noindex, and no referrer, so the token does not walk out in a header or
 *     a search result.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function BrandPortalPage(props: PageProps<"/b/[token]">) {
  const { token } = await props.params;
  if (!hasDatabase || !isBrandToken(token)) notFound();

  const deal = await prisma.deal.findUnique({
    where: { brandToken: token },
    include: {
      brand: true,
      creator: { include: { socials: true, persona: true } },
      persona: true,
      // Sent outbound and everything inbound. A draft is not a message.
      interactions: {
        where: {
          audience: "brand",
          OR: [{ direction: "inbound" }, { sentAt: { not: null } }],
        },
        orderBy: { createdAt: "asc" },
        take: 60,
      },
    },
  });
  if (!deal) notFound();

  const roster = await prisma.persona.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const persona = resolvePersona(deal.persona, deal.creator.persona, roster);
  const primary = deal.creator.socials[0];
  const metrics = parseMetrics(primary?.metrics);
  const followers = metrics.followerCount ?? primary?.followerCount ?? null;

  const view = brandView({
    brandName: deal.brand.name,
    creatorName: deal.creator.name,
    creatorNiche: deal.creator.niche,
    personaName: persona?.name ?? "Nspiire",
    audienceLine: primary
      ? `${formatCount(followers)} followers on ${primary.platform.toLowerCase()}` +
        (metrics.engagementRateByFollowers
          ? `, ${formatRate(metrics.engagementRateByFollowers)} engagement`
          : "")
      : "",
    terms: parseTerms(deal.terms),
  });

  const optedOut = deal.brand.optedOutAt != null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:py-14">
      <Logo size={22} />

      <h1 className="mt-8 text-2xl font-semibold tracking-tight sm:text-3xl">
        {view.headline}
      </h1>
      {view.audienceLine && (
        <p className="mt-1 text-sm text-neutral-500">{view.audienceLine}</p>
      )}
      <p className="mt-4 text-sm text-neutral-500">
        {persona?.name ?? "Nspiire"} is a virtual agent working for{" "}
        {deal.creator.name}. This page is the whole conversation — no account,
        nothing to install.
      </p>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
          On the table
        </h2>
        <dl className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {view.terms.map((line) => (
            <div
              key={line.label}
              className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3 text-sm"
            >
              <dt className="text-neutral-500">{line.label}</dt>
              <dd className="text-right">{line.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-neutral-500">
          Nothing here is agreed until both sides say so in writing.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
          Messages
        </h2>
        {deal.interactions.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">Nothing yet.</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-3">
            {deal.interactions.map((m) => (
              <li
                key={m.id}
                className={
                  m.direction === "outbound"
                    ? "rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
                    : "rounded-xl bg-neutral-100 px-4 py-3 dark:bg-neutral-900"
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                    {m.direction === "outbound"
                      ? (persona?.name ?? "Nspiire")
                      : deal.brand.name}
                  </span>
                  <time
                    dateTime={m.createdAt.toISOString()}
                    className="text-xs tabular-nums text-neutral-400"
                  >
                    {new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    }).format(m.createdAt)}
                  </time>
                </div>
                {m.subject && (
                  <p className="mt-1 text-sm font-medium">{m.subject}</p>
                )}
                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
                  {m.body}
                </p>
              </li>
            ))}
          </ol>
        )}

        {!optedOut && (
          <form action={postBrandMessage} className="mt-6 flex flex-col gap-3">
            <input type="hidden" name="token" value={token} />
            <label className="sr-only" htmlFor="body">
              Your reply
            </label>
            <textarea
              id="body"
              name="body"
              rows={4}
              required
              maxLength={5000}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-300"
              placeholder={`Reply to ${persona?.name ?? "Nspiire"}…`}
            />
            <button
              type="submit"
              className="self-start rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Send
            </button>
            <p className="text-xs text-neutral-500">
              {persona?.name ?? "The agent"} reads this, and so does{" "}
              {deal.creator.name}. Replies to the original email land here too.
            </p>
          </form>
        )}
      </section>

      <section
        id="stop"
        className="mt-16 border-t border-neutral-200 pt-8 dark:border-neutral-800"
      >
        {optedOut ? (
          <p className="text-sm text-neutral-500">
            {deal.brand.name} is on the do-not-contact list. Nothing further will
            be sent.
          </p>
        ) : (
          <form action={optOutBrand} className="flex flex-col gap-3">
            <input type="hidden" name="token" value={token} />
            <p className="text-sm text-neutral-500">
              Not interested? One click and {deal.brand.name} won&apos;t hear
              from us again — about this or anything else.
            </p>
            <button
              type="submit"
              className="self-start rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
            >
              Don&apos;t contact us again
            </button>
          </form>
        )}
      </section>

      <footer className="mt-12 text-xs text-neutral-400">
        Nspiire — VerMar Design LLC
      </footer>
    </main>
  );
}
