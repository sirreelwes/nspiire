import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { IrisGreeting, irisGreeting } from "@/components/Iris";
import { SubmitButton } from "@/components/SubmitButton";
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
import { adviceForCreator } from "@/lib/deals/creatorAdvice";
import type { TermsAdvice } from "@/lib/deals/advisor";
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
  setRosterListing,
} from "./actions";
import { arch } from "@/components/Button";
import { CreatorSetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

/* Pitch drafts the outreach email from this page's server action, and a model
   call outruns the platform's default function limit — the same abort that
   killed "Find brand partners". */
export const maxDuration = 300;

/**
 * How many brands Iris puts in front of a creator at once.
 *
 * Scout already returns four a run, but that only caps what gets ADDED: three
 * runs and the page showed twelve, every one with two buttons. Three is a
 * choice; twelve is a spreadsheet. The rest wait behind "show me three more",
 * so nothing is hidden for good — it is just not all shouted at once.
 */
const SHORTLIST_BATCH = 3;

/** What went wrong, said the way Iris would say it. */
const ERRORS: Record<string, string> = {
  draft: "I couldn't write that email just now. Give it a minute and try again.",
  nodraft: "That one needs an email written before you can approve it.",
  empty: "The subject and the message both need something in them.",
};

/**
 * A creator's own view.
 *
 * Every query here scopes on the id from requireCreator() — never on a route
 * param or a form field, which is how one creator ends up reading another's
 * deals. This is a separate page tree from the operator console for the same
 * reason: there is no shared page where a missing `where` clause leaks a
 * roster.
 *
 * Sections appear in the order the greeting prioritises them — money to sign
 * off, brands who asked, emails to read, then the shortlist — and a section
 * with nothing in it is not rendered. An empty "Your deals" box above the one
 * thing that needs doing is furniture.
 */
export default async function CreatorHomePage(props: PageProps<"/creator">) {
  const creator = await requireCreator();
  const { error, show, skipped } = await props.searchParams;

  const [socials, deals, inbound, opportunities] = await Promise.all([
    prisma.socialAccount.findMany({ where: { creatorId: creator.id } }),
    prisma.deal.findMany({
      where: { creatorId: creator.id },
      include: { brand: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.brandInterest.findMany({
      where: { creatorId: creator.id, status: "SENT" },
      include: { brandAccount: true },
      orderBy: { createdAt: "desc" },
    }),
    // SOURCED = waiting on the creator. QUALIFIED = they said yes and it is
    // now with their manager. Both are loaded, so approving something does not
    // make it vanish with no trace of what they decided.
    prisma.opportunity.findMany({
      where: { creatorId: creator.id, status: { in: ["SOURCED", "QUALIFIED"] } },
      include: { brand: true },
      orderBy: [{ fitScore: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const primary = socials[0];

  // An invite carries only a name and an email, so a new account has no niche,
  // no handle and no rate card — nothing Scout or the advisor can run on.
  // Showing an empty dashboard would just be a dead end.
  const needsSetup = !creator.niche || !primary;

  // Three piles. Drafted emails are the ones actually waiting on a decision,
  // so they come first; the shortlist is what Iris is proposing; approved ones
  // are out of the creator's hands and only kept for the record.
  const toRead = opportunities.filter((o) => o.status === "SOURCED" && !!o.draftBody);
  const shortlist = opportunities.filter((o) => o.status === "SOURCED" && !o.draftBody);
  const approved = opportunities.filter((o) => o.status === "QUALIFIED");

  // ?show=6 widens the batch. Clamped so a hand-edited URL cannot do anything
  // the button could not.
  const requested = Number(typeof show === "string" ? show : SHORTLIST_BATCH);
  const limit = Math.min(
    shortlist.length,
    Math.max(
      SHORTLIST_BATCH,
      Number.isFinite(requested) ? Math.ceil(requested / SHORTLIST_BATCH) * SHORTLIST_BATCH : SHORTLIST_BATCH,
    ),
  );
  const shown = shortlist.slice(0, limit);
  const remaining = shortlist.length - shown.length;
  const pick = shortlist[0] ?? null;

  // What Iris would ask for. The advisor prices the CREATOR — rate card,
  // floor, engagement — so the number depends only on the format, and one
  // call per distinct format covers every card. Computed here so the creator
  // sees the number BEFORE approving outreach; approveOpportunity writes the
  // same figure, from the same function, onto the deal later.
  const formats = [...new Set([...toRead, ...shown].map((o) => o.suggestedFormat ?? ""))];
  const adviceByFormat = new Map<string, TermsAdvice>(
    await Promise.all(
      formats.map(
        async (format) =>
          [
            format,
            await adviseForOpportunity(prisma, { creator, social: primary, format }),
          ] as const,
      ),
    ),
  );
  const windows = windowsFor(creator.guardrails);

  // When every brand on show would get the same ask, say it once above the
  // list instead of printing the same big number on every card. Per-card
  // figures come back the moment they differ.
  const shownAdvice = shown.map((o) => adviceByFormat.get(o.suggestedFormat ?? ""));
  const oneFormat = shown.length > 0 && formats.length === 1 ? shown[0].suggestedFormat ?? "" : null;
  const oneAmount =
    shownAdvice.length > 0 &&
    shownAdvice.every((a) => a && a.amountCents != null && a.amountCents === shownAdvice[0]!.amountCents)
      ? shownAdvice[0]!.amountCents
      : null;

  const greeting = irisGreeting({
    firstName: creator.name.split(" ")[0],
    toReview: shortlist.length,
    toRead: toRead.length,
    toSign: deals.filter((d) => !termsApprovalIsCurrent(d)).length,
    toAnswer: inbound.length,
    pick: pick ? brandName(pick.brand.name) : null,
  });

  const aside =
    typeof error === "string" && ERRORS[error]
      ? ERRORS[error]
      : typeof skipped === "string" && skipped
        ? `Okay, I've skipped ${skipped}.`
        : null;

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
          {/* The handshake. Iris opens, by name, with the one thing she is
              for. The creator's own numbers deliberately do NOT live here —
              this page is "which of these look interesting", and a wall of
              stats above it makes it a report instead of a conversation. */}
          <IrisGreeting>
            <p>
              {greeting.lead}{" "}
              <span className="text-neutral-500">{greeting.follow}</span>
            </p>
            {aside && (
              <p className="mt-3 text-base text-neutral-500">{aside}</p>
            )}
          </IrisGreeting>

          {deals.length > 0 && (
            <Section title="Your deals">
              <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {deals.map((d) => (
                  <DealCard key={d.id} deal={d} />
                ))}
              </ul>
            </Section>
          )}

          {/* Brands who came looking. Distinct from the shortlist Iris built:
              somebody asked for THEM, which is a different and better signal. */}
          {inbound.length > 0 && (
            <Section
              title="Brands who asked for you"
              intro="They can't reach you unless you say yes."
            >
              <ul className="flex flex-col gap-4">
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
                        <SubmitButton pending="Opening it up…">Talk to them</SubmitButton>
                      </form>
                      <form action={creatorDeclineBrand}>
                        <input type="hidden" name="interestId" value={i.id} />
                        <SubmitButton variant="secondary" pending="Declining…">
                          No thanks
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* The email exists: the creator approves the WORDS, and can edit
              them first. What they submit is what gets stored. This is the
              one thing on the page that is actually waiting on them, so it
              sits above the shortlist rather than somewhere inside it. */}
          {toRead.length > 0 && (
            <Section
              title={toRead.length === 1 ? "Read this before it goes" : "Read these before they go"}
              intro="Change anything you don't like. I send exactly what you approve, nothing else."
            >
              <ul className="flex flex-col gap-4">
                {toRead.map((o) => (
                  <li
                    key={o.id}
                    className="rounded-xl border border-neutral-200 px-5 py-5 dark:border-neutral-800"
                  >
                    <p className="text-lg font-medium">{brandName(o.brand.name)}</p>
                    <p className="mt-1 text-base leading-snug text-neutral-600 dark:text-neutral-300">
                      {oneLiner(o)}
                    </p>
                    <form action={creatorApproveOutreach} className="mt-4">
                      <input type="hidden" name="opportunityId" value={o.id} />
                      <label className="flex flex-col gap-2">
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
                          defaultValue={o.draftBody ?? ""}
                          rows={10}
                          className="rounded-xl border border-neutral-300 px-4 py-3 text-base leading-snug dark:border-neutral-700 dark:bg-neutral-900"
                        />
                      </label>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <SubmitButton pending="Approving…">Approve this message</SubmitButton>
                      </div>
                    </form>
                    <form action={creatorDeclineOutreach} className="mt-3">
                      <input type="hidden" name="opportunityId" value={o.id} />
                      <input type="hidden" name="brandName" value={brandName(o.brand.name)} />
                      <button
                        type="submit"
                        className="text-sm text-neutral-500 underline underline-offset-4"
                      >
                        Actually, skip {brandName(o.brand.name)}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            title="Brands I found for you"
            intro={
              shortlist.length === 0
                ? "Nothing new right now. I'll keep looking."
                : oneAmount != null
                  ? `For ${withArticle((oneFormat || "this format").toLowerCase())} I'd ask ${formatMoney(oneAmount)}. Nothing is written or sent until you say so.`
                  : "Nothing is written or sent until you say so."
            }
          >
            {shown.length > 0 && (
              <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {shown.map((o, index) => {
                  const a = adviceByFormat.get(o.suggestedFormat ?? "");
                  const priceHere = a && a.amountCents != null && oneAmount == null;
                  return (
                    <li key={o.id} className="px-5 py-5">
                      {index === 0 && (
                        <p className="mb-1 text-sm font-medium uppercase tracking-[0.16em] text-[var(--logo-accent)]">
                          My pick
                        </p>
                      )}
                      <p className="text-lg font-medium">{brandName(o.brand.name)}</p>

                      {/* One line, and only one. A shortlist you have to read
                          four paragraphs of is a shortlist nobody decides on. */}
                      <p className="mt-1 text-base leading-snug text-neutral-600 dark:text-neutral-300">
                        {oneLiner(o)}
                      </p>

                      {priceHere && (
                        <p className="mt-3 text-base">
                          I&apos;d ask{" "}
                          <span className="font-semibold tabular-nums">{formatMoney(a!.amountCents)}</span>
                          {o.suggestedFormat ? ` for ${o.suggestedFormat.toLowerCase()}` : ""}.
                        </p>
                      )}
                      {a && a.amountCents == null && (
                        <p className="mt-3 text-base text-neutral-500">
                          No rate set for {o.suggestedFormat || "this format"} yet.
                        </p>
                      )}

                      {/* Everything behind the one line — why them, how Iris
                          knows, and how she got to the number — sits behind
                          one press. */}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-base text-neutral-500 underline underline-offset-4">
                          Why them, and what I&apos;d ask for
                        </summary>
                        {o.rationale && (
                          <p className="mt-3 text-base leading-snug text-neutral-600 dark:text-neutral-300">
                            {o.rationale}
                          </p>
                        )}
                        {o.evidence && (
                          <p className="mt-2 text-sm leading-snug text-neutral-500">
                            <span className="font-medium">How I know: </span>
                            {o.evidence}
                          </p>
                        )}
                        {a && (
                          <p className="mt-3 text-base leading-snug text-neutral-600 dark:text-neutral-300">
                            {adviceForCreator(a, {
                              format: o.suggestedFormat ?? "",
                              usageDays: windows.usageDays,
                              exclusivityDays: windows.exclusivityDays,
                            }).join(" ")}
                          </p>
                        )}
                      </details>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <form action={creatorPreviewOutreach}>
                          <input type="hidden" name="opportunityId" value={o.id} />
                          <SubmitButton pending="Writing the email…">Pursue this deal</SubmitButton>
                        </form>
                        <form action={creatorDeclineOutreach}>
                          <input type="hidden" name="opportunityId" value={o.id} />
                          <input type="hidden" name="brandName" value={brandName(o.brand.name)} />
                          <SubmitButton variant="secondary" pending="Skipping…">
                            Not interested
                          </SubmitButton>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {remaining > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link
                  href={`/creator?show=${limit + SHORTLIST_BATCH}`}
                  className={arch("secondary", "md")}
                >
                  Show me {Math.min(SHORTLIST_BATCH, remaining) === 1 ? "one" : Math.min(SHORTLIST_BATCH, remaining) === 2 ? "two" : "three"} more
                </Link>
                <span className="text-base text-neutral-500">
                  {remaining} more when you want {remaining === 1 ? "it" : "them"}.
                </span>
              </div>
            )}
          </Section>

          {/* Out of the creator's hands. Kept for the record, kept small. */}
          {approved.length > 0 && (
            <Section title="With me now" intro="You said yes to these. I'll take it from here.">
              <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {approved.map((o) => (
                  <li key={o.id} className="px-5 py-4">
                    <p className="text-base font-medium">{brandName(o.brand.name)}</p>
                    {o.draftBody && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-sm text-neutral-500">
                          See what you approved
                        </summary>
                        <p className="mt-2 text-sm font-medium">{o.draftSubject}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-neutral-500">
                          {o.draftBody}
                        </p>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Consent to being found. One line and a button; what brands would
              and would not see sits behind a press, because a creator agreeing
              to "be listed" without being able to check what is shown has not
              agreed to anything in particular. */}
          <Section title="Being found by brands">
            <div className="rounded-xl border border-neutral-200 px-5 py-5 dark:border-neutral-800">
              <p className="text-base leading-snug text-neutral-600 dark:text-neutral-300">
                {creator.listedOnRoster
                  ? "Brands on Nspiire can see you and ask to work with you. They still can't reach you until you say yes."
                  : "Brands on Nspiire can't see you yet."}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-neutral-500 underline underline-offset-4">
                  What they&apos;d see
                </summary>
                <p className="mt-2 text-sm leading-snug text-neutral-500">
                  Your name, handle, niche, follower count, average views and
                  engagement. Never your rates, your floor, your email, or any
                  deal you&apos;ve done. Your price is something I quote, not
                  something they look up.
                </p>
              </details>
              <form action={setRosterListing} className="mt-4">
                <input
                  type="hidden"
                  name="listed"
                  value={creator.listedOnRoster ? "off" : "on"}
                />
                <SubmitButton
                  variant={creator.listedOnRoster ? "secondary" : "primary"}
                  pending={creator.listedOnRoster ? "Taking you off…" : "Adding you…"}
                >
                  {creator.listedOnRoster ? "Take me off the roster" : "Put me on the roster"}
                </SubmitButton>
              </form>
              {creator.listedOnRoster && (
                <p className="mt-3 text-sm text-neutral-500">
                  Coming off stops new brands finding you. Conversations
                  you&apos;ve already accepted carry on.
                </p>
              )}
            </div>
          </Section>
        </>
      )}
    </main>
  );
}

/* --------------------------------------------------------------- pieces */

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
        {title}
      </h2>
      {intro && <p className="mt-2 text-base text-neutral-500">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

type DealRow = {
  id: string;
  state: string;
  terms: unknown;
  termsApprovedAt: Date | null;
  termsApprovedFingerprint: string | null;
  creatorTermsNote: string | null;
  brand: { name: string };
};

function DealCard({ deal: d }: { deal: DealRow }) {
  const terms = parseTerms(d.terms);
  const approved = termsApprovalIsCurrent(d);
  // Approved once, then edited: the fingerprint no longer matches and it
  // needs looking at again.
  const stale = !approved && d.termsApprovedAt != null;
  // A deal born from the advisor still carries its note, and has not been
  // touched since: these are the same terms the creator saw on the shortlist.
  const asShown =
    d.state === "PITCHED" && terms.notes.startsWith("Proposed by the terms advisor");

  return (
    <li className="px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-lg font-medium">{brandName(d.brand.name)}</span>
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
          {stale ? (
            <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              These terms changed after you approved them. Have another look.
            </p>
          ) : asShown ? (
            <p className="mb-3 text-base text-neutral-500">
              Same as I showed you before you approved the outreach. Say yes
              once more and I&apos;ll take it to them.
            </p>
          ) : null}
          {d.creatorTermsNote && (
            <p className="mb-3 text-base text-neutral-500">
              You asked for changes: “{d.creatorTermsNote}”
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <form action={creatorApproveTerms}>
              <input type="hidden" name="dealId" value={d.id} />
              <SubmitButton pending="Approving…">Approve these terms</SubmitButton>
            </form>
            <form action={creatorRequestTermsChanges} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="dealId" value={d.id} />
              <input
                name="note"
                placeholder="What needs to change?"
                className="rounded-xl border border-neutral-300 px-4 py-2.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
              />
              <SubmitButton variant="secondary" pending="Sending…">
                Ask for changes
              </SubmitButton>
            </form>
          </div>
        </div>
      )}
    </li>
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

/* ----------------------------------------------------------------- copy */

/**
 * Scout sometimes files a brand as "Aroma Academy (wine aroma training kits)".
 * The name is the name; the bracket is a description, and it belongs on the
 * one-liner, not wrapped across two lines above it.
 */
function brandName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

function brandDescriptor(name: string): string | null {
  const m = name.match(/\(([^)]*)\)\s*$/);
  return m ? m[1].trim() : null;
}

/**
 * The one line under the name. Scout's summary when there is one; the
 * bracketed descriptor from the name when there is not; the first sentence of
 * the rationale as a last resort, for opportunities that predate both.
 */
function oneLiner(o: {
  brand: { name: string; summary: string | null };
  rationale: string | null;
}): string {
  if (o.brand.summary) return o.brand.summary;
  const descriptor = brandDescriptor(o.brand.name);
  if (descriptor) return descriptor.charAt(0).toUpperCase() + descriptor.slice(1) + ".";
  return firstSentence(o.rationale);
}

/** "a dedicated video", "an integration". */
function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

function firstSentence(text: string | null): string {
  if (!text) return "";
  const cut = text.match(/^.*?[.!?](\s|$)/);
  return (cut ? cut[0] : text).trim();
}
