import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { IrisGreeting } from "@/components/Iris";
import { prisma } from "@/lib/prisma";
import { requireCreator } from "@/lib/auth/creator";
import {
  formatDays,
  formatMoney,
  parseTerms,
  termsApprovalIsCurrent,
} from "@/lib/deals/terms";
import { STATE_LABELS } from "@/lib/deals/labels";
import type { DealState } from "@/lib/deals/stateMachine";
import {
  creatorApproveOutreach,
  creatorApproveTerms,
  creatorDeclineOutreach,
  creatorPreviewOutreach,
  creatorRequestTermsChanges,
  creatorSignOut,
} from "./actions";
import { arch } from "@/components/Button";
import { CreatorSetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

/* Pitch drafts the outreach email from this page's server action, and a model
   call outruns the platform's default function limit — the same abort that
   killed "Find brand partners". */
export const maxDuration = 300;

/**
 * A creator's own view.
 *
 * Every query here scopes on the id from requireCreator() — never on a route
 * param or a form field, which is how one creator ends up reading another's
 * deals. This is a separate page tree from the operator console for the same
 * reason: there is no shared page where a missing `where` clause leaks a
 * roster.
 */
export default async function CreatorHomePage(props: PageProps<"/creator">) {
  const creator = await requireCreator();
  const { error } = await props.searchParams;

  const [socials, deals, opportunities] = await Promise.all([
    prisma.socialAccount.findMany({ where: { creatorId: creator.id } }),
    prisma.deal.findMany({
      where: { creatorId: creator.id },
      include: { brand: true },
      orderBy: { updatedAt: "desc" },
    }),
    // SOURCED = waiting on the creator. QUALIFIED = they said yes and it is
    // now with their manager. Both are shown, so approving something does not
    // make it vanish with no trace of what they decided.
    prisma.opportunity.findMany({
      where: { creatorId: creator.id, status: { in: ["SOURCED", "QUALIFIED"] } },
      include: { brand: true },
      orderBy: [{ status: "asc" }, { fitScore: "desc" }],
    }),
  ]);

  const primary = socials[0];

  // An invite carries only a name and an email, so a new account has no niche,
  // no handle and no rate card — nothing Scout or the advisor can run on.
  // Showing an empty dashboard would just be a dead end.
  const needsSetup = !creator.niche || !primary;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-16">
      <header className="mb-10 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link href="/" aria-label="Nspiire home page" className="shrink-0">
          <LogoMark size={34} />
        </Link>
        <form action={creatorSignOut} className="ml-auto">
          <button
            type="submit"
            className="text-base text-neutral-500 underline underline-offset-4"
          >
            Sign out
          </button>
        </form>
      </header>

      {needsSetup ? (
        <CreatorSetupForm
          name={creator.name}
          error={typeof error === "string" ? error : undefined}
        />
      ) : (
        <>
      {/* The handshake. Iris opens, by name, with the one thing she is for.
          The creator's own numbers deliberately do NOT live here — this page is
          "which of these look interesting", and a wall of stats above it makes
          it a report instead of a conversation. They live in the console with
          the other stats. */}
      <IrisGreeting>
        <p>
          Hi {creator.name.split(" ")[0]}, take a look at some deals I&apos;ve
          scouted.{" "}
          <span className="text-neutral-500">Which ones look interesting?</span>
        </p>
      </IrisGreeting>

      <section className="mt-12">
        <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
          Your deals
        </h2>
        <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
          {deals.length === 0 ? (
            <p className="px-5 py-4 text-base text-neutral-500">
              Nothing signed yet. Approve one below and I&apos;ll get it moving.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {deals.map((d) => {
                const terms = parseTerms(d.terms);
                const approved = termsApprovalIsCurrent(d);
                // Approved once, then edited: the fingerprint no longer matches
                // and it needs looking at again.
                const stale = !approved && d.termsApprovedAt != null;
                return (
                  <li key={d.id} className="px-5 py-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-lg font-medium">{d.brand.name}</span>
                      <span className="shrink-0 text-sm text-neutral-500">
                        {STATE_LABELS[d.state as DealState]}
                      </span>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-3 text-base sm:grid-cols-4">
                      <Term label="You get" value={formatMoney(terms.amountCents, terms.currency)} />
                      <Term label="Format" value={terms.format || "—"} />
                      <Term label="They can run it" value={formatDays(terms.usageDays)} />
                      <Term label="Exclusivity" value={formatDays(terms.exclusivityDays)} />
                    </dl>
                    {terms.deliverables && (
                      <p className="mt-3 text-base leading-snug text-neutral-600 dark:text-neutral-300">
                        {terms.deliverables}
                      </p>
                    )}

                    {approved ? (
                      <p className="mt-4 text-base font-medium text-[var(--logo-accent)]">
                        You approved these terms.
                      </p>
                    ) : (
                      <div className="mt-4">
                        {stale && (
                          <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            These terms changed after you approved them. Have
                            another look.
                          </p>
                        )}
                        {d.creatorTermsNote && (
                          <p className="mb-3 text-base text-neutral-500">
                            You asked for changes: “{d.creatorTermsNote}”
                          </p>
                        )}
                        <div className="flex flex-wrap gap-3">
                          <form action={creatorApproveTerms}>
                            <input type="hidden" name="dealId" value={d.id} />
                            <button type="submit" className={arch("primary", "md")}>
                              Approve these terms
                            </button>
                          </form>
                          <form action={creatorRequestTermsChanges} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="dealId" value={d.id} />
                            <input
                              name="note"
                              placeholder="What needs to change?"
                              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
                            />
                            <button type="submit" className={arch("secondary", "md")}>
                              Ask for changes
                            </button>
                          </form>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
          Brands I found for you
        </h2>
        <p className="mt-2 text-base text-neutral-500">
          Nothing is written or sent until you ask for it, and you read every
          word before it goes.
        </p>

        <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
          {opportunities.length === 0 ? (
            <p className="px-5 py-4 text-base text-neutral-500">
              Nothing new right now — I&apos;ll keep looking.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {opportunities.map((o) => (
                <li key={o.id} className="px-5 py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-lg font-medium">{o.brand.name}</span>
                    <span className="shrink-0 text-sm text-neutral-500">
                      {Math.round(o.fitScore * 100)}% fit
                      {o.suggestedFormat ? ` · ${o.suggestedFormat}` : ""}
                    </span>
                  </div>

                  {o.rationale && (
                    <p className="mt-2 text-base leading-snug text-neutral-600 dark:text-neutral-300">
                      {o.rationale}
                    </p>
                  )}
                  {o.evidence && (
                    <p className="mt-2 text-sm leading-snug text-neutral-500">
                      <span className="font-medium">Why them: </span>
                      {o.evidence}
                    </p>
                  )}

                  {o.status === "QUALIFIED" ? (
                    <>
                      <p className="mt-4 text-base font-medium text-[var(--logo-accent)]">
                        Approved — I&apos;ll take it from here.
                      </p>
                      {o.draftBody && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm text-neutral-500">
                            See what you approved
                          </summary>
                          <p className="mt-2 text-sm font-medium">
                            {o.draftSubject}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-neutral-500">
                            {o.draftBody}
                          </p>
                        </details>
                      )}
                    </>
                  ) : o.draftBody ? (
                    /* The draft exists: the creator approves the WORDS, and can
                       edit them first. What they submit is what gets stored. */
                    <form action={creatorApproveOutreach} className="mt-4">
                      <input type="hidden" name="opportunityId" value={o.id} />
                      <p className="text-sm font-medium uppercase tracking-wide text-neutral-400">
                        The email that would go to {o.brand.name}
                      </p>
                      <label className="mt-3 flex flex-col gap-2">
                        <span className="text-sm text-neutral-500">Subject</span>
                        <input
                          name="subject"
                          defaultValue={o.draftSubject ?? ""}
                          className="rounded-xl border border-neutral-300 px-4 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
                        />
                      </label>
                      <label className="mt-3 flex flex-col gap-2">
                        <span className="text-sm text-neutral-500">Message</span>
                        <textarea
                          name="body"
                          defaultValue={o.draftBody}
                          rows={10}
                          className="rounded-xl border border-neutral-300 px-4 py-3 text-base leading-snug dark:border-neutral-700 dark:bg-neutral-900"
                        />
                      </label>
                      <p className="mt-2 text-sm text-neutral-500">
                        Change anything you don&apos;t like — I&apos;ll send
                        exactly what you approve, nothing else.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="submit" className={arch("primary", "md")}>
                          Approve this message
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <form action={creatorPreviewOutreach}>
                        <input type="hidden" name="opportunityId" value={o.id} />
                        <button type="submit" className={arch("primary", "md")}>
                          Write the email
                        </button>
                      </form>
                      <form action={creatorDeclineOutreach}>
                        <input type="hidden" name="opportunityId" value={o.id} />
                        <button type="submit" className={arch("secondary", "md")}>
                          Not interested
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
        </>
      )}
    </main>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}


