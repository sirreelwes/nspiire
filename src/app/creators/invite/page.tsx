import { ConsoleNav } from "@/components/ConsoleNav";
import { requireOperator } from "@/lib/auth/operator";
import { arch } from "@/components/Button";
import { Crumb, ErrorBanner } from "@/app/deals/ui";
import { inviteNewCreator } from "@/app/creators/actions";

export const dynamic = "force-dynamic";

const field =
  "rounded-xl border border-neutral-300 px-4 py-3.5 text-base dark:border-neutral-700 dark:bg-neutral-900";

/** Invite a creator with just their email. They fill in the rest. */
export default async function InviteCreatorPage(
  props: PageProps<"/creators/invite">,
) {
  await requireOperator("/creators/invite");
  const { error } = await props.searchParams;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-5 py-10 sm:py-14">
      <ConsoleNav current="/creators" />
      <Crumb href="/creators">← Creators</Crumb>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Invite a creator
      </h1>
      <p className="mt-3 text-base leading-snug text-neutral-500">
        You get a link to send them. They set their own password and fill in
        their niche, numbers and rates — you don&apos;t have to know them.
      </p>

      {typeof error === "string" && <ErrorBanner message={error} />}

      <form action={inviteNewCreator} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Name</span>
          <input name="name" type="text" required autoFocus className={field} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-base font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            className={field}
            placeholder="them@example.com"
          />
          <span className="text-sm text-neutral-500">
            This is how they sign in. Use their address, not yours.
          </span>
        </label>
        <button type="submit" className={arch("primary", "md", "mt-2 self-start")}>
          Create invite link
        </button>
      </form>

      <p className="mt-10 text-sm text-neutral-500">
        Need to enter everything yourself instead?{" "}
        <a href="/onboarding" className="underline underline-offset-4">
          Use the full onboarding form
        </a>
        .
      </p>
    </main>
  );
}
