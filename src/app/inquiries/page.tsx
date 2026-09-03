import Link from "next/link";
import { Logo } from "@/components/Logo";
import { arch } from "@/components/Button";
import {
  BUDGET_BANDS,
  acknowledgement,
  type InquiryKind,
} from "@/lib/inquiries/schema";
import { submitInquiry } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The front door — the only way into this system that starts on someone else's
 * side. Public, unauthenticated, and deliberately plain.
 *
 * One form, two audiences. A brand asking to work with a creator and a creator
 * asking to be represented want to say different things, but they need the same
 * table, the same abuse defences and the same triage queue, so they share a
 * page and differ only in copy and one field.
 *
 * Notably absent: a roster. A brand cannot pick a creator from a list here,
 * because who Nspiire represents is not public information — it belongs to the
 * creators, not the marketing page. They describe who they are after, and a
 * human matches it.
 */

const field =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base " +
  "text-neutral-900 placeholder:text-neutral-400 outline-none " +
  "focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 " +
  "dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-300";
const labelClass =
  "block text-sm font-medium text-neutral-700 dark:text-neutral-300";
const hint = "mt-1 text-xs text-neutral-500";

const COPY: Record<
  InquiryKind,
  { title: string; blurb: string; companyLabel: string; messageLabel: string; placeholder: string }
> = {
  BRAND: {
    title: "Work with a creator",
    blurb:
      "Tell us who you're trying to reach and we'll come back with creators who fit — or say so if we haven't got the right one.",
    companyLabel: "Brand",
    messageLabel: "What are you looking for?",
    placeholder:
      "The kind of creator, the audience you want, the format you had in mind, and roughly when.",
  },
  CREATOR: {
    title: "Get represented",
    blurb:
      "We're taking on creators slowly and by hand. Tell us where you post and what you're stuck on.",
    companyLabel: "Your main handle",
    messageLabel: "Tell us about you",
    placeholder:
      "Where you post, roughly how big, what you charge now, and what you want an agent to take off your plate.",
  },
};

export default async function InquiriesPage(props: PageProps<"/inquiries">) {
  const { as, sent, error } = await props.searchParams;
  const kind: InquiryKind = as === "creator" ? "CREATOR" : "BRAND";
  const copy = COPY[kind];
  const other: InquiryKind = kind === "BRAND" ? "CREATOR" : "BRAND";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:py-16">
      <Link href="/" aria-label="Nspiire home" className="inline-block">
        <Logo size={22} />
      </Link>

      {sent === "1" ? (
        <>
          <h1 className="mt-10 text-2xl font-semibold tracking-tight sm:text-3xl">
            Got it.
          </h1>
          <p className="mt-3 text-neutral-500">{acknowledgement(kind)}</p>
          <Link href="/" className={`${arch("secondary", "md")} mt-8`}>
            Back to Nspiire
          </Link>
        </>
      ) : (
        <>
          <h1 className="mt-10 text-2xl font-semibold tracking-tight sm:text-3xl">
            {copy.title}
          </h1>
          <p className="mt-3 text-neutral-500">{copy.blurb}</p>

          {typeof error === "string" && error && (
            <p
              role="alert"
              className="mt-6 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <form action={submitInquiry} className="mt-10 flex flex-col gap-5">
            <input type="hidden" name="kind" value={kind} />

            {/* Honeypot. Hidden from people and from screen readers; anything
                that arrives in it came from something filling every input. */}
            <div aria-hidden="true" className="hidden">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="name">
                  Your name
                </label>
                <input id="name" name="name" className={field} required autoComplete="name" />
              </div>
              <div>
                <label className={labelClass} htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  className={field}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="company">
                {copy.companyLabel}
              </label>
              <input id="company" name="company" className={field} autoComplete="organization" />
            </div>

            {kind === "BRAND" && (
              <div>
                <label className={labelClass} htmlFor="budgetBand">
                  Rough budget
                </label>
                <select id="budgetBand" name="budgetBand" className={field} defaultValue={BUDGET_BANDS[0]}>
                  {BUDGET_BANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <p className={hint}>
                  A range is fine, and it isn&apos;t an offer — it just tells us
                  which creators to put in front of you.
                </p>
              </div>
            )}

            <div>
              <label className={labelClass} htmlFor="message">
                {copy.messageLabel}
              </label>
              <textarea
                id="message"
                name="message"
                rows={5}
                required
                maxLength={4000}
                className={field}
                placeholder={copy.placeholder}
              />
            </div>

            <button type="submit" className={`${arch("primary", "lg")} self-start`}>
              Send
            </button>
          </form>

          <p className="mt-10 text-sm text-neutral-500">
            {kind === "BRAND" ? "A creator, not a brand? " : "Here for a creator instead? "}
            <Link
              href={`/inquiries?as=${other.toLowerCase()}`}
              className="underline underline-offset-4"
            >
              {kind === "BRAND" ? "Ask about representation" : "Work with a creator"}
            </Link>
            .
          </p>
        </>
      )}

      <footer className="mt-16 border-t border-neutral-200 pt-8 text-sm text-neutral-500 dark:border-neutral-800">
        <Link href="/terms" className="underline underline-offset-4">
          Terms
        </Link>
        <span className="px-2">·</span>
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy
        </Link>
        <p className="mt-4 text-xs text-neutral-400">VerMar Design LLC</p>
      </footer>
    </main>
  );
}
