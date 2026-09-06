import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { arch } from "@/components/Button";
import { SubmitButton } from "@/components/SubmitButton";
import { IrisGreeting } from "@/components/Iris";
import { prisma } from "@/lib/prisma";
import { requireBrandAccount } from "@/lib/auth/brand";
import { addSoundBrief, brandSignOut } from "./actions";
import { SoundBriefFields } from "./sound-brief-fields";

export const dynamic = "force-dynamic";

/**
 * Where a brand, or a manager, lands. Signing in and being a member are
 * different things, so this page exists for the state in between: applied,
 * waiting, or turned down. A manager also keeps their songs here, because
 * they book for several artists over time and the sign-up only took the
 * first one.
 */
export default async function BrandHomePage(props: PageProps<"/brand">) {
  const account = await requireBrandAccount();
  const { error } = await props.searchParams;
  const music = account.kind === "MUSIC";
  const briefs = music
    ? await prisma.soundBrief.findMany({
        where: { brandAccountId: account.id },
        include: { _count: { select: { interests: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:py-14">
      <header className="mb-10 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link href="/" aria-label="Nspiire home page" className="shrink-0">
          <LogoMark size={34} />
        </Link>
        <form action={brandSignOut} className="ml-auto">
          <button type="submit" className="text-base text-neutral-500 underline underline-offset-4">
            Sign out
          </button>
        </form>
      </header>

      {account.membership === "ACTIVE" ? (
        <>
          <IrisGreeting>
            <p>
              Hi {account.contactName.split(" ")[0]}, you&apos;re in.{" "}
              <span className="text-neutral-500">
                {music
                  ? "Pick a song and have a look at whose videos it belongs in."
                  : "Have a look at who's on the roster."}
              </span>
            </p>
          </IrisGreeting>
          <div className="mt-8">
            <Link href="/brand/roster" className={arch("primary", "md")}>
              Browse the roster
            </Link>
          </div>
          <p className="mt-8 text-base leading-snug text-neutral-500">
            You can tell me which creators interest you. I&apos;ll pass it on —
            they decide whether to open a conversation, and nothing reaches them
            until they do.
          </p>
        </>
      ) : account.membership === "DECLINED" ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">
            Not a fit right now
          </h1>
          <p className="mt-3 text-base leading-snug text-neutral-500">
            {account.decisionNote ||
              "We're not able to take this on at the moment. Reply to the email you signed up with if you think that's wrong."}
          </p>
        </>
      ) : account.membership === "CANCELLED" ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">
            Membership ended
          </h1>
          <p className="mt-3 text-base leading-snug text-neutral-500">
            {account.companyName}&apos;s access has been closed. Get in touch if
            you&apos;d like it back.
          </p>
        </>
      ) : (
        <>
          <IrisGreeting>
            <p>
              Hi {account.contactName.split(" ")[0]}, you&apos;re on the list.{" "}
              <span className="text-neutral-500">
                I&apos;ll come to you at {account.email} when I have{" "}
                {music
                  ? "creators whose videos fit your songs."
                  : "a creator who fits what you described."}
              </span>
            </p>
          </IrisGreeting>
          <dl className="mt-10 grid gap-4 text-base sm:grid-cols-2">
            <div>
              <dt className="text-sm text-neutral-500">Company</dt>
              <dd className="mt-1 font-medium">{account.companyName}</dd>
            </div>
            <div>
              <dt className="text-sm text-neutral-500">Joined</dt>
              <dd className="mt-1 font-medium">
                {account.appliedAt.toISOString().slice(0, 10)}
              </dd>
            </div>
            {account.lookingFor && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-neutral-500">Looking for</dt>
                <dd className="mt-1">{account.lookingFor}</dd>
              </div>
            )}
            {account.budgetRange && (
              <div>
                <dt className="text-sm text-neutral-500">Budget</dt>
                <dd className="mt-1 font-medium">{account.budgetRange}</dd>
              </div>
            )}
            {account.timing && (
              <div>
                <dt className="text-sm text-neutral-500">Timing</dt>
                <dd className="mt-1 font-medium">{account.timing}</dd>
              </div>
            )}
          </dl>
          {!music && (
            <p className="mt-8 text-base leading-snug text-neutral-500">
              There&apos;s nothing to pay, and nothing to do. If that ever
              changes we&apos;ll tell you first.
            </p>
          )}
        </>
      )}

      {/* The songs. Kept on the account page in every membership state, so a
          manager on the list can line up the next release while they wait. */}
      {music && account.membership !== "DECLINED" && account.membership !== "CANCELLED" && (
        <section className="mt-12">
          <h2 className="text-base font-medium uppercase tracking-wide text-neutral-400">
            Your songs
          </h2>
          <ul className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {briefs.length === 0 && (
              <li className="px-5 py-4 text-base text-neutral-500">No songs yet.</li>
            )}
            {briefs.map((b) => (
              <li key={b.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-lg font-medium">{b.artistName}</span>
                  <span className="text-sm text-neutral-500">
                    {b._count.interests === 0
                      ? "No asks yet"
                      : `${b._count.interests} creator${b._count.interests === 1 ? "" : "s"} asked`}
                  </span>
                </div>
                <p className="mt-1 break-all text-sm">
                  <a href={b.trackUrl} className="underline underline-offset-4" rel="noreferrer">
                    {b.trackUrl}
                  </a>
                </p>
                <p className="mt-1 text-base text-neutral-500">
                  {[
                    b.mood ? `“${b.mood}”` : null,
                    b.videosWanted != null ? `${b.videosWanted} video${b.videosWanted === 1 ? "" : "s"}` : null,
                    b.postingWindow,
                    b.budgetRange,
                    b.releaseDate,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>

          <details className="mt-4 rounded-xl border border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <summary className="cursor-pointer text-base text-neutral-600 dark:text-neutral-300">
              Add a song
            </summary>
            {error === "track" && (
              <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                I need the artist&apos;s name and a link to the song.
              </p>
            )}
            <form action={addSoundBrief} className="mt-4 flex flex-col gap-4">
              <SoundBriefFields compact />
              <SubmitButton pending="Adding…" className="self-start">
                Add this song
              </SubmitButton>
            </form>
          </details>
        </section>
      )}
    </main>
  );
}
