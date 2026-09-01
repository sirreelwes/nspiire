import Link from "next/link";
import { Logo } from "@/components/Logo";
import { arch } from "@/components/Button";

/** The happy path, in order — the shape of the thing the agent runs. */
const PIPELINE = [
  "Pitched",
  "Negotiating",
  "Terms agreed",
  "Contract sent",
  "Signed",
  "In production",
  "Delivered",
  "Invoiced",
  "Paid",
] as const;

/**
 * Built mobile-first: nearly every creator arrives on a phone. The wordmark
 * spans the screen, actions are full-width thumb targets, and everything is
 * centred on one axis so there is a single line to read down.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-4 py-14 text-center sm:py-20">
      <h1 className="-mx-4 self-stretch">
        <Logo fluid />
      </h1>

      <p className="mt-7 text-2xl leading-snug text-neutral-500 sm:text-3xl">
        This is a big deal.
      </p>

      {/* Full-width on a phone so they are thumb targets, not links. */}
      <div className="mt-10 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
        {/* Creators are who lands here, so the primary action is THEIR sign-in.
            "Set up your agent" used to point at /onboarding, which is
            operator-gated — a creator clicking it hit Wes's login. Nspiire is
            invite-only, so there is no self-signup to offer yet. */}
        <Link
          href="/creator/login"
          className={arch("primary", "lg")}
        >
          Sign in
        </Link>
        <Link
          href="/login"
          className={arch("secondary", "lg")}
        >
          Operator console
        </Link>
      </div>

      {/* A hairline in the accent — the only colour on the page besides the
          mark, and the thing that makes it read as finished rather than bare. */}
      <div
        className="mt-16 h-px w-16"
        style={{ background: "var(--logo-accent)" }}
      />

      <section className="mt-16 w-full">
        <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
          Deal pipeline
        </h2>
        <ol className="mt-5 flex flex-wrap justify-center gap-2">
          {PIPELINE.map((stage) => (
            <li
              key={stage}
              className="rounded-full border border-neutral-300 px-4 py-2 text-base text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              {stage}
            </li>
          ))}
        </ol>
        <p className="mt-8 text-lg leading-snug text-neutral-500">
          Every move between these is logged. That log is what the terms advisor
          learns from.
        </p>
      </section>

      <footer className="mt-20 w-full border-t border-neutral-200 pt-8 text-base text-neutral-500 dark:border-neutral-800">
        <Link href="/terms" className="underline underline-offset-4">
          Terms
        </Link>
        <span className="px-2">·</span>
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy
        </Link>
        <p className="mt-4 text-xs text-neutral-400">
          VerMar Design LLC
        </p>
      </footer>
    </main>
  );
}
