import { IrisGreeting } from "@/components/Iris";
import { SubmitButton } from "@/components/SubmitButton";
import { SUGGESTED_FORMATS } from "@/lib/creators/onboarding";
import { completeCreatorProfile } from "./actions";

const field =
  "rounded-xl border border-neutral-300 px-4 py-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900";

const MESSAGES: Record<string, string> = {
  missing: "I need what you make, your handle and your follower count to start.",
  rate: "I need a format and what you charge for it.",
};

/**
 * First-run setup, shown instead of the dashboard until the profile is usable.
 *
 * "Usable" means Scout and the terms advisor can actually run: Scout scores
 * fit on niche, size and offered format, and the advisor prices off the rate
 * card. That is four answers. The form used to ask nine on one screen — floor,
 * usage window, exclusivity window, blocked categories — before the creator
 * had seen a single brand, which is a contract negotiation as a welcome mat.
 *
 * Those five still exist, behind one press, with the defaults spelled out so
 * leaving them alone is a decision rather than an omission. completeCreatorProfile
 * already fills them in when blank; nothing here changed what is stored.
 */
export function CreatorSetupForm({
  name,
  error,
}: {
  name: string;
  error?: string;
}) {
  const firstName = name.split(" ")[0];
  return (
    <>
      <IrisGreeting>
        <p>
          Hi {firstName}, I&apos;m Iris.{" "}
          <span className="text-neutral-500">
            Four things and I can start looking for brands.
          </span>
        </p>
      </IrisGreeting>

      {error && MESSAGES[error] && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {MESSAGES[error]}
        </p>
      )}

      <form action={completeCreatorProfile} className="mt-10 flex flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className="text-lg font-medium">What do you make?</span>
          <input
            name="niche"
            required
            autoFocus
            placeholder="Wine tasting, Napa Valley, travel"
            className={field}
          />
          <span className="text-sm text-neutral-500">
            Plain words. This is what I match brands against.
          </span>
        </label>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-lg font-medium">Your TikTok handle</span>
            <input name="handle" required placeholder="wine.blind" className={field} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-lg font-medium">Followers</span>
            <input
              name="followerCount"
              required
              inputMode="numeric"
              placeholder="925000"
              className={field}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-lg font-medium">What you charge</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="rate"
              required
              inputMode="decimal"
              placeholder="5000"
              aria-label="Your rate in dollars"
              className={field}
            />
            <select
              name="format"
              required
              aria-label="For which format"
              className={field}
              defaultValue="Dedicated video"
            >
              {SUGGESTED_FORMATS.map((f) => (
                <option key={f} value={f}>
                  for a {f.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <span className="text-sm text-neutral-500">
            In dollars. This is what I open with. You can add other formats
            later.
          </span>
        </div>

        {/* The negotiation rules. Closed by default, defaults stated, so a
            creator who never opens this still knows what Iris will do. */}
        <details className="rounded-xl border border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <summary className="cursor-pointer text-base text-neutral-600 dark:text-neutral-300">
            Rules for me to negotiate by{" "}
            <span className="text-neutral-500">
              — optional. Until you set them: I won&apos;t go below half your
              rate, 30 days of usage, no exclusivity, nothing off limits.
            </span>
          </summary>

          <div className="mt-5 flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-base font-medium">Lowest you&apos;d take</span>
              <input name="floor" inputMode="decimal" placeholder="Half your rate" className={field} />
              <span className="text-sm text-neutral-500">
                I never agree below this without asking you.
              </span>
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-base font-medium">Usage rights (days)</span>
                <input name="maxUsageDays" inputMode="numeric" defaultValue="30" className={field} />
                <span className="text-sm text-neutral-500">
                  How long a brand may run your video in their own channels.
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
              <input name="doNotWorkWith" placeholder="gambling, vaping" className={field} />
              <span className="text-sm text-neutral-500">
                Comma separated. I will never suggest these. It&apos;s a rule,
                not a preference.
              </span>
            </label>
          </div>
        </details>

        <SubmitButton pending="Saving…" className="mt-2 self-start">
          That&apos;s enough to start
        </SubmitButton>
      </form>
    </>
  );
}
