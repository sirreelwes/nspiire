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
- Nothing a virtual agent writes to a brand sends itself. Every brand-facing draft comes back gated.
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
