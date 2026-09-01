import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { arch } from "@/components/Button";
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

        {/*
          A password-only form gives a password manager nothing to key on, so
          it either refuses to save or saves under a blank username. There is
          exactly one operator, so the username is fixed and read-only — it
          exists to be autofilled and stored, not chosen. autoComplete
          "username" is what pairs it with the password field below.
        */}
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Username</span>
          <input
            name="username"
            type="text"
            autoComplete="username"
            value="operator"
            readOnly
            tabIndex={-1}
            aria-describedby="username-hint"
            className="rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-3.5 text-base text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span id="username-hint" className="text-sm text-neutral-500">
            There is one operator account. Save this with your password.
          </span>
        </label>

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
          className={arch("primary", "md", "disabled:opacity-50")}
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
