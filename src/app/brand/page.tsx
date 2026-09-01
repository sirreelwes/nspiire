import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { arch } from "@/components/Button";
import { IrisGreeting } from "@/components/Iris";
import { requireBrandAccount } from "@/lib/auth/brand";
import { brandSignOut } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Where a brand lands. Signing in and being a member are different things, so
 * this page exists for the state in between: applied, waiting, or turned down.
 */
export default async function BrandHomePage() {
  const account = await requireBrandAccount();

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
                Have a look at who&apos;s on the roster.
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
                I&apos;ll come to you at {account.email} when I have a creator
                who fits what you described.
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
          <p className="mt-8 text-base leading-snug text-neutral-500">
            There&apos;s nothing to pay, and nothing to do. If that ever
            changes we&apos;ll tell you first.
          </p>
        </>
      )}
    </main>
  );
}
