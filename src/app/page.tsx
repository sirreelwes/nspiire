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
      <h1 className="text-3xl font-semibold tracking-tight">Nspiire</h1>
      <p className="mt-2 text-neutral-500">
        Your AI agent. Fire your manager, keep the 20%.
      </p>

      <section className="mt-10">
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
    </main>
  );
}
