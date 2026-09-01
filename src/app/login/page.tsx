import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { operatorGateConfigured } from "@/lib/auth/operator";
import { signIn } from "./actions";

export const dynamic = "force-dynamic";

/** The console is not public. This is the only way in. */
export default async function LoginPage(props: PageProps<"/login">) {
  const { error, next } = await props.searchParams;
  const target = typeof next === "string" ? next : "/dashboard";
  const configured = operatorGateConfigured();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-16">
      <Link href="/" aria-label="Nspiire home" className="inline-block self-start">
        <LogoMark size={34} />
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Operator sign in</h1>
      <p className="mt-3 text-base leading-snug text-neutral-500">
        The console — creators, deals and approvals — is private.
      </p>

      {!configured && (
        <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-base text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          No operator password is set, so nobody can sign in. Set
          {" "}
          <code className="font-mono">NSPIIRE_OPERATOR_PASSWORD</code> and redeploy.
        </p>
      )}

      {error === "denied" && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          That password is not right.
        </p>
      )}

      <form action={signIn} className="mt-8 flex flex-col gap-4">
        <input type="hidden" name="next" value={target} />
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            disabled={!configured}
            className="rounded-xl border border-neutral-300 px-4 py-3.5 text-base disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <button
          type="submit"
          disabled={!configured}
          className="rounded-xl border border-transparent bg-neutral-900 px-5 py-3.5 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
