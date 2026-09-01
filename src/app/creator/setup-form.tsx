import { arch } from "@/components/Button";
import { SUGGESTED_FORMATS } from "@/lib/creators/onboarding";
import { completeCreatorProfile } from "./actions";

const field =
  "rounded-xl border border-neutral-300 px-4 py-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900";

const MESSAGES: Record<string, string> = {
  missing: "Niche, handle and follower count are all needed.",
  rate: "Add a format and what you charge for it.",
};

/**
 * First-run setup, shown instead of the dashboard until the profile is usable.
 *
 * "Usable" means Scout and the terms advisor can actually run: Scout scores fit
 * on niche, size and offered formats, and the advisor prices off the rate card
 * and floor. Without these the account is an empty shell that produces nothing,
 * so there is no point showing an empty dashboard instead.
 */
export function CreatorSetupForm({
  name,
  error,
}: {
  name: string;
  error?: string;
}) {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Welcome, {name.split(" ")[0]}
      </h1>
      <p className="mt-3 text-lg leading-snug text-neutral-500">
        A few things about your work, so your agent knows what to look for and
        what to charge.
      </p>

      {error && MESSAGES[error] && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {MESSAGES[error]}
        </p>
      )}

      <form action={completeCreatorProfile} className="mt-8 flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">What do you make?</span>
          <input
            name="niche"
            required
            autoFocus
            placeholder="Wine tasting, Napa Valley, travel"
            className={field}
          />
          <span className="text-sm text-neutral-500">
            Plain words. This is what your agent matches brands against.
          </span>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium">TikTok handle</span>
            <input name="handle" required placeholder="wine.blind" className={field} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium">Followers</span>
            <input
              name="followerCount"
              required
              inputMode="numeric"
              placeholder="925000"
              className={field}
            />
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium">You make</span>
            <select name="format" required className={field} defaultValue="Dedicated video">
              {SUGGESTED_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium">Your rate</span>
            <input name="rate" required inputMode="decimal" placeholder="5000" className={field} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium">Lowest you&apos;d take</span>
            <input name="floor" inputMode="decimal" placeholder="2500" className={field} />
          </label>
        </div>
        <p className="-mt-2 text-sm text-neutral-500">
          In dollars. Your agent never agrees below the floor without asking you.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium">Usage rights (days)</span>
            <input name="maxUsageDays" inputMode="numeric" defaultValue="30" className={field} />
            <span className="text-sm text-neutral-500">
              How long a brand may run your content.
            </span>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium">Exclusivity (days)</span>
            <input name="maxExclusivityDays" inputMode="numeric" defaultValue="0" className={field} />
            <span className="text-sm text-neutral-500">
              How long you&apos;d sit out their category. 0 for none.
            </span>
          </label>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Won&apos;t work with</span>
          <input
            name="doNotWorkWith"
            placeholder="gambling, vaping"
            className={field}
          />
          <span className="text-sm text-neutral-500">
            Comma separated. Your agent will never suggest these — it&apos;s an
            absolute rule, not a preference.
          </span>
        </label>

        <button type="submit" className={arch("primary", "md", "mt-2 self-start")}>
          Save and see my dashboard
        </button>
      </form>
    </>
  );
}
