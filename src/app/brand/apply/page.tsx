import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { arch } from "@/components/Button";
import { brandApply } from "../actions";

export const dynamic = "force-dynamic";

const field =
  "rounded-xl border border-neutral-300 px-4 py-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900";

const MESSAGES: Record<string, string> = {
  missing: "Company and contact name are both needed.",
  email: "Enter a valid work email.",
  short: "Use at least 12 characters.",
  exists: "There's already an account with that email — sign in instead.",
};

/** Brands apply for themselves. An operator decides whether they get in. */
export default async function BrandApplyPage(
  props: PageProps<"/brand/apply">,
) {
  const { error } = await props.searchParams;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      <Link href="/" aria-label="Nspiire home page" className="inline-block">
        <LogoMark size={34} />
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">
        Apply for the roster
      </h1>
      <p className="mt-3 text-base leading-snug text-neutral-500">
        $100 a month for access to Nspiire&apos;s creators. Applications are
        reviewed by hand — you can create an account now and we&apos;ll come
        back to you.
      </p>

      {typeof error === "string" && MESSAGES[error] && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-base text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {MESSAGES[error]}
        </p>
      )}

      <form action={brandApply} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Company</span>
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
        <button type="submit" className={arch("primary", "md", "mt-2 w-full")}>
          Apply
        </button>
      </form>

      <p className="mt-8 text-sm text-neutral-500">
        Already applied?{" "}
        <Link href="/brand/login" className="underline underline-offset-4">
          Sign in
        </Link>
        .
      </p>
    </main>
  );
}
