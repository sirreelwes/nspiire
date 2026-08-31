import Link from "next/link";
import type { DealState } from "@/lib/deals/stateMachine";
import { STATE_LABELS } from "@/lib/deals/labels";

/** Shared form styling for the deal pages — same look as /onboarding. */
export const field =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base " +
  "text-neutral-900 placeholder:text-neutral-400 outline-none " +
  "focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 " +
  "dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-300";
export const label =
  "block text-sm font-medium text-neutral-700 dark:text-neutral-300";
export const hint = "mt-1 text-xs text-neutral-500";
export const ghostBtn =
  "rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium " +
  "text-neutral-700 dark:border-neutral-700 dark:text-neutral-300";
export const primaryBtn =
  "rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white " +
  "disabled:opacity-50 dark:bg-white dark:text-neutral-900";

/** LOST is the only state worth colouring differently — it's the dead end. */
export function StateBadge({ state }: { state: DealState }) {
  const tone =
    state === "LOST"
      ? "border-neutral-300 text-neutral-500 dark:border-neutral-700"
      : state === "PAID"
        ? "border-emerald-400 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
        : "border-neutral-900 text-neutral-900 dark:border-neutral-300 dark:text-neutral-100";
  return (
    <span
      className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {STATE_LABELS[state]}
    </span>
  );
}

/** Server actions redirect back with ?error=… rather than throwing a 500. */
export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-6 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      {message}
    </p>
  );
}

export function NotConnected({ unreachable }: { unreachable?: boolean }) {
  return (
    <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {unreachable
        ? "Database unreachable, or the schema hasn't been migrated yet — run npx prisma migrate deploy."
        : "No DATABASE_URL set. Connect Postgres to work with deals."}
    </p>
  );
}

export function Crumb({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="text-sm text-neutral-500 underline underline-offset-4"
    >
      {children}
    </Link>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

export interface TermsDefaults {
  format: string;
  amount: string;
  usageDays: string;
  exclusivityDays: string;
  deliverables: string;
  notes: string;
}

/** Cents -> what belongs in the amount input. Blank when nothing is quoted. */
export function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/**
 * The terms editor. Shared by /deals/new and the deal page so both submit
 * exactly the field names `termsFromForm()` in actions.ts reads.
 */
export function TermsFields({
  formats,
  defaults,
}: {
  formats: string[];
  defaults?: TermsDefaults;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="format">
            Format
          </label>
          <input
            id="format"
            name="format"
            className={field}
            list="nspiire-deal-formats"
            placeholder="Dedicated video"
            defaultValue={defaults?.format}
          />
          <datalist id="nspiire-deal-formats">
            {formats.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <p className={hint}>Matches a rate-card row to get a floor price.</p>
        </div>
        <div>
          <label className={label} htmlFor="amount">
            Amount
          </label>
          <input
            id="amount"
            name="amount"
            className={field}
            inputMode="decimal"
            placeholder="$ per deliverable"
            defaultValue={defaults?.amount}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="usageDays">
            Usage rights (days)
          </label>
          <input
            id="usageDays"
            name="usageDays"
            className={field}
            inputMode="numeric"
            placeholder="Blank = not discussed"
            defaultValue={defaults?.usageDays}
          />
        </div>
        <div>
          <label className={label} htmlFor="exclusivityDays">
            Exclusivity (days)
          </label>
          <input
            id="exclusivityDays"
            name="exclusivityDays"
            className={field}
            inputMode="numeric"
            placeholder="Blank = not discussed"
            defaultValue={defaults?.exclusivityDays}
          />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="deliverables">
          Deliverables
        </label>
        <textarea
          id="deliverables"
          name="deliverables"
          rows={3}
          className={field}
          placeholder="1 x 60s dedicated, 2 stories, live within 3 weeks, 1 revision"
          defaultValue={defaults?.deliverables}
        />
      </div>
      <div>
        <label className={label} htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className={field}
          placeholder="Anything the next person needs to know"
          defaultValue={defaults?.notes}
        />
      </div>
    </div>
  );
}
