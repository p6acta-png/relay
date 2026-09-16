# Architecture decision records

Short records of the decisions that shape Relay: the context, what was chosen, what was rejected, and the
consequences — including the uncomfortable ones.

| ADR                                                                              | Decision                                                         |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [001](#adr-001-modular-monolith-on-nextjs-and-postgresql)                        | Modular monolith on Next.js and PostgreSQL                       |
| [002](#adr-002-shared-tables-with-row-level-security-and-composite-foreign-keys) | Shared tables with row-level security and composite foreign keys |
| [003](#adr-003-local-postgresql-from-pinned-npm-binaries-driven-by-pg_ctl)       | Local PostgreSQL from pinned npm binaries, driven by `pg_ctl`    |
| [004](#adr-004-a-small-custom-session-layer-instead-of-an-auth-library)          | A small custom session layer instead of an auth library          |
| [005](#adr-005-the-ai-interprets-deterministic-code-decides)                     | The AI interprets; deterministic code decides                    |
| [006](#adr-006-an-exclusion-constraint-prevents-double-booking)                  | An exclusion constraint prevents double-booking                  |
| [007](#adr-007-domain-events-after-commit-and-a-transactional-email-outbox)      | Domain events after commit, and a transactional email outbox     |
| [008](#adr-008-rate-limits-stored-in-postgresql)                                 | Rate limits stored in PostgreSQL                                 |
| [009](#adr-009-pinned-toolchain-versions)                                        | Pinned toolchain versions                                        |
| [010](#adr-010-accept-a-pg-deprecation-warning-raised-inside-prisma)             | Accept a `pg` deprecation warning raised inside Prisma           |
| [011](#adr-011-a-structured-knowledge-base-instead-of-rag)                       | A structured knowledge base instead of RAG                       |
| [012](#adr-012-core-flows-before-breadth)                                        | Core flows before breadth                                        |
| [013](#adr-013-client-ip-is-a-coarse-signal)                                     | Client IP is a coarse signal                                     |
| [014](#adr-014-controlled-forms-submit-through-a-transition)                     | Controlled forms submit through a transition                     |
| [015](#adr-015-polling-for-chat-updates)                                         | Polling for chat updates                                         |

---

## ADR-001: Modular monolith on Next.js and PostgreSQL

**Context.** One developer, a product whose key operations need strong consistency (a booking, its audit entry
and its email must commit together), and a zero budget.

**Decision.** A single Next.js application (App Router, server components, server actions) in TypeScript, with
business logic in `src/modules` and one PostgreSQL database accessed through Prisma. Route handlers and actions
stay thin and call module services.

**Rejected.** Microservices (distributed transactions for no benefit at this scale); a separate API server plus
SPA (duplicated types and auth for one client).

**Consequences.** Simple deployment and transactions. Module boundaries are a convention enforced by review,
not by the build. The automation worker is the most likely first piece to split out.

## ADR-002: Shared tables with row-level security and composite foreign keys

**Context.** Many small businesses share one deployment. A missing `WHERE organizationId = …` must not become a
data leak.

**Decision.** Every business table carries `organizationId`, has an RLS policy comparing it to a
transaction-local setting, and uses composite foreign keys on `(organizationId, id)`. The app connects as a
role that is not the owner and has `NOBYPASSRLS`; migrations run as the owner. `withTenant` sets the
organization with `set_config(…, true)`.

**Rejected.** Database or schema per tenant (heavy migrations and operations for many small tenants);
application-level filtering alone.

**Consequences.** Isolation holds even with a buggy query, proven by integration tests. Every business read
needs a transaction. Identity tables (users, sessions, memberships, invites) stay outside RLS because they
are read before a tenant is known, so those modules must be reviewed carefully.

## ADR-003: Local PostgreSQL from pinned npm binaries, driven by `pg_ctl`

**Context.** The development machine has no admin rights and no Docker. The user required a real PostgreSQL
(RLS, exclusion constraints) and no silent switch to another database.

**Decision.** Use the PostgreSQL 18.4 binaries shipped in the pinned `@embedded-postgres/<platform>` packages,
but control them with PostgreSQL's own `initdb` and `pg_ctl -w start/stop -m fast` from `scripts/db.mjs`.
The cluster lives in `.relay/postgres`, listens on localhost:54329, and has separate admin, owner and app roles.

**Rejected.** The `embedded-postgres` JavaScript wrapper: in a spike on Windows its `stop()` terminated only
the main process and orphaned a worker that kept the port open and hung Node. Docker and system installs: not
available. SQLite: no RLS or exclusion constraints. A hosted free tier: an external account and data leaving the
machine.

**Consequences.** `npm run setup` works without privileges and reproduces the same version everywhere the
binaries exist. Only Windows has been verified. The port comes from `.env` at every start.

## ADR-004: A small custom session layer instead of an auth library

**Context.** The dashboard needs email and password login with server-side sessions. The user asked to keep a
custom implementation only if it stayed simple and secure, and otherwise to use a mature library.

**Decision.** Keep it custom, using only standard primitives: `crypto.scrypt` at OWASP parameters (N=2^17, r=8,
p=1) with parameters stored in the hash and rehash on login; 256-bit random session tokens stored as SHA-256
hashes; an `HttpOnly`, `SameSite=Lax` cookie (`Secure`, `__Host-` in production); a 14-day absolute lifetime;
constant-time verification with a dummy hash for unknown emails; rate limits per IP and per email.

**Rejected.** Auth.js and similar libraries — the right choice once OAuth, magic links or MFA are needed, but
more configuration than value for one credential type.

**Consequences.** A few hundred lines, fully tested. No password reset or MFA yet. Revisit this ADR the moment
either is required.

## ADR-005: The AI interprets; deterministic code decides

**Context.** The product needs to understand free text, but bookings affect real people's time and a model can
be wrong, slow or manipulated by the text it reads. There is no budget for model APIs.

**Decision.** `AIProvider.interpret` returns `unknown`. `understand()` applies a timeout, validates the output
with Zod, and checks that referenced services and FAQ items belong to the business; any failure becomes the
`unknown` interpretation with a recorded reason. A deterministic state machine (`runFlow`) decides replies and
requests side effects through ports implemented by services with the assistant's least-privilege permissions.
The shipped provider is a deterministic rules engine, labelled as a demo.

**Rejected.** Letting a model call tools with write access; generating answers about the business from
free-form descriptions.

**Consequences.** Predictable, testable behaviour (both demo scenarios are integration tests) and a small
prompt-injection surface. The demo provider understands a limited set of phrasings. Replacing it is one
interface — see docs/ai-provider.md.

## ADR-006: An exclusion constraint prevents double-booking

**Context.** Two customers can confirm the same staff member at the same moment. A check-then-insert in code
races.

**Decision.** `EXCLUDE USING gist (staffMemberId WITH =, tstzrange(startsAt, endsAt, '[)') WITH &&) WHERE status
IN ('PENDING','CONFIRMED')`, with `btree_gist`. Application code re-checks the exact slot first (for good
messages) and inserts inside a savepoint loop over free staff, treating `23P01` as "taken".

**Rejected.** SERIALIZABLE transactions with retries on every booking path; advisory locks keyed on staff and
time.

**Consequences.** The invariant holds for every write path, present and future. Requests that approve later
still hold the slot (PENDING is covered).

## ADR-007: Domain events after commit, and a transactional email outbox

**Context.** Bookings and hand-offs should trigger notifications, tasks and emails without coupling modules or
letting a slow email service break a booking.

**Decision.** Services return domain events; callers dispatch them after commit to the automation engine, which
claims each run with a unique `(automationId, eventId)` and runs actions as a least-privilege automation actor.
Emails are inserted into `OutboundEmail` in the originating transaction. Automations never re-dispatch events
produced by their actions.

**Rejected.** Calling notification and email code directly inside services; an external message broker.

**Consequences.** Reactions never see rolled-back changes and cannot break the original action; loops are
impossible. **Accepted limitation:** dispatch is in-process, so a crash between commit and dispatch loses
automation runs, and no delivery worker exists yet. Next step: a durable event table and a worker.

## ADR-008: Rate limits stored in PostgreSQL

**Decision.** Fixed-window counters updated with one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`, keyed
by rule and an HMAC of the subject (IP, email or conversation), with opportunistic cleanup.

**Rejected.** In-memory counters (reset on restart, wrong with several instances); Redis (another service).

**Consequences.** Correct under concurrency (tested) with no new infrastructure. Bursts at window edges are
possible; a token bucket is the upgrade path.

## ADR-009: Pinned toolchain versions

**Context.** At the time of building, `prisma@latest` resolved to an 8.0 release candidate while
`@prisma/client@latest` was 7.10.0; TypeScript 7 was not supported by typescript-eslint; `eslint-config-next`
plugins did not support ESLint 10.

**Decision.** Pin exact versions: Prisma 7.10.0, TypeScript 6.0.3, ESLint 9.39.5, Next.js 16.3.5 and the
PostgreSQL binaries. The package is `"type": "module"` so the seed script can use top-level `await`, and it
runs with `--conditions=react-server` so it can import modules marked `server-only`. npm's `allowScripts`
lists the packages allowed to run install scripts.

**Consequences.** Reproducible installs. Upgrades are deliberate and tested.

## ADR-010: Accept a `pg` deprecation warning raised inside Prisma

**Context.** Integration tests print `DeprecationWarning: Calling client.query() when the client is already
executing a query`. Relay's own code originally caused some of these by running `Promise.all` inside
transactions; those were rewritten as sequential queries. The remaining warning was traced
(`--trace-deprecation`) to Prisma's query interpreter issuing concurrent sub-queries on a transaction client
through `@prisma/adapter-pg`.

**Decision.** Keep Prisma 7.10 and document the warning. Queries still run correctly: `pg` currently queues
them on the connection.

**Consequences.** Must be revisited before upgrading to `pg` 9, where the behaviour is removed — either a
Prisma release that serialises sub-queries, or restructuring the affected includes.

## ADR-011: A structured knowledge base instead of RAG

**Decision.** FAQ answers are structured items (question, exact answer, keywords, published), matched by the
provider and answered verbatim with a source label. Opening hours, address and prices come from settings.
Unmatched questions are handed to a person.

**Rejected.** Retrieval-augmented generation over documents.

**Consequences.** No hallucinated business facts, no vector store. Coverage depends on the owner adding answers
— hand-offs show which ones are missing.

## ADR-012: Core flows before breadth

**Context.** The brief prioritised: customer chat → intent handling → availability → booking → dashboard →
human hand-off → automation → audit → tests, and asked not to sacrifice core flows for secondary sections.

**Decision.** Build and test the flows in that order. Keep the automation vocabulary small (six triggers, four
conditions, six actions). Leave out payments, SMS, calendar sync, customer accounts and multi-location support.

**Consequences.** Every shipped feature is tested and explained; the product is deliberately narrow.

## ADR-013: Client IP is a coarse signal

**Context.** Next.js fills `x-forwarded-for` from the socket only when the header is absent, so a client talking
to the app directly can spoof it.

**Decision.** Use IP-based limits only as a first layer, and key the limits that matter on values a client
cannot rotate for free: the email being logged into and the conversation being written to. Document that
production must run behind a proxy that overwrites the header.

**Consequences.** A deployment requirement recorded in DEPLOYMENT.md and THREAT_MODEL.md.

## ADR-014: Controlled forms submit through a transition

**Context.** React 19 resets a `<form action={…}>` after its action completes. In forms whose checkboxes and
selects are controlled by React state (setup forms, the automation builder, booking and onboarding forms), the
reset restored DOM defaults that no longer matched state — a failed submit left boxes visibly ticked while
state said unticked, and the next submit sent the wrong data. Found by a browser test.

**Decision.** Controlled forms call the server action inside `startTransition` from `onSubmit`
(`submitWithoutReset`), and pass `useActionState`'s pending flag to the submit button. Uncontrolled forms keep
the default behaviour, restoring input with `previousValue`.

**Consequences.** Correct forms; those forms require JavaScript (they already did, as they post JSON payloads).

## ADR-015: Polling for chat updates

**Decision.** The widget polls for new messages every 5 seconds while the chat is open and the tab is visible,
rate-limited per IP.

**Rejected.** WebSockets or Server-Sent Events.

**Consequences.** Stateless, proxy-friendly and simple to test; up to 5 seconds of delay for staff replies. SSE
is the next step if many conversations are active at once.
