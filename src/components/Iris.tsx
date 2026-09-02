/**
 * Iris — the agent, given a face and a name.
 *
 * Drawn rather than photographed, deliberately. Iris is software, and a
 * photorealistic portrait would invite a creator to believe a person in
 * Chicago is reading their deals. An illustration reads as a brand character:
 * warm, specific, and honest about what it is. Swap in artwork later if you
 * want, but keep it illustrative.
 *
 * Palette is the logo's: oxblood accent against ink, so she belongs to the
 * same mark as the handle over the II.
 */

export function IrisAvatar({
  size = 64,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Iris, your agent"
      className={className}
    >
      <defs>
        <clipPath id="iris-clip">
          <circle cx="48" cy="48" r="46" />
        </clipPath>
      </defs>

      {/*
        Fixed colours, NOT theme variables. --logo-ink inverts in dark mode,
        which flipped her eyes, mouth and blazer to white — a portrait has to
        hold its own colours whatever the page does behind it. Only the ring
        borrows the brand accent.
      */}
      <circle cx="48" cy="48" r="46" fill="#efeae3" />

      <g clipPath="url(#iris-clip)">
        {/* blazer */}
        <path d="M6 96c0-18 17-27 42-27s42 9 42 27z" fill="#221f1d" />
        {/* shirt */}
        <path d="M40 68l8 13 8-13-8-3z" fill="#f6f3ee" />
        {/* lapels */}
        <path d="M40 68L30 96h7l6-20z" fill="#2e2a27" />
        <path d="M56 68l10 28h-7l-6-20z" fill="#2e2a27" />
        {/* the accent, as a collar detail */}
        <path d="M48 81l-5-8 5-2 5 2z" fill="var(--logo-accent, #bf5700)" />
        {/* neck */}
        <path d="M41 55h14v13l-7 5-7-5z" fill="#d9b294" />
        {/* face */}
        <ellipse cx="48" cy="41" rx="15.5" ry="18.5" fill="#e6c3a5" />
        {/* hair: blunt bob, one side tucked */}
        <path
          d="M48 19c-11.5 0-18.5 7.5-18.5 19 0 6 1 12 2.5 17.5h4.5c-1.2-6-1.4-12.5-.6-17.4 5.2 3.3 12.4 4.2 19.4 2.1 3.6-1.1 6.4-2.8 8.3-4.7 1 5 .9 13.4-.4 20h4.6C69.4 50 70.5 44 70.5 38 70.5 26.5 62 19 48 19z"
          fill="#241c19"
        />
        {/* No earring or other fine detail: this renders at 64px in the page,
            where a 2px hoop is a smudge rather than a fashion cue. */}
        {/* brows */}
        <path d="M40 35.5q3.6-2 7 0" stroke="#241c19" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M49 35.5q3.4-2 7 0" stroke="#241c19" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {/* eyes */}
        <circle cx="42.6" cy="41" r="1.8" fill="#241c19" />
        <circle cx="53.4" cy="41" r="1.8" fill="#241c19" />
        {/* a small, closed smile — not a grin */}
        <path d="M44 49.5q4 2.6 8 0" stroke="#241c19" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </g>

      <circle
        cx="48"
        cy="48"
        r="45"
        fill="none"
        stroke="var(--logo-accent, #bf5700)"
        strokeWidth="2"
      />
    </svg>
  );
}

/** Iris saying something, with her face next to it. */
export function IrisGreeting({
  children,
  size = 64,
}: {
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <div className="flex items-start gap-4">
      <IrisAvatar size={size} className="shrink-0" />
      <div className="min-w-0 pt-1">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-neutral-400">
          Iris · your agent
        </p>
        <div className="mt-2 text-xl leading-snug sm:text-2xl">{children}</div>
      </div>
    </div>
  );
}

/**
 * What Iris says, given what is actually waiting.
 *
 * Ordered by what costs the creator most to miss, not by what is newest:
 * money they have not signed off beats words they have not read, which beats
 * brands they have not looked at. A greeting that leads with "four new brands"
 * while a deal sits unapproved is cheerful and wrong.
 *
 * Pure, so the copy lives in one place and can be checked without a browser.
 */
export function irisGreeting(input: {
  firstName: string;
  /** Brands found, not yet looked at. */
  toReview: number;
  /** Drafts written and waiting to be read. */
  toRead: number;
  /** Deals whose terms need approving, or re-approving after a change. */
  toSign: number;
  /** Brands who asked for this creator and are waiting on an answer. */
  toAnswer?: number;
}): { lead: string; follow: string } {
  const { firstName, toReview, toRead, toSign, toAnswer = 0 } = input;
  const n = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;

  if (toSign > 0) {
    return {
      lead: `Hi ${firstName}, ${n(toSign, "deal needs", "deals need")} your sign-off on the money.`,
      follow: "Have a look at the numbers before I take it any further.",
    };
  }

  // A brand asking for them outranks a shortlist Iris built: somebody came
  // looking, which is a better signal and a shorter-lived one.
  if (toAnswer > 0) {
    return {
      lead: `Hi ${firstName}, ${n(toAnswer, "brand", "brands")} asked to work with you.`,
      follow: "They can't reach you unless you say yes.",
    };
  }

  if (toRead > 0) {
    return {
      lead: `Hi ${firstName}, I've written ${n(toRead, "email", "emails")} for you to read.`,
      follow: "Change anything you like — I send exactly what you approve.",
    };
  }

  if (toReview > 0) {
    return {
      lead: `Hi ${firstName}, I found ${n(toReview, "brand", "brands")} worth a look.`,
      follow:
        toReview === 1
          ? "Does it look interesting?"
          : "Which ones look interesting?",
    };
  }

  return {
    lead: `Hi ${firstName}, nothing needs you right now.`,
    follow: "I'll keep looking and tell you when something's worth your time.",
  };
}
