import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { arch } from "@/components/Button";
import { brandSignIn } from "../actions";

export const dynamic = "force-dynamic";

const field =
  "rounded-xl border border-neutral-300 px-4 py-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900";

export default async function BrandLoginPage(
  props: PageProps<"/brand/login">,
) {
  const { error } = await props.searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-16">
      <Link href="/" aria-label="Nspiire home page" className="self-start">
        <LogoMark size={34} />
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Brand sign in</h1>

      {error === "denied" && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          That email and password don&apos;t match an account.
        </p>
      )}

      <form action={brandSignIn} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Email</span>
          <input name="email" type="email" autoComplete="username" required autoFocus className={field} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Password</span>
          <input name="password" type="password" autoComplete="current-password" required className={field} />
        </label>
        <button type="submit" className={arch("primary", "md", "mt-2 w-full")}>
          Sign in
        </button>
      </form>

      <p className="mt-8 text-sm text-neutral-500">
        No account?{" "}
        <Link href="/brand/apply" className="underline underline-offset-4">
          Apply for the roster
        </Link>
        .
      </p>
    </main>
  );
}
