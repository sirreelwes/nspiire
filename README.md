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
src/lib/agents/             the virtual agent roster
  types.ts                  guardrails, approval policy, shared contracts
  claude.ts                 Claude client helper
  scout.ts                  brand discovery + fit scoring
  pitch.ts                  outreach drafting (email-first)
  negotiator.ts             in-thread negotiation within guardrails
  counsel.ts                contract assembly + redlining (doc automation, not legal advice)
  books.ts                  invoicing/payment tracking (CardPointe TODO)
  orchestrator.ts           routing + approval queue
```

## Hard rules baked in

- The deal fee is charged to the **brand**, on top of the creator's rate — never netted out of it. A creator who agreed $5,000 is paid $5,000.
- Every deal state change goes through `transition()` and is logged — that log trains the deal-terms advisor.
- Negotiator can never auto-accept terms outside guardrails; `gateOutsideGuardrails` and `gateMoney` cannot be disabled.
- Contracts never send without human sign-off.
- MVP never holds funds (money-transmitter risk).

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

Then, in order: surcharges for terms that cost us work (+10% for usage rights
of 180 days or more, +10% for 90 days or more of category exclusivity), the
repeat-brand discount (−10% once a brand has paid on one deal here, −20% from
the fifth), and finally the **$25 minimum** and $25,000-per-deal cap.

Worked baseline — a 1M-follower creator at $5,000 a video:

```
5% on the first $5,000 ........ $250
Fee ........................... $250  (5.0% of the deal)
Brand's total cheque ........ $5,250
Creator is paid ............. $5,000
```

The $25 minimum isn't a separate charge bolted on: it is the same 5% evaluated
at $500, so it only ever binds below $500 and the schedule stays continuous —
there is no deal size where a brand pays more and is billed less. Zero-value
deals (gifting, product-only) are free.

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
