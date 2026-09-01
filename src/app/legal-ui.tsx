import Link from "next/link";
import { Logo } from "@/components/Logo";

/** Shared chrome for the legal pages. Plain, readable, no marketing. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-14">
      <Link href="/" aria-label="Nspiire home" className="inline-block">
        <Logo size={22} />
      </Link>
      <h1 className="mt-10 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-neutral-500">Last updated {updated}</p>
      <div className="mt-10 flex flex-col gap-8">{children}</div>
      <p className="mt-14 border-t border-neutral-200 pt-6 text-sm text-neutral-500 dark:border-neutral-800">
        <Link href="/terms" className="underline underline-offset-4">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
      </p>
    </main>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
        {heading}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        {children}
      </div>
    </section>
  );
}
