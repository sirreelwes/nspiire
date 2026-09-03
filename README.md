# Nspiire

End-to-end AI agent/manager for social media creators. Replaces the human manager/agent: finds brand deals, runs outreach and negotiation through virtual agents, writes contracts, manages relationships and money, monitors trends, and advises on realistic deal terms from accumulated deal data.

Full product blueprint lives in the Claude project ("Nspiire" → blueprint.md).

## Stack

- Next.js (App Router, TS, Tailwind) — deployed on Vercel
- Postgres + Prisma
- Claude API (`@anthropic-ai/sdk`) for the agent layer
- CardPointe for payments (invoicing brands: card + ACH; MVP tracks, never holds funds)
- E-sign vendor TBD

## Layout

```
prisma/schema.prisma        core data model (Creator, Brand, Opportunity, Deal,
                            Contract, Deliverable, Invoice, TermsBenchmark…)
src/lib/deals/stateMachine.ts   validated + logged deal transitions; PAID
                                auto-writes anonymized TermsBenchmark rows
src/lib/deals/fee.ts            the deal fee the brand pays Nspiire — how the
                                product makes money. Pure arithmetic, no model call
src/lib/deals/policy.ts         house rules: $250 sourcing floor, 30-day
                                standard usage window
src/lib/creators/shipping.ts    where brand product may be sent, and how far a
                                deal must get before the address is released
src/lib/creators/comparables.ts creators they name as comparable — peers and
                                aspirational, deliberately kept apart
src/lib/deals/brandAccess.ts    the brand's capability URL, and the single
                                definition of what it grants
src/lib/email/                  outbound email (Resend) + the CAN-SPAM wrapper
src/app/b/[token]/              the brand deal room — public, no login
src/app/inquiries/              the front door — public inquiry form
src/lib/inquiries/schema.ts     its validation and abuse defences
src/lib/agents/             the virtual agent roster
  types.ts                  guardrails, approval policy, shared contracts
  claude.ts                 Claude client helper
  scout.ts                  brand discovery + fit scoring
  persona.ts                the virtual agents — voice, and the clauses a
                            persona row can never edit
  conversation.ts           a persona holding a thread, brand-side and
                            creator-side. Replaces the old pitch.ts
  negotiator.ts             in-thread negotiation within guardrails
  counsel.ts                contract assembly + redlining (doc automation, not legal advice)
  books.ts                  invoicing/payment tracking (CardPointe TODO)
  orchestrator.ts           routing + approval queue
```

## Hard rules baked in

- The deal fee is charged to the **brand**, on top of the creator's rate — never netted out of it. A creator who agreed $5,000 is paid $5,000.
- A creator's shipping address never goes into a model prompt, and is never released to a brand before the deal state the creator chose.
- A virtual agent never claims to be human, and never gets a brand-facing brief containing the creator's floor rate, guardrails or address.
- Nothing a virtual agent writes to a brand sends itself. Every brand-facing draft comes back gated, and a human presses send.
- A brand that opts out is never contacted again — enforced in the send path and in Scout, not just recorded.
- Every deal state change goes through `transition()` and is logged — that log trains the deal-terms advisor.
- Negotiator can never auto-accept terms outside guardrails; `gateOutsideGuardrails` and `gateMoney` cannot be disabled.
- Contracts never send without human sign-off.
- MVP never holds funds (money-transmitter risk).

## House deal policy

`src/lib/deals/policy.ts` holds the rules that are Nspiire's rather than a
creator's — creator guardrails are per-creator and the creator moves them,
these apply to everyone:

- **We don't source deals under $250.** Papering, chasing and tracking a deal
  costs the same at $80 as at $8,000. Scout won't hunt for a format priced
  below it and escalates if a whole rate card is under it; an operator can
  still record a smaller deal a creator brought in themselves. The human
  overrules the house, not the other way round.
- **Deals open on a 30-day usage window, no exclusivity.** That is what a new
  deal's terms are prefilled with, and it is the same number as the default
  `maxUsageDays` guardrail — the opening ask sits exactly at the ceiling a
  creator is assumed to accept without being asked. The fee schedule prices its
  surcharges off it.

## Creators like you

Onboarding asks every creator to name three creators like them. It is the
cheapest high-value question in the flow: "which brands sponsor people like me"
is a far better lead than niche and follower count, because a sponsorship a
comparable creator has actually run is a checkable fact at a tier some brand
has already shown it will pay for.

Two kinds, and the difference is the whole point:

| | What it tells Scout |
| --- | --- |
| **About where I am** (peer) | Real signal about tier. Brands that sponsor them are leads worth the creator's time. |
| **Where I'm heading** (aspirational) | Taste and direction. **Never** tier. |

Collapsing them would be actively harmful — a 40K creator who names a 5M
creator gets pitched to brands that only book 5M creators, every pitch is
ignored, and the shortlist looks busy while producing nothing. Scout is told
this explicitly and the two lists reach it separately, never merged.

### Stated now, measured when we can

The split is really a size comparison, so `effectiveKind()` computes it from a
measured follower count wherever one exists and only falls back to the
creator's answer when nothing has been looked up — the same precedence a synced
metric has over a hand-entered one. Measurement corrects them in both
directions: a 5M creator they filed under "about my size" stops sizing brands,
and a same-size creator they were modest about starts.

Nothing populates that number yet, and what it takes differs by platform:

| | Lookup by handle |
| --- | --- |
| **YouTube** | `channels.list(part=statistics)` — any public channel, free, quota'd. The easy one. |
| **Instagram** | Graph `business_discovery` — professional accounts only, needs our own linked account and app review. Meta's surface moves; verify before building. |
| **TikTok** | None. `/v2/user/info/` reads the token holder's own profile, the Research API is researchers-only, and Creator Marketplace needs a partner agreement. |
| **Vendors** | Modash, HypeAuditor, Upfluence — all three platforms with engagement attached, for money. |

Not an option: asking a model how big someone is. That is a confident
unsourced number deciding who gets pitched to whom.

Deliberately **not** used for pricing either. The terms advisor prices from
closed deals and the creator's own rate card, never from a name typed into a
form: "creators like me charge $8K" is exactly the figure
`lib/deals/advisor.ts` exists to refuse.

Asked, not required — a good question is not a reason to block a signup. The
creator page shows the three rows for anyone who skipped it.

## Virtual agents

Iris is the first. `src/lib/agents/persona.ts` holds the roster; a creator
assigns one per account, and any deal can be handed to someone else
(`Deal.personaId` overrides `Creator.personaId`, falling back to the first
active persona).

A Persona is **not** an agent in the `lib/agents` sense. Those are capabilities
— Scout scores, Negotiator counters, Books invoices. A Persona is a voice
wearing them, which is why tone lives in a database row a creator can assign
rather than a const in a prompt file.

She holds two conversations and they are not the same job:

- **To a brand** she is the creator's representation — warm, specific, holding
  a line. She proposes and relays; she never accepts terms.
- **To the creator** she works for them — leads with the money, says plainly
  when a deal is weak, and is told never to talk them into one.

Both run through `conversation.ts` on the same voice. Three rules hold:

**She never claims to be human.** She has a name and writes like a person,
because a stilted message serves nobody, but asked whether she's a bot she says
so and carries on. This isn't only manners: brand outreach is commercial
solicitation, and letting the recipient assume a human wrote it is unlawful in
places we'll be emailing into (California's B.O.T. Act being the clearest).
The clause is appended after the configurable voice, so a persona row cannot
talk its way out of it — same standing as `gateOutsideGuardrails`.

**The brand-facing brief has no field for the creator's secrets.** `BrandBrief`
carries an asking rate and no floor, no guardrails, no address, no fee
arithmetic — not because the prompt asks her to keep quiet, but because they
are not in the bytes she is given. A prompt rule is a request; an absent field
is a fact. The prompt rules are the second line, for what legitimately has to
be in the brief.

**Nothing she writes to a brand sends itself.** Every brand-facing result comes
back with an approval gate, and the draft records what she declined to answer
so a dodge is visible rather than buried.

The two threads are separate rows (`Interaction.audience`) and are never
replayed into each other — the creator's thread is full of floor-rate talk.

## The front door

Until now every brand entered the system outbound: Scout sourced them, or an
operator typed the name. `/inquiries` is the other direction — a brand who
finds Nspiire and wants to book a creator, or a creator asking to be
represented. One form, one table, two lanes.

**No roster on the page.** A brand describes who they're after in free text;
they don't pick from a list. Who Nspiire represents belongs to the creators,
not the marketing site.

It is the only unauthenticated write anyone can reach without a token — the
deal room is public but needs 32 bytes of secret to reach — so it carries its
own defences: a honeypot, a per-address rate limit counted in the database
(serverless memory resets, so an in-process counter would be theatre), and hard
length caps. The honeypot and the rate limit both return the **success** screen;
telling a bot it was caught only tells its author what to change.

The submitter's IP is never stored. Rate limiting needs to recognise a repeat
submitter, which a salted hash does — salted, because the IPv4 space is small
enough that a bare SHA-256 is reversible with a wordlist and an afternoon.

New inquiries surface at the top of the dashboard. Nothing auto-replies to
them; that is still a person's job.

The home page used to point at `/onboarding` and `/dashboard`. Both were
operator-only, so the marketing page was advertising the agency console and its
primary CTA sent creators to a password prompt they could not satisfy. Both CTAs
now go to `/inquiries`; operator entry is a small link in the footer.

## How a brand hears from us

Email carries the first touch; the deal room carries the deal.

Cold outreach has to be a real email — a brand manager who has never heard of
Nspiire lives in their inbox, and a bare "click here to talk to our AI" from an
unknown domain reads as phishing. But the negotiation does not belong in email,
where terms are prose someone has to re-read and every reply is a threading
problem. So Iris's email stands on its own and carries a link, and everything
after that happens at `/b/<token>`.

That token is the whole authorisation. A brand cannot have an Nspiire login —
the operator password is the entire agency console and must never go near one —
so `lib/deals/brandAccess.ts` mints 32 bytes of CSPRNG per deal and that URL is
the brand's way in. Consequences, all handled rather than hoped for:

- **Scoped to one deal.** No listing, no other creator, no other brand.
- **`brandView()` builds the page field by field.** No `Deal` row reaches a
  template, so a column added later cannot surface there by accident. The
  floor rate, guardrails, fee arithmetic, shipping address and `terms.notes`
  (which carries the advisor's reasoning) are all absent by construction.
- **Only sent messages appear.** A draft a human hasn't approved does not exist
  to that page.
- **`no-referrer` and `noindex`**, so a path that is a password doesn't travel.
- **The brand's typed reply is untrusted text that reaches a model.** The
  defence is the same structural one: the brand-facing brief has no field for
  anything worth extracting, so an instruction buried in a reply has nothing to
  reveal.

The email wrapper (`lib/email/templates.ts`) is not decoration. Every commercial
message carries a physical postal address (CAN-SPAM — `footer()` throws rather
than ship a placeholder), a working opt-out, and a line saying what Iris is. The
opt-out sets `Brand.optedOutAt`, which the send path refuses on and Scout
filters — an opt-out that only gets recorded is worse than none.

Sending is env-gated like everything else: with no `RESEND_API_KEY` the console
says so and drafting still works. Send from a **subdomain** — cold outreach
reputation must never touch the domain that sends invoices and login mail.

Still manual: inbound email parsing. A brand who replies by email rather than
clicking through gets pasted in by an operator for now.

## Where product goes

A creator's shipping address is the most sensitive thing here: usually a home
address, impossible to take back once it is out, and leaked by a completely
ordinary question — "where do we send the box?". So `src/lib/creators/shipping.ts`
splits the control into three:

- **Whether** — `acceptsProduct`. Plenty of creators want cash deals only, and
  then the honest answer is that there is no address.
- **Where** — several destinations with one default, plus a per-deal override
  for "send this one to the studio". Nobody has exactly one address: a PO box
  for strangers, a studio for bulky things, home for almost nothing.
- **When** — `releaseAddressAt`, one of Terms agreed / Contract sent / Signed.
  Before that state the deal page shows only `Studio — Austin, US`; the lines a
  courier could deliver to stay hidden.

`addressReleased()` is a pure function of deal state and stated preference —
no judgement, no model call, nothing an agent can talk itself past. It fails
closed everywhere: the default is the strictest option (Signed), a malformed
policy column parses back to Signed, and a state off the happy path (Lost,
Renewal watch) releases nothing.

Three structural decisions back that up:

- Destinations are a **relation, not a Json column** on Creator, so a
  `include: { socials: true }`-style read never sweeps them up — which is why
  `GET /api/creators` cannot leak them.
- The per-deal override lives on `Deal.shipToId`, **not in `Deal.terms`**.
  Terms are snapshotted into the append-only transition log and handed to the
  Negotiator; an address belongs in neither.
- Rows are **archived, never deleted** — a parcel already in flight was
  addressed to one of them, and "where did that box go" has to stay answerable.

## How Nspiire gets paid

A human manager takes 15–20% out of the creator's cheque. Nspiire charges the
brand instead. `src/lib/deals/fee.ts` is the whole schedule — a marginal take
rate banded like tax brackets, so the rate regresses as deals grow:

| Band of the deal value | Marginal rate |
| --- | --- |
| first $5,000 | 5% |
| next $20,000 (to $25,000) | 4% |
| next $75,000 (to $100,000) | 3% |
| above $100,000 | 2% |

Then, in order: surcharges for what the brand is asking for beyond the standard
opening terms, the repeat-brand discount (−10% once a brand has paid on one deal
here, −20% from the fifth), and finally the **$25 minimum** and $25,000-per-deal
cap.

Surcharges are priced off the house standard — 30 days of usage, no exclusivity:

| Ask | Surcharge |
| --- | --- |
| usage 91–365 days | +10% |
| usage over 365 days | +20% |
| any exclusivity, under 90 days | +5% |
| exclusivity 90 days or more | +10% |

Usage gets a quarter of slack before anything bites; exclusivity gets none,
because the standard is none.

Worked baseline — a 1M-follower creator at $5,000 a video:

```
5% on the first $5,000 ........ $250
Fee ........................... $250  (5.0% of the deal)
Brand's total cheque ........ $5,250
Creator is paid ............. $5,000
```

The $25 minimum isn't a separate charge bolted on: it is the same 5% evaluated
at $500, so it only ever binds below $500 and the schedule stays continuous —
there is no deal size where a brand pays more and is billed less. Because we
don't source below $250, the minimum has a known worst case: **10%** at the
smallest deal we go looking for, sliding to 5% by $500. Zero-value deals
(gifting, product-only) are free.

The number is deliberately arithmetic, never a model call, for the same reason
as the terms advisor: it goes on an invoice, and every line of it has to be
readable back to a brand that asks "why $250?".

Billing keeps the two sides apart. A closed deal raises **two** invoices to the
brand — `CREATOR_RATE` and `PLATFORM_FEE` — rather than one that Nspiire
collects and splits. The creator's money never passes through us (blueprint §8,
money-transmitter risk).

## Dev

```bash
npm install
cp .env.example .env   # DATABASE_URL, ANTHROPIC_API_KEY
npx prisma generate
npm run dev
```
