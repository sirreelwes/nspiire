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

- Every deal state change goes through `transition()` and is logged — that log trains the deal-terms advisor.
- Negotiator can never auto-accept terms outside guardrails; `gateOutsideGuardrails` and `gateMoney` cannot be disabled.
- Contracts never send without human sign-off.
- MVP never holds funds (money-transmitter risk).

## Dev

```bash
npm install
cp .env.example .env   # DATABASE_URL, ANTHROPIC_API_KEY
npx prisma generate
npm run dev
```
