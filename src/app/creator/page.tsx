import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { IrisGreeting, irisGreeting } from "@/components/Iris";
import { prisma } from "@/lib/prisma";
import { requireCreator } from "@/lib/auth/creator";
import {
  formatDays,
  formatMoney,
  parseTerms,
  termsApprovalIsCurrent,
} from "@/lib/deals/terms";
import { STATE_LABELS } from "@/lib/deals/labels";
import { adviseForOpportunity, windowsFor } from "@/lib/deals/opportunityTerms";
import type { DealState } from "@/lib/deals/stateMachine";
import {
  creatorAcceptBrand,
  creatorApproveOutreach,
  creatorApproveTerms,
  creatorDeclineBrand,
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

  const [socials, deals, inbound, opportunities] = await Promise.all([
    prisma.socialAccount.findMany({ where: { creatorId: creator.id } }),
    prisma.deal.findMany({
      where: { creatorId: creator.id },
      include: { brand: true },
      orderBy: { updatedAt: "desc" },
    }),
    // SOURCED = waiting on the creator. QUALIFIED = they said yes and it is
    // now with their manager. Both are shown, so approving something does not
    // make it vanish with no trace of what they decided.
    prisma.brandInterest.findMany({
      where: { creatorId: creator.id, status: "SENT" },
      include: { brandAccount: true },
      orderBy: { createdAt: "desc" },
    }),
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

  // What Iris opens with is derived from what is actually outstanding, so the
  // greeting cannot cheerfully announce new brands while a deal sits unsigned.
  // What Iris would ask each brand for. Computed here so the creator sees the
  // number BEFORE approving outreach — the same figure approveOpportunity
  // writes onto the deal later, from the same function.
  const advice = new Map(
    await Promise.all(
      opportunities.map(
        async (o) =>
          [
            o.id,
            await adviseForOpportunity(prisma, {
              creator,
              social: primary,
              format: o.suggestedFormat ?? "",
            }),
          ] as const,
      ),
    ),
  );
  const windows = windowsFor(creator.guardrails);

  const greeting = irisGreeting({
    firstName: creator.name.split(" ")[0],
    toReview: opportunities.filter((o) => o.status === "SOURCED" && !o.draftBody).length,
    toRead: opportunities.filter((o) => o.status === "SOURCED" && !!o.draftBody).length,
    toSign: deals.filter((d) => !termsApprovalIsCurrent(d)).length,
    toAnswer: inbound.length,
  });

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
          {greeting.lead}{" "}
          <span className="text-neutral-500">{greeting.follow}</span>
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

      {/* Brands who came looking. Distinct from the shortlist Iris built:
          somebody asked for THEM, which is a different and better signal. */}
      {inbound.length > 0 && (
        <section className="mt-12">
          <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
            Brands who asked for you
          </h2>
          <p className="mt-2 text-base text-neutral-500">
            They can&apos;t reach you unless you say yes.
          </p>
          <ul className="mt-4 flex flex-col gap-4">
            {inbound.map((i) => (
              <li
                key={i.id}
                className="rounded-xl border border-neutral-200 px-5 py-5 dark:border-neutral-800"
              >
                <p className="text-lg font-medium">{i.brandAccount.companyName}</p>
                {i.note && (
                  <p className="mt-2 text-base leading-snug text-neutral-600 dark:text-neutral-300">
                    &ldquo;{i.note}&rdquo;
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  <form action={creatorAcceptBrand}>
                    <input type="hidden" name="interestId" value={i.id} />
                    <button type="submit" className={arch("primary", "md")}>
                      Talk to them
                    </button>
                  </form>
                  <form action={creatorDeclineBrand}>
                    <input type="hidden" name="interestId" value={i.id} />
                    <button type="submit" className={arch("secondary", "md")}>
                      No thanks
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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

                  {/* One line, and only one. A shortlist you have to read four
                      paragraphs of is a shortlist nobody decides on. Older
                      opportunities predate Scout returning a summary, so the
                      first sentence of the rationale stands in. */}
                  <p className="mt-2 text-base leading-snug text-neutral-600 dark:text-neutral-300">
                    {o.brand.summary ?? firstSentence(o.rationale)}
                  </p>

                  {/* The ask stays visible: approving outreach without seeing
                      the number means approving a conversation whose terms you
                      were never told. Everything explaining that number — the
                      rationale, the evidence, the range, the reasoning — sits
                      behind one press, because a shortlist you have to read
                      four paragraphs of is a shortlist nobody decides on. */}
                  {(() => {
                    const a = advice.get(o.id);
                    return (
                      <>
                        {a && (
                          <p className="mt-3 text-3xl font-semibold tabular-nums">
                            {a.amountCents == null ? (
                              <span className="text-base font-normal text-neutral-500">
                                No rate set for {o.suggestedFormat || "this format"} yet.
                              </span>
                            ) : (
                              formatMoney(a.amountCents)
                            )}
                          </p>
                        )}

                        <details className="mt-3">
                          <summary className="cursor-pointer text-base text-neutral-500 underline underline-offset-4">
                            Why them, and how I got to that
                          </summary>

                          {o.rationale && (
                            <p className="mt-3 text-base leading-snug text-neutral-600 dark:text-neutral-300">
                              {o.rationale}
                            </p>
                          )}
                          {o.evidence && (
                            <p className="mt-2 text-sm leading-snug text-neutral-500">
                              <span className="font-medium">Why them: </span>
                              {o.evidence}
                            </p>
                          )}

                          {a && a.amountCents != null && (
                            <>
                              <dl className="mt-4 grid grid-cols-2 gap-3 text-base sm:grid-cols-4">
                                <Term
                                  label="Range"
                                  value={
                                    a.lowCents != null && a.highCents != null
                                      ? `${formatMoney(a.lowCents)}–${formatMoney(a.highCents)}`
                                      : "—"
                                  }
                                />
                                <Term
                                  label="Your floor"
                                  value={a.floorCents != null ? formatMoney(a.floorCents) : "—"}
                                />
                                <Term label="They can run it" value={formatDays(windows.usageDays)} />
                                <Term label="Exclusivity" value={formatDays(windows.exclusivityDays)} />
                              </dl>
                              {a.reasoning.length > 0 && (
                                <p className="mt-3 text-sm leading-snug text-neutral-500">
                                  {a.reasoning.join(" ")}
                                </p>
                              )}
                            </>
                          )}
                        </details>
                      </>
                    );
                  })()}

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
                          Pursue this deal
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

/** First sentence, for opportunities sourced before Scout returned a summary. */
function firstSentence(text: string | null): string {
  if (!text) return "";
  const cut = text.match(/^.*?[.!?](\s|$)/);
  return (cut ? cut[0] : text).trim();
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}


