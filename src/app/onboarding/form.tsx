"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  SUGGESTED_FORMATS,
  type Platform,
} from "@/lib/creators/onboarding";
import {
  COMPARABLES_ASKED_FOR,
  COMPARABLE_KINDS,
  COMPARABLE_KIND_LABELS,
  type ComparableKind,
} from "@/lib/creators/comparables";

type SocialRow = { platform: Platform; handle: string; followers: string };
type RateRow = { format: string; rate: string; floor: string };
type ComparableRow = { handle: string; kind: ComparableKind; note: string };

/** The three empty rows the form opens on. Three is the ask, not a limit. */
const emptyComparables = (): ComparableRow[] =>
  Array.from({ length: COMPARABLES_ASKED_FOR }, () => ({
    handle: "",
    kind: "peer" as ComparableKind,
    note: "",
  }));

const field =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base " +
  "text-neutral-900 placeholder:text-neutral-400 outline-none " +
  "focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 " +
  "dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-300";
const label = "block text-sm font-medium text-neutral-700 dark:text-neutral-300";
const hint = "mt-1 text-xs text-neutral-500";
const ghostBtn =
  "rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium " +
  "text-neutral-700 dark:border-neutral-700 dark:text-neutral-300";

/** "1,250" | "$1,250.50" -> 125000 | 125050. Empty -> null. */
function toCents(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function toLines(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function OnboardingForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [niche, setNiche] = useState("");
  const [socials, setSocials] = useState<SocialRow[]>([
    { platform: "INSTAGRAM", handle: "", followers: "" },
  ]);
  const [rates, setRates] = useState<RateRow[]>([
    { format: SUGGESTED_FORMATS[0], rate: "", floor: "" },
  ]);
  const [comparables, setComparables] =
    useState<ComparableRow[]>(emptyComparables());
  const [maxUsageDays, setMaxUsageDays] = useState("30");
  const [maxExclusivityDays, setMaxExclusivityDays] = useState("0");
  const [doNotWorkWith, setDoNotWorkWith] = useState("");
  const [voiceNotes, setVoiceNotes] = useState("");
  const [voiceSamples, setVoiceSamples] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  function patchSocial(i: number, patch: Partial<SocialRow>) {
    setSocials((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function patchRate(i: number, patch: Partial<RateRow>) {
    setRates((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function patchComparable(i: number, patch: Partial<ComparableRow>) {
    setComparables((rows) =>
      rows.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name,
        email,
        niche,
        socials: socials
          .filter((s) => s.handle.trim())
          .map((s) => ({
            platform: s.platform,
            handle: s.handle,
            followerCount: s.followers
              ? Number(s.followers.replace(/[^0-9]/g, ""))
              : null,
          })),
        rates: rates
          .filter((r) => r.format.trim() && r.rate.trim())
          .map((r) => ({
            format: r.format,
            rateCents: toCents(r.rate) ?? 0,
            floorCents: toCents(r.floor),
          })),
        comparables: comparables
          .filter((c) => c.handle.trim())
          .map((c) => ({ handle: c.handle, kind: c.kind, note: c.note })),
        maxUsageDays: Number(maxUsageDays || 0),
        maxExclusivityDays: Number(maxExclusivityDays || 0),
        doNotWorkWith: toLines(doNotWorkWith),
        voiceNotes,
        voiceSamples: toLines(voiceSamples),
      };

      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(firstMessage(data) ?? `Could not save (${res.status}).`);
        return;
      }
      setSavedName(data?.creator?.name ?? name);
    } catch {
      setError("Network error — nothing was saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (savedName) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          You&apos;re set up, {savedName}.
        </h1>
        <p className="mt-3 text-neutral-500">
          Your rate card and guardrails are saved. Scout can start sourcing
          brands — nothing goes out to a brand without your approval.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            Go to dashboard
          </Link>
          <button
            className={ghostBtn}
            onClick={() => {
              setComparables(emptyComparables());
              setSavedName(null);
            }}
          >
            Add another creator
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Set up your agent
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        Rates and guardrails are the boundaries your agent negotiates inside.
        Anything outside them stops and asks you.
      </p>

      <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-10">
        <Section title="You">
          <div className="flex flex-col gap-4">
            <div>
              <label className={label} htmlFor="name">
                Name
              </label>
              <input
                id="name"
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
            <div>
              <label className={label} htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                className={field}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className={label} htmlFor="niche">
                Niche
              </label>
              <input
                id="niche"
                className={field}
                placeholder="Outdoor gear, home cooking, PC building…"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                required
              />
              <p className={hint}>
                Scout matches brands against this, and it&apos;s how your closed
                deals get benchmarked.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Where you post">
          <div className="flex flex-col gap-4">
            {socials.map((s, i) => (
              <Row key={i} onRemove={socials.length > 1 ? () => setSocials((r) => r.filter((_, j) => j !== i)) : undefined}>
                <select
                  className={field}
                  value={s.platform}
                  onChange={(e) =>
                    patchSocial(i, { platform: e.target.value as Platform })
                  }
                  aria-label="Platform"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </select>
                <input
                  className={field}
                  placeholder="@handle"
                  value={s.handle}
                  onChange={(e) => patchSocial(i, { handle: e.target.value })}
                  aria-label="Handle"
                />
                <input
                  className={field}
                  inputMode="numeric"
                  placeholder="Followers"
                  value={s.followers}
                  onChange={(e) => patchSocial(i, { followers: e.target.value })}
                  aria-label="Follower count"
                />
              </Row>
            ))}
            <button
              type="button"
              className={`${ghostBtn} self-start`}
              onClick={() =>
                setSocials((r) => [
                  ...r,
                  { platform: "INSTAGRAM", handle: "", followers: "" },
                ])
              }
            >
              + Add account
            </button>
          </div>
        </Section>

        <Section title="Rate card">
          <p className="-mt-2 mb-4 text-sm text-neutral-500">
            What you ask per deliverable, and the floor you won&apos;t go under.
            Leave the floor blank and your asking rate becomes the floor.
          </p>
          <div className="flex flex-col gap-4">
            {rates.map((r, i) => (
              <Row key={i} onRemove={rates.length > 1 ? () => setRates((rows) => rows.filter((_, j) => j !== i)) : undefined}>
                <input
                  className={field}
                  list="nspiire-formats"
                  placeholder="Format"
                  value={r.format}
                  onChange={(e) => patchRate(i, { format: e.target.value })}
                  aria-label="Deliverable format"
                />
                <input
                  className={field}
                  inputMode="decimal"
                  placeholder="Rate $"
                  value={r.rate}
                  onChange={(e) => patchRate(i, { rate: e.target.value })}
                  aria-label="Asking rate in dollars"
                />
                <input
                  className={field}
                  inputMode="decimal"
                  placeholder="Floor $"
                  value={r.floor}
                  onChange={(e) => patchRate(i, { floor: e.target.value })}
                  aria-label="Floor rate in dollars"
                />
              </Row>
            ))}
            <datalist id="nspiire-formats">
              {SUGGESTED_FORMATS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <button
              type="button"
              className={`${ghostBtn} self-start`}
              onClick={() =>
                setRates((rows) => [...rows, { format: "", rate: "", floor: "" }])
              }
            >
              + Add format
            </button>
          </div>
        </Section>

        <Section title="Creators like you">
          <p className="-mt-2 mb-4 text-sm text-neutral-500">
            Name three. Scout hunts brands that already sponsor creators like
            you — a sponsorship one of your peers has run is a real lead, at a
            level a brand has shown it will pay for.
          </p>
          <div className="flex flex-col gap-5">
            {comparables.map((c, i) => (
              <div key={i} className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_13rem]">
                  <input
                    className={field}
                    placeholder="@handle or name"
                    value={c.handle}
                    onChange={(e) => patchComparable(i, { handle: e.target.value })}
                    aria-label={`Creator ${i + 1}`}
                  />
                  <select
                    className={field}
                    value={c.kind}
                    onChange={(e) =>
                      patchComparable(i, {
                        kind: e.target.value as ComparableKind,
                      })
                    }
                    aria-label={`How creator ${i + 1} compares to you`}
                  >
                    {COMPARABLE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {COMPARABLE_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  className={field}
                  placeholder="Why them — same audience, same format, same gear"
                  value={c.note}
                  onChange={(e) => patchComparable(i, { note: e.target.value })}
                  aria-label={`Why creator ${i + 1}`}
                />
              </div>
            ))}
            <button
              type="button"
              className={`${ghostBtn} self-start`}
              onClick={() =>
                setComparables((rows) => [
                  ...rows,
                  { handle: "", kind: "peer", note: "" },
                ])
              }
            >
              + Add another
            </button>
            <p className={hint}>
              Be honest about which is which. &ldquo;Where I&apos;m
              heading&rdquo; tells your agent about taste and direction, and is
              deliberately ignored when sizing brands — naming someone ten times
              your size won&apos;t get you pitched as though you were them.
            </p>
          </div>
        </Section>

        <Section title="Guardrails">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="usage">
                  Max usage rights (days)
                </label>
                <input
                  id="usage"
                  className={field}
                  inputMode="numeric"
                  value={maxUsageDays}
                  onChange={(e) => setMaxUsageDays(e.target.value)}
                />
                <p className={hint}>
                  How long a brand may run your content without coming back to
                  you.
                </p>
              </div>
              <div>
                <label className={label} htmlFor="excl">
                  Max exclusivity (days)
                </label>
                <input
                  id="excl"
                  className={field}
                  inputMode="numeric"
                  value={maxExclusivityDays}
                  onChange={(e) => setMaxExclusivityDays(e.target.value)}
                />
                <p className={hint}>
                  0 means your agent never agrees to lock out competitors on its
                  own.
                </p>
              </div>
            </div>
            <div>
              <label className={label} htmlFor="dnw">
                Do not work with
              </label>
              <textarea
                id="dnw"
                rows={3}
                className={field}
                placeholder={"One per line — brands or whole categories\ngambling\nnicotine"}
                value={doNotWorkWith}
                onChange={(e) => setDoNotWorkWith(e.target.value)}
              />
            </div>
          </div>
        </Section>

        <Section title="Your voice">
          <div className="flex flex-col gap-4">
            <div>
              <label className={label} htmlFor="voice">
                How you sound
              </label>
              <textarea
                id="voice"
                rows={4}
                className={field}
                placeholder="Dry, no hype, first person. Never says 'obsessed'. Short sentences."
                value={voiceNotes}
                onChange={(e) => setVoiceNotes(e.target.value)}
              />
              <p className={hint}>
                Pitch writes in this voice. Be blunt about what you&apos;d never
                say.
              </p>
            </div>
            <div>
              <label className={label} htmlFor="samples">
                Sample links
              </label>
              <textarea
                id="samples"
                rows={3}
                className={field}
                placeholder="One URL per line — posts that sound most like you"
                value={voiceSamples}
                onChange={(e) => setVoiceSamples(e.target.value)}
              />
            </div>
          </div>
        </Section>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <div className="sticky bottom-0 -mx-5 border-t border-neutral-200 bg-[var(--background)] px-5 py-4 dark:border-neutral-800">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {saving ? "Saving…" : "Save and start"}
          </button>
        </div>
      </form>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Stacks on phones, goes inline once there's room. */
function Row({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800 sm:border-0 sm:p-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {children}
        <button
          type="button"
          onClick={onRemove}
          disabled={!onRemove}
          aria-label="Remove row"
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-neutral-500 disabled:opacity-30 sm:px-2"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/** Pull something readable out of either error shape the API returns. */
function firstMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { error?: unknown; issues?: unknown };
  const issues = d.issues as
    | { properties?: Record<string, { errors?: string[] }>; errors?: string[] }
    | undefined;
  if (issues?.properties) {
    for (const v of Object.values(issues.properties)) {
      if (v?.errors?.length) return v.errors[0];
    }
  }
  if (issues?.errors?.length) return issues.errors[0];
  return typeof d.error === "string" ? d.error : null;
}
