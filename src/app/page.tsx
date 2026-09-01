import Link from "next/link";
import { Logo } from "@/components/Logo";

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

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <h1>
        <Logo size={40} />
      </h1>
      <p className="mt-4 text-neutral-500">
        Your AI agent. Fire your manager, keep the 20%.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/onboarding"
          className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Set up your agent
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
        >
          Dashboard
        </Link>
      </div>

      <section className="mt-12">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
          Deal pipeline
        </h2>
        <ol className="mt-4 flex flex-wrap gap-2">
          {PIPELINE.map((stage) => (
            <li
              key={stage}
              className="rounded-full border border-neutral-300 px-3 py-1 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              {stage}
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-neutral-500">
          No deals yet. Scout is warming up.
        </p>
      </section>

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-sm text-neutral-500 dark:border-neutral-800">
        <Link href="/terms" className="underline underline-offset-4">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
      </footer>
    </main>
  );
}
