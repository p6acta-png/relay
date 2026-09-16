# Interview guide

How to present Relay in a job interview: what to say, what to show, how to answer likely questions, and how to
be honest about how it was built. The interactive version, with a page per subsystem, is at `/learn/interview`
and `/learn` in the running app.

## 1. Be honest first

- **Relay was built with an AI coding assistant.** Say so if asked, plainly. A good way to put it: _"I directed
  the architecture and trade-offs, reviewed and tested the code, and I can walk you through any part of it."_
  Do not claim you typed every line.
- **Be exact about what is simulated.** The AI is a deterministic rules-based provider; emails are stored in an
  outbox, not sent; the bot check is a honeypot with a signed timestamp. The interfaces around them are real.
- **Name the gaps before they are found:** no password reset or MFA, no durable event queue, no email delivery
  worker, polling instead of realtime, no manual accessibility audit, never deployed, and no compliance claims.
- **Know it for real.** Before an interview, read the files in [section 6](#6-files-to-study-first) and be able to
  run both demo scenarios and the tests from memory.

## 2. The pitch

**30 seconds**

> Relay is a multi-tenant SaaS for small appointment-based businesses, like a bike workshop. A customer chats on
> the business's page; Relay understands the request, applies the business's rules, and turns it into a booking,
> a lead or a hand-off to a person. Under the hood, tenant isolation is enforced by PostgreSQL row-level security,
> double-booking is prevented by a database constraint, and the AI can only return validated data — plain code
> makes every decision.

**Two minutes** — add, in this order:

1. _The problem:_ small businesses answer the same questions and book the same appointments all day.
2. _The key product decision:_ Relay answers only from the business's own settings and FAQ, books only after
   explicit confirmation, and hands everything else to a person with the reason visible.
3. _Three engineering highlights:_ RLS + composite foreign keys; the exclusion constraint tested with concurrent
   requests; the AI boundary with a deterministic state machine and least-privilege actors.
4. _Proof:_ unit, integration (real PostgreSQL) and browser tests, including both demo scenarios and axe scans.
5. _Honesty:_ local and free to run; the AI, email and bot check are demo implementations behind interfaces.

## 3. What to show (five minutes)

Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md). If time is short: book in the chat → ask the discount question → show
the inbox as staff → show the audit log as owner → open `tests/integration/database-guarantees.test.ts`.

## 4. Likely questions and strong answers

### Architecture

**"Walk me through the architecture."**
A modular monolith: Next.js App Router with thin routes and server actions, business logic in `src/modules`,
PostgreSQL via Prisma. Every request builds an actor context on the server, enters a tenant transaction, and calls
services that authorize, validate, apply rules, and write the change, its audit entry and any email together.
Services return domain events that run automations after commit.

**"Why not microservices?"**
One product, one team, and operations that must be atomic — a booking, its audit entry and its email. A monolith
keeps that one transaction. Module boundaries mean the automation worker could be split out later if needed.

**"What would you change first to scale it?"**
Move event dispatch and email delivery to a durable table processed by workers; add connection pooling suited to
the host; add indexes guided by real query plans; consider SSE for chat updates. The database design (RLS,
constraints) already works across multiple app instances, as do the PostgreSQL-backed rate limits.

### Data and correctness

**"How do you stop one business seeing another's data?"**
Row-level security on every business table, keyed on a transaction-local setting from `withTenant`; it fails
closed when unset. Composite foreign keys stop cross-tenant references. The app role cannot bypass RLS. Tests prove
that a query without a filter, and a query explicitly asking for another tenant, both return nothing.

**"Two people book the same slot at the same time?"**
Both pass the availability check; only one insert succeeds because of an exclusion constraint on staff member and
time range. The loser gets SQLSTATE 23P01, the service tries another free staff member if allowed, otherwise the
chat apologises and offers new times. A test fires the requests concurrently.

**"How do you handle time zones?"**
Store instants; evaluate rules per local date in the business's IANA time zone. The slot finder is pure and
takes `now` and the zone as inputs, with a test for Oslo's October DST change.

### AI

**"How do you make sure the AI doesn't do something harmful?"**
It can't act. It returns a closed-schema interpretation; `understand()` enforces a timeout, validates the shape
and checks every id belongs to the business. Failures become "unknown". A state machine decides replies, and
actions go through services with the assistant's allowlist — it can create a booking after confirmation, never
cancel or approve.

**"Why isn't it a real LLM?"**
Zero budget and deterministic tests. The boundary is designed for a real model with structured output
([docs/ai-provider.md](docs/ai-provider.md)); swapping it doesn't touch booking logic. I'd add an evaluation set
and cost limits when doing so.

**"What about prompt injection?"**
The model has no tools and its output is validated against a closed schema, so injected text can't trigger
actions. It could still cause a wrong intent, which is why bookings need explicit confirmation and unknown
questions go to a person.

### Security

**"Why custom auth?"**
Narrow scope and standard primitives only: scrypt at OWASP parameters, random tokens stored hashed, constant-time
comparison, database sessions that can be revoked. It stayed small and tested. For OAuth, magic links or MFA I
would adopt a maintained library — that condition is written down in DECISIONS.md.

**"What's missing security-wise?"**
Real CAPTCHA, MFA and password reset, a trusted proxy for IP limits, tamper-evident audit against database
admins, CI with dependency scanning. See THREAT_MODEL.md.

### Reliability and testing

**"What happens if email is down or the server crashes?"**
Emails go into an outbox table in the same transaction, so a provider outage can't break or duplicate a booking.
The honest gap is automations: they run in-process after commit, so a crash in that window loses runs. The fix is
a durable event table; runs are already idempotent, so at-least-once delivery is safe.

**"How did you test it?"**
Unit tests for pure logic; integration tests against real PostgreSQL as the restricted app role, because isolation
and double-booking are database guarantees; Playwright tests against a production build, including both demo
scenarios, role restrictions, security headers and axe scans. A test found a real React 19 form-reset bug, fixed
in ADR-014.

### Product and process

**"What was the hardest trade-off?"**
How much the assistant should do. A generative bot answering everything demos well but costs a small business when
it's wrong. I chose to answer only from structured data and hand over the rest, with reasons visible.

**"What would you build next?"**
Durable events and an email worker; password reset and MFA; a real AI provider with evaluations; real CAPTCHA;
retention jobs; CI; a manual accessibility audit; deployment with backups and monitoring.

**"What did you learn?"**
Pick answers that are true for you. Candidates from this project: databases can enforce invariants that code
can't guarantee under concurrency; treating model output as untrusted input simplifies AI safety; browser tests
catch integration bugs that unit tests miss (the form reset, the axe findings).

## 5. Explaining with the code open

| Topic          | Open                                                                              | Point at                                                                    |
| -------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Pipeline       | `src/modules/conversations/pipeline.ts`                                           | numbered steps, `FOR UPDATE`, ports, `runAutomations` after the transaction |
| AI boundary    | `src/modules/assistant/provider.ts`                                               | timeout, `safeParse`, reference check                                       |
| Isolation      | `src/lib/db.ts` + the isolation migration                                         | `set_config(..., true)`, policy with `NULLIF`                               |
| Double-booking | `src/modules/scheduling/bookings.ts` + migration                                  | savepoint loop, `EXCLUDE USING gist`                                        |
| Permissions    | `src/modules/tenancy/permissions.ts`                                              | assistant and automation allowlists                                         |
| Automations    | `src/modules/automations/engine.ts`                                               | claim with unique constraint, least-privilege context                       |
| Proof          | `tests/integration/database-guarantees.test.ts`, `tests/integration/chat.test.ts` | test names as specification                                                 |

## 6. Files to study first

1. `src/modules/conversations/pipeline.ts` — the whole chat request.
2. `src/modules/assistant/provider.ts` and `interpretation.ts` — the AI contract and boundary.
3. `src/modules/conversations/flow.ts` — `runFlow`, `offerSlots`, `onConfirm`, `handOff`.
4. `src/modules/scheduling/bookings.ts` — `createBooking`.
5. `src/modules/scheduling/slots.ts` — the pure slot finder and its tests.
6. `src/lib/db.ts` — `withTenant`.
7. `prisma/migrations/20260915160500_tenant_isolation_and_constraints/migration.sql` — RLS and constraints.
8. `src/modules/tenancy/permissions.ts` and `context.ts` — roles and actors.
9. `src/modules/automations/engine.ts` — automation runs.
10. `src/modules/auth/accounts.ts`, `sessions.ts`, `password.ts` — authentication.
11. `tests/integration/database-guarantees.test.ts` and `chat.test.ts` — the proof.
12. `DECISIONS.md` — the reasons behind all of the above.
