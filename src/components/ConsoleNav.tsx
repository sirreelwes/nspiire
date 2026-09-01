import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { arch } from "@/components/Button";
import { signOut } from "@/app/login/actions";

/**
 * The console's navigation bar.
 *
 * Every gated page previously carried its own "← Dashboard" text crumb, which
 * meant three things: no way to reach Creators from Deals without going via the
 * dashboard, no visible home affordance on the dashboard itself (only the logo
 * mark, which nobody reads as a button), and no way to sign out at all —
 * signOut() existed and was wired to nothing.
 *
 * `current` renders that entry in the accent, which is the one place the
 * oxblood earns its keep here: it marks where you are rather than what to click.
 */

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/creators", label: "Creators" },
  { href: "/deals", label: "Deals" },
] as const;

export function ConsoleNav({ current }: { current?: string }) {
  return (
    <header className="mb-10 flex flex-wrap items-center gap-x-4 gap-y-3">
      <Link href="/" aria-label="Nspiire home page" className="shrink-0">
        <LogoMark size={34} />
      </Link>

      <nav aria-label="Console" className="flex flex-wrap gap-3">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={current === l.href ? "page" : undefined}
            className={arch(current === l.href ? "primary" : "secondary", "md")}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <form action={signOut} className="ml-auto">
        <button
          type="submit"
          className="text-base text-neutral-500 underline underline-offset-4"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
