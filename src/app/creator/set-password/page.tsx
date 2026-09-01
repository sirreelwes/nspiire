import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { arch } from "@/components/Button";
import { prisma } from "@/lib/prisma";
import { setCreatorPassword } from "../actions";

export const dynamic = "force-dynamic";

const field =
  "rounded-xl border border-neutral-300 px-4 py-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900";

const MESSAGES: Record<string, string> = {
  short: "Use at least 12 characters.",
  mismatch: "Those two passwords don't match.",
  invalid: "That invite link has expired or has already been used.",
};

/** Invite acceptance. The token is single-use and expires after 7 days. */
export default async function SetPasswordPage(
  props: PageProps<"/creator/set-password">,
) {
  const { token: rawToken, error } = await props.searchParams;
  const token = typeof rawToken === "string" ? rawToken : "";

  // Look the token up before rendering, so a dead link says so immediately
  // rather than after the creator has chosen a password.
  const creator = token
    ? await prisma.creator.findUnique({
        where: { inviteToken: token },
        select: { name: true, email: true, inviteTokenExpiresAt: true },
      })
    : null;
  const live =
    creator?.inviteTokenExpiresAt != null &&
    creator.inviteTokenExpiresAt.getTime() > Date.now();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-16">
      <Link href="/" aria-label="Nspiire home page" className="self-start">
        <LogoMark size={34} />
      </Link>

      {!live ? (
        <>
          <h1 className="mt-8 text-3xl font-semibold tracking-tight">
            This link is no longer valid
          </h1>
          <p className="mt-3 text-base leading-snug text-neutral-500">
            Invite links last seven days and can only be used once. Ask your
            manager for a new one.
          </p>
          <Link href="/creator/login" className={arch("secondary", "md", "mt-8 self-start")}>
            Go to sign in
          </Link>
        </>
      ) : (
        <>
          <h1 className="mt-8 text-3xl font-semibold tracking-tight">
            Welcome, {creator!.name.split(" ")[0]}
          </h1>
          <p className="mt-3 text-base leading-snug text-neutral-500">
            Choose a password for {creator!.email}.
          </p>

          {typeof error === "string" && MESSAGES[error] && (
            <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {MESSAGES[error]}
            </p>
          )}

          <form action={setCreatorPassword} className="mt-8 flex flex-col gap-4">
            <input type="hidden" name="token" value={token} />
            <input
              type="hidden"
              name="email"
              value={creator!.email}
              autoComplete="username"
            />
            <label className="flex flex-col gap-2">
              <span className="text-base font-medium">Password</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                autoFocus
                className={field}
              />
              <span className="text-sm text-neutral-500">
                At least 12 characters.
              </span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-base font-medium">Confirm password</span>
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                className={field}
              />
            </label>
            <button type="submit" className={arch("primary", "md", "mt-2 w-full")}>
              Set password and sign in
            </button>
          </form>
        </>
      )}
    </main>
  );
}
