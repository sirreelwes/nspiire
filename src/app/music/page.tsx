import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { SubmitButton } from "@/components/SubmitButton";
import { brandApply } from "@/app/brand/actions";
import { SoundBriefFields } from "@/app/brand/sound-brief-fields";

export const dynamic = "force-dynamic";

const field =
  "rounded-xl border border-neutral-300 px-4 py-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900";

const MESSAGES: Record<string, string> = {
  missing: "The company name and your name are both needed.",
  email: "Enter a valid work email.",
  short: "Use at least 12 characters.",
  exists: "You're already on the list with that email — sign in instead.",
  track: "I need the artist's name and a link to the song.",
};

/**
 * The door for artist management and labels.
 *
 * Artists never book this themselves; their managers do, for several artists
 * and several songs over time. So the account is the company, and the first
 * song comes in with the sign-up as a brief. Same account model as a brand,
 * same interest list, same consent rule on the creator's side. What differs
 * is the brief: a manager seeding a song sends a link, a one-line feeling, a
 * posting window and a count, and pays by the video.
 */
export default async function MusicPage(props: PageProps<"/music">) {
  const { error } = await props.searchParams;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      <Link href="/" aria-label="Nspiire home page" className="inline-block">
        <LogoMark size={34} />
      </Link>

      <p className="mt-8 text-sm font-medium uppercase tracking-[0.16em] text-neutral-400">
        For managers and labels
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        Get your artist&apos;s song into creators&apos; videos
      </h1>
      <p className="mt-3 text-base leading-snug text-neutral-500">
        Send me the song and the feeling. I&apos;ll find creators whose
        everyday videos fit it, they say yes or no themselves, and you get one
        price for the whole wave and one invoice. Creators set their own
        rates, and you see the total before anything is booked. Add more
        artists and songs any time after this.
      </p>

      {typeof error === "string" && MESSAGES[error] && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {MESSAGES[error]}
        </p>
      )}

      <form action={brandApply} className="mt-8 flex flex-col gap-4">
        <input type="hidden" name="kind" value="MUSIC" />

        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Management company or label</span>
          <input name="companyName" required autoFocus className={field} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Your name</span>
          <input name="contactName" required className={field} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Work email</span>
          <input name="email" type="email" autoComplete="username" required className={field} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Website</span>
          <input name="website" placeholder="https://" className={field} />
        </label>

        <p className="mt-4 text-sm font-medium uppercase tracking-wide text-neutral-400">
          The first song
        </p>
        <SoundBriefFields />

        <label className="mt-2 flex flex-col gap-2">
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
