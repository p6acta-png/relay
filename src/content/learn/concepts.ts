import type { Concept } from './types';

/** Ground-up explanations of ideas the codebase relies on. */
export const CONCEPTS: Concept[] = [
  {
    slug: 'multi-tenancy',
    term: 'Multi-tenancy',
    beginner:
      'One app serving many separate customers (“tenants”) — here, many businesses — while keeping each one’s data private, like flats in one building with separate locks.',
    developer:
      'Relay uses a shared schema: every business row carries `organizationId`. Isolation is enforced by PostgreSQL row-level security plus composite foreign keys, not only by query filters.',
    seeAlso: ['tenancy'],
  },
  {
    slug: 'row-level-security',
    term: 'Row-level security (RLS)',
    beginner:
      'A database feature that decides, row by row, what a connection is allowed to see or change. The rule lives in the database, so every query obeys it.',
    developer:
      'Policies with `USING` (visibility) and `WITH CHECK` (writes) on each table. They apply to roles without BYPASSRLS that do not own the table. Relay’s policies compare `organizationId` with a transaction-local setting.',
    seeAlso: ['tenancy'],
  },
  {
    slug: 'transaction',
    term: 'Transaction',
    beginner:
      'A group of database changes that happen all together or not at all. If booking a time fails halfway, nothing from that attempt is saved.',
    developer:
      'Relay uses interactive Prisma transactions via `withTenant`. The change, its audit entry and any outbox email share one transaction. Automations run after commit. Savepoints allow retrying one insert without abandoning the transaction.',
    seeAlso: ['tenancy', 'bookings', 'audit-log'],
  },
  {
    slug: 'race-condition',
    term: 'Race condition',
    beginner:
      'A bug that only happens when two things happen at almost the same moment — two people clicking “book” for the same time. Each checks “free?”, both see yes, both book.',
    developer:
      'A check-then-act anomaly between concurrent transactions. Relay removes it with an exclusion constraint (the database serialises conflicting inserts) and a row lock on the conversation for concurrent chat messages.',
    seeAlso: ['availability', 'chat-pipeline'],
  },
  {
    slug: 'exclusion-constraint',
    term: 'Exclusion constraint',
    beginner:
      'A database rule saying “no two rows may overlap in this way” — for example, the same mechanic booked for overlapping times.',
    developer:
      "A GiST-indexed `EXCLUDE` constraint combining equality on `staffMemberId` (via btree_gist) with range overlap `&&` on `tstzrange(startsAt, endsAt, '[)')`, filtered to active statuses. Violations raise SQLSTATE 23P01.",
    seeAlso: ['availability'],
  },
  {
    slug: 'time-zones',
    term: 'Time zones and daylight saving',
    beginner:
      '“09:00” depends on where you are, and some days in Oslo have 23 or 25 hours because clocks change. Relay stores exact moments and applies the business’s local clock only when working out rules.',
    developer:
      'Instants are stored as `timestamptz`. Rules are evaluated per local date with the IANA zone (`Europe/Oslo`) using `@date-fns/tz`. Never add 24 hours to get “tomorrow”; add a calendar day and convert.',
    seeAlso: ['availability', 'setup-knowledge'],
  },
  {
    slug: 'hashing',
    term: 'Hashing (and why passwords are different)',
    beginner:
      'A hash turns data into a fingerprint that can’t be turned back. Relay stores fingerprints of passwords and secret links, not the originals.',
    developer:
      'Random 256-bit tokens only need SHA-256, because they cannot be guessed. Passwords are guessable, so they need a slow, salted, memory-hard function — scrypt — to make each guess expensive.',
    seeAlso: ['authentication', 'bookings'],
  },
  {
    slug: 'session',
    term: 'Session',
    beginner:
      'How a website remembers you are logged in: after login, your browser keeps a secret key in a cookie and shows it with each request.',
    developer:
      'Relay’s sessions are database rows keyed by the token’s hash, with an absolute expiry, delivered in an HttpOnly, SameSite=Lax cookie. Revocation is a delete.',
    seeAlso: ['authentication'],
  },
  {
    slug: 'csrf-xss',
    term: 'CSRF and XSS',
    beginner:
      'CSRF tricks your browser into sending a request to a site you are logged into. XSS sneaks the attacker’s code into a page you trust. Both are classic web attacks.',
    developer:
      'CSRF: SameSite=Lax cookies, Next.js server actions’ Origin check, and an explicit Origin check plus header token on the public API. XSS: React escapes text, customer text is never rendered as HTML, and a nonce-based CSP blocks injected scripts.',
    seeAlso: ['web-boundary', 'authentication'],
  },
  {
    slug: 'authorization',
    term: 'Authentication vs authorization',
    beginner:
      'Authentication asks “who are you?” (logging in). Authorization asks “are you allowed to do this?” (a mechanic changing prices — no).',
    developer:
      'Authentication yields a session; authorization is a permission check on an actor context inside every service. Non-human actors (assistant, automation, customer) get least-privilege allowlists.',
    seeAlso: ['authentication', 'authorization'],
  },
  {
    slug: 'validation',
    term: 'Validation at the boundary',
    beginner:
      'Checking everything that comes from outside before using it: form fields, chat messages, and even the AI’s answers.',
    developer:
      'Zod schemas parse unknown input into typed data (`safeParse`), producing field errors. After the boundary, code can trust the types. Relay validates in services, not only in forms, because many callers reach the same service.',
    seeAlso: ['web-boundary', 'ai-boundary'],
  },
  {
    slug: 'idempotency',
    term: 'Idempotency',
    beginner:
      'Doing something twice has the same effect as doing it once — pressing a lift button again doesn’t call two lifts.',
    developer:
      'Automation runs are claimed with a unique `(automationId, eventId)` insert, so duplicate dispatch is a no-op. Hand-off returns no event if the conversation is already handed off.',
    seeAlso: ['automations', 'handoff'],
  },
  {
    slug: 'domain-events',
    term: 'Domain events',
    beginner:
      'Small notes saying “something happened” — “a booking was confirmed” — that other parts of the system can react to without being tangled into the original code.',
    developer:
      'Services return `{ result, events }`. The caller dispatches events after the transaction commits, so reactions never see uncommitted data and cannot break the original action.',
    seeAlso: ['automations', 'bookings'],
  },
  {
    slug: 'transactional-outbox',
    term: 'Transactional outbox',
    beginner:
      'Instead of sending an email in the middle of saving a booking, Relay writes “send this email” into a to-do table as part of the same save. Something else sends it afterwards.',
    developer:
      'Side effects to external systems are recorded as rows in the same transaction as the state change, then delivered asynchronously with retries. It avoids both lost emails and emails for rolled-back changes.',
    seeAlso: ['email-outbox', 'automations'],
  },
  {
    slug: 'state-machine',
    term: 'State machine',
    beginner:
      'A program that is always in one known step — “choosing a service”, “choosing a time”, “confirming” — and moves between steps only in allowed ways.',
    developer:
      'The conversation flow stores a validated discriminated union (`step`) per conversation. Each input produces replies and the next state, deterministically, with side effects behind ports.',
    seeAlso: ['chat-pipeline'],
  },
  {
    slug: 'ports-adapters',
    term: 'Ports and adapters',
    beginner:
      'Writing the important logic so it asks for help through a plug socket, not a specific device. In tests you plug in a fake; in the app you plug in the real thing.',
    developer:
      'The flow depends on a `FlowPorts` interface; the pipeline implements it with services. The same idea shapes `AIProvider`, `EmailProvider` and `ChallengeProvider`, which is how demo implementations can be swapped for real ones.',
    seeAlso: ['chat-pipeline', 'ai-boundary', 'email-outbox'],
  },
  {
    slug: 'rate-limiting',
    term: 'Rate limiting',
    beginner:
      'Limiting how often something can be done — 10 login attempts per 15 minutes — to slow down abuse.',
    developer:
      'Fixed-window counters updated with an atomic upsert, keyed by an HMAC of the subject. Layered per IP, per email and per conversation.',
    seeAlso: ['abuse-protection'],
  },
  {
    slug: 'server-components',
    term: 'Server components and server actions',
    beginner:
      'In Next.js, most of a page can be built on the server, and forms can call server functions directly. Less code runs in the browser.',
    developer:
      'React Server Components render on the server and can call services; client components handle interaction. Server actions are POST endpoints invoked from forms — they need authentication, authorization and validation like any API.',
    seeAlso: ['web-boundary', 'interface-accessibility'],
  },
  {
    slug: 'modular-monolith',
    term: 'Modular monolith',
    beginner:
      'One app, deployed as one thing, but organised into clear sections (bookings, conversations, automations) that talk through defined functions.',
    developer:
      'Modules under `src/modules` own their data access and rules; the web layer in `src/app` stays thin. It keeps transactions simple and could be split later along module boundaries if scale demanded it.',
    seeAlso: ['chat-pipeline', 'web-boundary'],
  },
];
