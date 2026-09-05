import Link from "next/link";
import { Logo } from "@/components/Logo";
import { arch } from "@/components/Button";

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
        {/* The two audiences this page actually has. The operator console used
            to sit here, which gave a one-person internal login equal billing
            with the product — and told every visitor where the back door is.
            It lives at /login and is bookmarked, not advertised. */}
        <Link
          href="/creator/login"
          className={arch("primary", "lg")}
        >
          Creator sign in
        </Link>
        <Link
          href="/brand/apply"
          className={arch("secondary", "lg")}
        >
          For brands
        </Link>
      </div>

      {/* A hairline in the accent — the only colour on the page besides the
          mark, and the thing that makes it read as finished rather than bare. */}
      <div
        className="mt-16 h-px w-16"
        style={{ background: "var(--logo-accent)" }}
      />

      {/* What the product does, in the creator's terms — not the deal state
          machine, which is the operator's business. */}
      <section className="mt-16 w-full max-w-md">
        <p className="text-lg leading-snug text-neutral-500">
          Iris finds the brands, writes the pitch, holds the line on your
          rate, and reads every contract. You approve every word before it
          goes, and nothing moves without you.
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
