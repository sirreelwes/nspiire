import { ConsoleNav } from "@/components/ConsoleNav";
import { requireOperator } from "@/lib/auth/operator";
import { prisma, hasDatabase } from "@/lib/prisma";
import { arch } from "@/components/Button";
import { NotConnected } from "@/app/deals/ui";
import {
  approveMembership,
  cancelMembership,
  declineMembership,
} from "./actions";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  PENDING: "Waiting on you",
  ACTIVE: "Member",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

/** Membership applications. $100/mo, but the gate here is judgement. */
export default async function BrandsPage() {
  await requireOperator("/brands");

  if (!hasDatabase) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <ConsoleNav current="/brands" />
        <NotConnected />
      </main>
    );
  }

  const accounts = await prisma.brandAccount.findMany({
    include: { _count: { select: { interests: true } } },
    orderBy: [{ membership: "asc" }, { appliedAt: "desc" }],
  });
  const pending = accounts.filter((a) => a.membership === "PENDING");
  const rest = accounts.filter((a) => a.membership !== "PENDING");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:py-14">
      <ConsoleNav current="/brands" />

      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Brands</h1>
      <p className="mt-3 text-base text-neutral-500">
        $100 a month buys the roster. Approving is a judgement call — an
        approved brand can see every creator&apos;s audience numbers.
      </p>

      <h2 className="mt-10 text-base font-medium uppercase tracking-wide text-neutral-400">
        Applications
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        {pending.length === 0 && (
          <p className="rounded-xl border border-neutral-200 px-5 py-4 text-base text-neutral-500 dark:border-neutral-800">
            Nothing waiting.
          </p>
        )}
        {pending.map((a) => (
          <div
            key={a.id}
            className="rounded-xl border border-neutral-200 px-5 py-5 dark:border-neutral-800"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-lg font-medium">{a.companyName}</span>
              <span className="text-sm text-neutral-500">
                applied {a.appliedAt.toISOString().slice(0, 10)}
              </span>
            </div>
            <p className="mt-1 text-base text-neutral-500">
              {a.contactName} · {a.email}
              {a.website ? ` · ${a.website}` : ""}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <form action={approveMembership}>
                <input type="hidden" name="accountId" value={a.id} />
                <button type="submit" className={arch("primary", "md")}>
                  Approve
                </button>
              </form>
              <form action={declineMembership} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="accountId" value={a.id} />
                <input
                  name="note"
                  placeholder="Reason (they see this)"
                  className="rounded-xl border border-neutral-300 px-4 py-2.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
                />
                <button type="submit" className={arch("secondary", "md")}>
                  Decline
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-base font-medium uppercase tracking-wide text-neutral-400">
        Everyone else
      </h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        {rest.length === 0 ? (
          <p className="px-5 py-4 text-base text-neutral-500">No decided accounts yet.</p>
        ) : (
          <table className="w-full min-w-[32rem] text-base">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-sm text-neutral-500 dark:border-neutral-800">
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Interests</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {rest.map((a) => (
                <tr key={a.id}>
                  <td className="px-5 py-4">
                    <span className="font-medium">{a.companyName}</span>
                    <span className="block text-sm text-neutral-500">{a.email}</span>
                  </td>
                  <td className="px-5 py-4">{LABELS[a.membership]}</td>
                  <td className="px-5 py-4 tabular-nums">{a._count.interests}</td>
                  <td className="px-5 py-4">
                    {a.membership === "ACTIVE" && (
                      <form action={cancelMembership}>
                        <input type="hidden" name="accountId" value={a.id} />
                        <button
                          type="submit"
                          className="text-sm text-neutral-500 underline underline-offset-4"
                        >
                          End membership
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
