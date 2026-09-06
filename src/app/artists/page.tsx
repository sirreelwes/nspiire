import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { SubmitButton } from "@/components/SubmitButton";
import { brandApply } from "@/app/brand/actions";

export const dynamic = "force-dynamic";

const field =
  "rounded-xl border border-neutral-300 px-4 py-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900";

const MESSAGES: Record<string, string> = {
  missing: "The artist or label name and your name are both needed.",
  email: "Enter a valid work email.",
  short: "Use at least 12 characters.",
  exists: "You're already on the list with that email — sign in instead.",
  track: "I need a link to the song.",
};

/**
 * The artists' door.
 *
 * Same account model as a brand, same interest list, same consent rule on the
 * creator's side. What differs is the brief. A manager seeding a song does not
 * send a campaign deck: they send a sound link, a one-line feeling, a posting
 * window and a count, and pay by the video. So that is what this asks for,
 * and it says nothing about "campaigns" or "activations".
 */
export default async function ArtistsPage(props: PageProps<"/artists">) {
  const { error } = await props.searchParams;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      <Link href="/" aria-label="Nspiire home page" className="inline-block">
        <LogoMark size={34} />
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">
        Get your song into creators&apos; videos
      </h1>
      <p className="mt-3 text-base leading-snug text-neutral-500">
        Tell me the song and the feeling. I&apos;ll find creators whose
        everyday videos fit it, they say yes or no themselves, and you get one
        price for the whole wave and one invoice. Creators set their own rates;
        I&apos;ll tell you what it costs before you commit to anything.
      </p>

      {typeof error === "string" && MESSAGES[error] && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {MESSAGES[error]}
        </p>
      )}

      <form action={brandApply} className="mt-8 flex flex-col gap-4">
        <input type="hidden" name="kind" value="ARTIST" />

        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Artist or label</span>
          <input name="companyName" required autoFocus className={field} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Your name</span>
          <input name="contactName" required className={field} />
          <span className="text-sm text-neutral-500">Manager, label, or the artist. Whoever I should talk to.</span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Work email</span>
          <input name="email" type="email" autoComplete="username" required className={field} />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">The song</span>
          <input
            name="trackUrl"
            inputMode="url"
            required
            placeholder="TikTok sound, Spotify or SoundCloud link"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">The feeling, in one line</span>
          <input
            name="mood"
            placeholder="Main-character energy. Late drive home. Getting ready."
            className={field}
          />
          <span className="text-sm text-neutral-500">
            This is what I match creators against. The less you script, the
            better the videos land.
          </span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Whose videos should it be in?</span>
          <textarea
            name="lookingFor"
            rows={2}
            placeholder="Fitness, get-ready-with-me, study-with-me. Not music accounts."
            className={field}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium">How many videos</span>
            <input name="videosWanted" inputMode="numeric" placeholder="20" className={field} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium">Posting window</span>
            <input name="postingWindow" placeholder="Oct 3–10" className={field} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium">Budget for the wave</span>
            <input name="budgetRange" placeholder="$2k–$5k" className={field} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium">Release date</span>
            <input name="timing" placeholder="Out now, or Oct 1" className={field} />
          </label>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            className={field}
          />
          <span className="text-sm text-neutral-500">At least 12 characters.</span>
        </label>

        <SubmitButton pending="Adding you…" className="mt-2 w-full">
          Send me the song
        </SubmitButton>
      </form>

      <p className="mt-8 text-sm text-neutral-500">
        There&apos;s nothing to pay to join. Creators are paid per video, at
        rates they set, and you see the total before anything is booked.
      </p>
      <p className="mt-3 text-sm text-neutral-500">
        Already on the list?{" "}
        <Link href="/brand/login" className="underline underline-offset-4">
          Sign in
        </Link>
        .
      </p>
    </main>
  );
}
