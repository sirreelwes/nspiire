import { askIris, draftBrandOutreach, logBrandReply, setDealPersona } from "@/app/deals/actions";
import { field, ghostBtn, hint, label, primaryBtn } from "@/app/deals/ui";

/**
 * The virtual agent on a deal.
 *
 * Two threads, deliberately drawn as two different things. The creator's
 * conversation is a chat — she works for them, and it reads like talking to
 * your manager. The brand thread is a stack of drafts with an approval notice
 * on each, because nothing there has been sent and the reviewer needs to see
 * that at a glance rather than infer it.
 */

export interface PersonaRow {
  id: string;
  name: string;
  title: string;
  bio: string | null;
}

export interface InteractionRow {
  id: string;
  direction: string;
  actor: string;
  subject: string | null;
  body: string | null;
  approval: unknown;
  createdAt: Date;
}

/** Her structured read, stored alongside the message she sent with it. */
interface Verdict {
  recommendation?: string;
  watchOuts?: string[];
  nextStep?: string | null;
  withheld?: string[];
  reason?: string;
}

function verdict(value: unknown): Verdict {
  return value && typeof value === "object" ? (value as Verdict) : {};
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  "take-it": "She'd take it",
  "push-back": "She'd push back",
  "walk-away": "She'd walk away",
  "need-more-info": "She wants more information",
};

export function AgentPanel({
  dealId,
  persona,
  roster,
  assignedOnDeal,
  creatorName,
  brandName,
  creatorThread,
  brandThread,
}: {
  dealId: string;
  persona: PersonaRow | null;
  roster: PersonaRow[];
  /** Whether this deal has its own assignment, vs. inheriting the account's. */
  assignedOnDeal: boolean;
  creatorName: string;
  brandName: string;
  creatorThread: InteractionRow[];
  brandThread: InteractionRow[];
}) {
  if (!persona) {
    return (
      <p className="text-sm text-neutral-500">
        No virtual agent on the roster yet. One is seeded with the database —
        run <code className="font-mono">npx prisma migrate deploy</code>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Assignment
        dealId={dealId}
        persona={persona}
        roster={roster}
        assignedOnDeal={assignedOnDeal}
      />
      <CreatorChat
        dealId={dealId}
        persona={persona}
        creatorName={creatorName}
        thread={creatorThread}
      />
      <BrandThread
        dealId={dealId}
        persona={persona}
        brandName={brandName}
        thread={brandThread}
      />
    </div>
  );
}

function Assignment({
  dealId,
  persona,
  roster,
  assignedOnDeal,
}: {
  dealId: string;
  persona: PersonaRow;
  roster: PersonaRow[];
  assignedOnDeal: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 px-4 py-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {persona.name}
          <span className="ml-2 text-sm font-normal text-neutral-500">
            {persona.title}
          </span>
        </span>
        {!assignedOnDeal && (
          <span className="text-xs text-neutral-500">
            from the account default
          </span>
        )}
      </div>
      {persona.bio && (
        <p className="mt-1 text-sm text-neutral-500">{persona.bio}</p>
      )}

      {roster.length > 1 && (
        <form action={setDealPersona} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="dealId" value={dealId} />
          <div>
            <label className={label} htmlFor="personaId">
              Run this deal with
            </label>
            <select
              id="personaId"
              name="personaId"
              className={field}
              defaultValue={assignedOnDeal ? persona.id : ""}
            >
              <option value="">The account default</option>
              {roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.title}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={ghostBtn}>
            Assign
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * The creator's own conversation with her. Newest last, like a chat, because
 * that is what it is — and because her answer to their last question is the
 * thing they came back to read.
 */
function CreatorChat({
  dealId,
  persona,
  creatorName,
  thread,
}: {
  dealId: string;
  persona: PersonaRow;
  creatorName: string;
  thread: InteractionRow[];
}) {
  const latest = [...thread].reverse().find((m) => m.direction === "outbound");
  const read = verdict(latest?.approval);
  const recommendation = read.recommendation
    ? RECOMMENDATION_LABELS[read.recommendation]
    : undefined;

  return (
    <div>
      <h3 className="text-sm font-medium">
        {persona.name} and {creatorName}
      </h3>

      {thread.length === 0 ? (
        <p className={`${hint} mt-1`}>
          She hasn&apos;t been asked about this deal yet.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {thread.map((m) => (
            <li
              key={m.id}
              className={
                m.direction === "outbound"
                  ? "rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
                  : "rounded-xl bg-neutral-100 px-4 py-3 dark:bg-neutral-900"
              }
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  {m.direction === "outbound" ? persona.name : creatorName}
                </span>
                <When at={m.createdAt} />
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
                {m.body}
              </p>
            </li>
          ))}
        </ol>
      )}

      {(recommendation || (read.watchOuts?.length ?? 0) > 0 || read.nextStep) && (
        <div className="mt-4 rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800">
          {recommendation && (
            <p className="text-sm font-medium">{recommendation}</p>
          )}
          {(read.watchOuts?.length ?? 0) > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
              {read.watchOuts?.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {read.nextStep && (
            <p className="mt-2 text-xs text-neutral-500">
              She&apos;d do this next: {read.nextStep}. She hasn&apos;t —
              moving the deal is yours.
            </p>
          )}
        </div>
      )}

      <form action={askIris} className="mt-4 flex flex-col gap-2">
        <input type="hidden" name="dealId" value={dealId} />
        <label className={label} htmlFor="question">
          {thread.length === 0 ? `Ask ${persona.name} about this deal` : "Reply"}
        </label>
        <textarea
          id="question"
          name="question"
          rows={2}
          className={field}
          placeholder={
            thread.length === 0
              ? "Leave this blank and she'll brief you on the deal"
              : "Is this a good number? Can we get more? What am I giving up?"
          }
        />
        <button type="submit" className={`${primaryBtn} self-start`}>
          {thread.length === 0 ? "Bring me this deal" : `Ask ${persona.name}`}
        </button>
      </form>
    </div>
  );
}

/**
 * The brand side. Every outbound row is a draft — there is no send path, and
 * the blueprint gates first outreach and anything quoting money regardless. The
 * "not sent" line on each is the point of the layout.
 */
function BrandThread({
  dealId,
  persona,
  brandName,
  thread,
}: {
  dealId: string;
  persona: PersonaRow;
  brandName: string;
  thread: InteractionRow[];
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">
        {persona.name} and {brandName}
      </h3>
      <p className={`${hint} mt-1`}>
        She drafts; you send. Nothing here has reached {brandName}.
      </p>

      {thread.length > 0 && (
        <ol className="mt-4 flex flex-col gap-3">
          {thread.map((m) => {
            const read = verdict(m.approval);
            const outbound = m.direction === "outbound";
            return (
              <li
                key={m.id}
                className={
                  outbound
                    ? "rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
                    : "rounded-xl bg-neutral-100 px-4 py-3 dark:bg-neutral-900"
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                    {outbound ? `${persona.name} · draft` : brandName}
                  </span>
                  <When at={m.createdAt} />
                </div>
                {m.subject && (
                  <p className="mt-1 text-sm font-medium">{m.subject}</p>
                )}
                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
                  {m.body}
                </p>
                {outbound && (read.withheld?.length ?? 0) > 0 && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-500">
                    She didn&apos;t answer: {read.withheld?.join("; ")}
                  </p>
                )}
                {outbound && (
                  <p className="mt-2 text-xs text-neutral-500">
                    Not sent — {read.reason || "waiting on you"}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <form action={draftBrandOutreach} className="mt-4">
        <input type="hidden" name="dealId" value={dealId} />
        <button type="submit" className={primaryBtn}>
          {thread.length === 0
            ? `Draft the opening email`
            : `Draft ${persona.name}'s reply`}
        </button>
      </form>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-neutral-500">
          Log what {brandName} wrote back
        </summary>
        <form action={logBrandReply} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="dealId" value={dealId} />
          <input
            name="subject"
            className={field}
            placeholder="Subject (optional)"
          />
          <textarea
            name="body"
            rows={3}
            className={field}
            placeholder="Paste their email here"
          />
          <button type="submit" className={`${ghostBtn} self-start`}>
            Log it
          </button>
          <p className={hint}>
            Until inbound email is wired up, this is how she sees a reply — and
            what makes her next draft a reply rather than a repeat.
          </p>
        </form>
      </details>
    </div>
  );
}

/** Server-rendered, so pin the timezone and say so — same as the deal timeline. */
function When({ at }: { at: Date }) {
  return (
    <time
      dateTime={at.toISOString()}
      className="text-xs tabular-nums text-neutral-400"
    >
      {new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(at)}{" "}
      UTC
    </time>
  );
}
