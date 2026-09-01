import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { arch } from "@/components/Button";
import { creatorSignIn } from "../actions";

export const dynamic = "force-dynamic";

const field =
  "rounded-xl border border-neutral-300 px-4 py-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900";

/** A creator's own sign-in. Not the operator console — see /login for that. */
export default async function CreatorLoginPage(
  props: PageProps<"/creator/login">,
) {
  const { error } = await props.searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-16">
      <Link href="/" aria-label="Nspiire home page" className="self-start">
        <LogoMark size={34} />
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-3 text-base leading-snug text-neutral-500">
        Your deals, your numbers, and anything waiting on your approval.
      </p>

      {error === "denied" && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          That email and password don&apos;t match an active account.
        </p>
      )}

      <form action={creatorSignIn} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            className={field}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={field}
          />
        </label>
        <button type="submit" className={arch("primary", "md", "mt-2 w-full")}>
          Sign in
        </button>
      </form>

      <p className="mt-8 text-sm text-neutral-500">
        No account yet? Nspiire is invite-only while we onboard our first
        creators — your invite link comes from your manager.
      </p>
    </main>
  );
}
