# Relay

**Customer messages in. Bookings, leads and tasks out.**

Relay is a multi-tenant SaaS for small appointment-based businesses. A customer chats on the business's
public page; Relay understands the request, applies the business's own rules, and turns it into a booking,
a lead or a hand-off to a person — with tenant isolation enforced in PostgreSQL, audited actions, and a
strict boundary around the AI.

```
chat → validation → understanding → business rules → workflow → action → persistence → notification → audit
```

It is a portfolio project built to be run, read and explained. Everything runs locally at no cost. The AI,
email delivery and bot checks are demo implementations behind real interfaces, labelled **Demo mode** in the
product (see [What is simulated](#what-is-simulated)).

---

## Quick start

Requirements: **Node.js 22.12 or newer** and npm. No Docker, no admin rights, no accounts.

```bash
npm install
```

```bash
npm run setup
```

```bash
npm run dev
```

Open **http://localhost:3000**.

`npm run setup` creates `.env` with random local secrets, starts a pinned PostgreSQL 18.4 inside the project
folder (`.relay/`, port 54329), migrates the dev, test and e2e databases, and seeds two fictional
businesses. `npm run dev` starts the database if needed, then Next.js. Stop the database with
`npm run db:stop`.

> Setup was verified on Windows 11. The PostgreSQL binaries are also pinned for macOS and Linux, but those
> platforms have not been tested.

### Demo accounts

All use the password **`relay-demo-2026`**.

| Email                      | Business         | Role  | Sees                                  |
| -------------------------- | ---------------- | ----- | ------------------------------------- |
| `ingrid@eikogkant.example` | Eik & Kant       | Owner | Everything                            |
| `amina@eikogkant.example`  | Eik & Kant       | Admin | Setup, automations, team (not owners) |
| `jonas@eikogkant.example`  | Eik & Kant       | Staff | Inbox, bookings, leads, tasks only    |
| `sofie@bakgarden.example`  | Bakgården Frisør | Owner | A second business — proves isolation  |

### Where to go

| URL                                 | What                                                  |
| ----------------------------------- | ----------------------------------------------------- |
| http://localhost:3000               | Product home and demo guide                           |
| http://localhost:3000/w/eik-og-kant | A bike and ski workshop's public page with the chat   |
| http://localhost:3000/login         | Staff dashboard                                       |
| http://localhost:3000/learn         | **How Relay works** — the guided tour of the codebase |

### Two-minute demo

1. Open `/w/eik-og-kant`, click **Ask a question**, write _Can I book a standard service next Tuesday
   afternoon?_, pick a time, leave a name and email, confirm.
2. In a new chat, ask _Do you offer a student discount?_ — Relay says it can't answer reliably and hands
   over.
3. Log in as **jonas** (staff): the conversation waits in the inbox with Relay's interpretation and the
   hand-off reason. Reply — the customer sees it within seconds.
4. Log in as **ingrid** (owner): the booking, the audit log (filter by _Assistant_), Setup → Email outbox,
   and an automation's run history.

The full script with talking points is in [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

---

## What it does

**For customers** — an anonymous chat on the business's page that can:

- answer from the business's own settings (opening hours, address, prices) and FAQ, word for word, citing
  the source;
- offer real free times per staff member, in the business's time zone, and book them after explicit
  confirmation — instantly, or as a request for services that need staff approval;
- turn quote requests into leads;
- hand anything else to a person, and show staff replies in the same chat;
- manage (cancel) a booking through a private link, within the business's cancellation window.

**For businesses** — a dashboard with roles (Owner, Admin, Staff):

- **Today** board by staff member, **Inbox** with Relay's interpretation and hand-off reasons, **Bookings**
  (create, approve/decline, reschedule, cancel), **Leads**, **Tasks**, **Customers** (with erasure);
- **Automations**: trigger → conditions → actions rules with a builder that reads as a sentence,
  idempotent runs and per-step history;
- **Analytics** computed directly from the rows, and an append-only **Audit log**;
- **Setup**: business rules and opening hours, services, staff working hours, time off, knowledge base,
  team invitations and roles, the demo email outbox and a simulated inbound email channel.

---

## Architecture in one page

A **modular monolith**: Next.js 16 (App Router, React 19, TypeScript) with business logic in `src/modules`,
PostgreSQL through Prisma 7.

- **Tenant isolation in the database.** Business queries run in `withTenant`, which sets the organization
  for one transaction. Row-level security policies on every business table filter by it, composite foreign
  keys on `(organizationId, id)` prevent cross-tenant references, and the app connects as a role that
  cannot bypass RLS.
- **No double-booking, even under races.** A pure slot finder computes availability; a PostgreSQL
  exclusion constraint on staff member + time range makes overlapping bookings impossible.
- **The AI interprets; code decides.** A provider returns an interpretation that is validated for shape
  and for references to this business's catalogue. A deterministic state machine chooses the reply, and
  every action goes through services with least-privilege actor permissions — the assistant can create a
  booking but never cancel or approve one.
- **Everything significant is recorded.** Changes, their audit entries and outbound emails commit in one
  transaction (transactional outbox). Domain events trigger automations after commit; runs are idempotent.
- **Abuse protection** with PostgreSQL rate limits, a CAPTCHA-ready challenge interface, spam signals,
  Origin checks and a nonce-based Content-Security-Policy.

Details: [ARCHITECTURE.md](ARCHITECTURE.md) · decisions and trade-offs: [DECISIONS.md](DECISIONS.md).

```
src/
  app/            routes: public page (w/), dashboard (app/), auth, onboarding, public API, /learn
  modules/        business logic: conversations, assistant, scheduling, automations, tenancy, auth,
                  protection, audit, notifications, catalog, customers, crm, analytics, learn
  server/         request helpers: session cookie, dashboard context, server-action wrapper, HTTP
  lib/            db (withTenant), env validation, errors, time zones, tokens, logger
  components/     shared UI with built-in accessibility
  content/        demo accounts and the /learn teaching content
prisma/           schema, migrations (RLS, constraints), seed
scripts/          local PostgreSQL (db.mjs), one-command setup, e2e server
tests/            integration (real PostgreSQL) and e2e (Playwright + axe); unit tests live next to code
```

---

## Tests

```bash
npm run check
```

```bash
npm run test:e2e
```

- **Unit** (Vitest): slot finder incl. the October DST change, permissions, spam rules, password hashing,
  the AI validation boundary and demo provider, automation definitions, and a content test that keeps
  `/learn` in sync with the code.
- **Integration** (Vitest, real PostgreSQL as the restricted app role): RLS and fail-closed reads,
  composite keys, the exclusion constraint, append-only audit log, auth and sessions, rate limits under
  concurrency, concurrent booking races, both demo scenarios, automation idempotency, setup permissions,
  the email channel.
- **End-to-end** (Playwright against a production build with its own database): sign-up and onboarding,
  both demo scenarios through the UI, role restrictions, CSP and cookie flags, and axe scans.

See [TESTING.md](TESTING.md).

---

## What is simulated

| Integration    | In this build                                                      | To make it real                                                     |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| AI provider    | Deterministic rules, keyword matching and a date parser            | Implement `AIProvider` — [docs/ai-provider.md](docs/ai-provider.md) |
| Outgoing email | Stored in the in-app outbox, marked "not delivered"                | Implement `EmailProvider.deliver` plus a delivery worker            |
| Incoming email | Pasted into a form in Setup → Email outbox                         | A provider webhook calling the same handler                         |
| Bot challenge  | Honeypot field and signed render timestamp (stops naive bots only) | Implement `ChallengeProvider` with Turnstile or hCaptcha            |
| Hosting        | Local PostgreSQL and Next.js                                       | [DEPLOYMENT.md](DEPLOYMENT.md)                                      |

The businesses, people and addresses are fictional; emails use the reserved `.example` domain. Relay makes
**no certification or legal compliance claims** (for example ISO 27001 or GDPR).

---

## Known limitations

- **Automations run in-process after commit.** A crash between commit and dispatch loses those runs; the
  fix is a durable event table processed by a worker.
- **No email delivery worker** yet (the outbox and the provider interface exist).
- **No password reset or MFA.** Sessions have a fixed 14-day lifetime; there is no "log out everywhere" button.
- **The demo AI understands a documented set of English phrasings.** Other phrasings usually become
  "unknown" and, after two misunderstandings, a hand-off.
- **IP-based rate limits need a trusted reverse proxy** that sets `x-forwarded-for`.
- **Chat updates use polling** (every 5 seconds while open), not WebSockets or SSE.
- **Erasure does not yet remove outbox emails**, and there is no retention job.
- **Accessibility is checked with axe**, not with a manual screen-reader audit.
- **Pages that read the booking link are not rate-limited** (cancelling is).
- One PostgreSQL warning from Prisma's driver adapter (`client.query() when the client is already executing
a query`) appears in test output; see DECISIONS.md, ADR-010.

---

## Documentation

| Document                                   | For                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [/learn](http://localhost:3000/learn)      | The guided tour: beginner and developer explanations, walkthroughs, architecture explorer |
| [ARCHITECTURE.md](ARCHITECTURE.md)         | Components, request flows, data model, boundaries                                         |
| [DECISIONS.md](DECISIONS.md)               | Architecture decision records                                                             |
| [SECURITY.md](SECURITY.md)                 | Security controls and what is not claimed                                                 |
| [THREAT_MODEL.md](THREAT_MODEL.md)         | Assets, trust boundaries, threats and residual risk                                       |
| [TESTING.md](TESTING.md)                   | How to run the suites and what they prove                                                 |
| [DEPLOYMENT.md](DEPLOYMENT.md)             | What a hosted deployment needs                                                            |
| [INTERVIEW_GUIDE.md](INTERVIEW_GUIDE.md)   | Presenting and explaining Relay                                                           |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md)           | A timed demo                                                                              |
| [docs/ai-provider.md](docs/ai-provider.md) | Connecting a real AI provider safely                                                      |

## How it was built

Relay was designed and built with the help of an AI coding assistant (Claude). The architecture, trade-offs
and scope were directed and reviewed; every flow is covered by tests and explained in `/learn`.
