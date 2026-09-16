/** Interview preparation: how to present Relay honestly and answer likely questions. */

export const PITCH = {
  short:
    'Relay is a multi-tenant SaaS for small appointment-based businesses. A customer chats on the business’s page; Relay understands the request, applies the business’s rules, and turns it into a booking, a lead or a hand-off to a person — with tenant isolation in PostgreSQL, audited actions and a strict boundary around the AI.',
  long: [
    'Small businesses like a bike workshop answer the same questions and book the same appointments all day. Relay puts a chat on their public page that can answer from their own settings and FAQ, offer real free times per staff member, and book them — and hands anything it can’t handle reliably to the team’s inbox.',
    'Technically it’s a Next.js and TypeScript modular monolith on PostgreSQL. The parts I would highlight: tenant isolation enforced with row-level security and composite foreign keys; double-booking made impossible with an exclusion constraint and tested with concurrent requests; an AI boundary where the model only returns validated data and deterministic code decides; and an automation engine that is idempotent and least-privilege.',
    'It runs entirely locally at zero cost. The AI, email delivery and CAPTCHA are demo implementations behind interfaces, clearly labelled in the product, and there are unit, integration and browser tests including both demo scenarios.',
  ],
};

export const HONESTY = [
  'Relay was built with an AI coding assistant. Say so plainly if asked — many teams work this way now. What matters is that you can explain every decision and trace every flow, which is what this guide is for.',
  'Good phrasing: “I directed the architecture and the trade-offs, reviewed and tested the code, and I can walk you through any part of it.” Avoid claiming you wrote every line by hand.',
  'Be precise about what is simulated: the AI is a rules-based demo provider, emails stay in an outbox, and the bot check is a honeypot with a signed timestamp. The boundaries are real; the providers are not.',
  'Name the known gaps before an interviewer finds them: no password reset, no durable event queue, no email delivery worker, no manual screen-reader audit, and no legal compliance claims.',
];

export interface InterviewQuestion {
  category: string;
  question: string;
  answer: string[];
  /** Subsystem slugs to review. */
  review: string[];
}

export const QUESTIONS: InterviewQuestion[] = [
  {
    category: 'Architecture',
    question: 'Walk me through the architecture.',
    answer: [
      'A modular monolith: Next.js App Router for pages, server actions and a small public JSON API; business logic in `src/modules` (conversations, scheduling, automations, tenancy…); PostgreSQL through Prisma.',
      'Each request builds an actor context on the server, enters a tenant transaction, calls services that authorize and validate, and writes changes, audit entries and outbox emails together. Services return domain events that run automations after commit.',
    ],
    review: ['chat-pipeline', 'tenancy', 'web-boundary'],
  },
  {
    category: 'Architecture',
    question: 'Why a monolith and not microservices?',
    answer: [
      'One team, one product, strong consistency needs — a booking, its audit entry and its email must commit together. A monolith keeps that a single database transaction. The modules have clear boundaries, so something like the automation worker could be split out later if load required it.',
    ],
    review: ['automations', 'bookings'],
  },
  {
    category: 'Data',
    question: 'How do you keep one business from seeing another’s data?',
    answer: [
      'Three layers. Row-level security policies on every business table, keyed on a transaction-local setting that `withTenant` sets. Composite foreign keys on `(organizationId, id)` so references can’t cross tenants. And the app connects as a role that cannot bypass RLS. Integration tests prove each one — including that a query without a filter still sees nothing foreign.',
    ],
    review: ['tenancy'],
  },
  {
    category: 'Data',
    question: 'Two customers click the same time slot at the same moment. What happens?',
    answer: [
      'Both pass the availability check, but only one insert succeeds: an exclusion constraint forbids overlapping active bookings for the same staff member. The loser’s insert fails with 23P01; `createBooking` rolls back to a savepoint and tries another free staff member if the customer didn’t choose one, otherwise the chat apologises and offers new times. There is a test that fires the requests concurrently.',
    ],
    review: ['availability', 'bookings'],
  },
  {
    category: 'AI',
    question: 'How do you stop the AI from doing something wrong?',
    answer: [
      'It can’t do anything. The provider returns data in a strict schema; `understand()` validates shape and checks that every referenced id belongs to that business, with a timeout. Invalid output becomes “unknown”. A deterministic state machine decides the reply, and every action goes through services with the assistant’s least-privilege permissions — it can create a booking after explicit confirmation, but never cancel or approve.',
    ],
    review: ['ai-boundary', 'authorization'],
  },
  {
    category: 'AI',
    question: 'Is the AI real?',
    answer: [
      'No — and that’s intentional. It’s a deterministic provider using rules, keyword matching and a date parser, which made the product free to run and fully testable. It is labelled “Demo mode” in the product. The interface is designed for a real model with structured output; docs/ai-provider.md describes the steps.',
    ],
    review: ['ai-boundary'],
  },
  {
    category: 'Security',
    question: 'Why did you build authentication yourself?',
    answer: [
      'The scope was narrow — email and password, one session cookie — and I used only standard primitives: scrypt from Node’s crypto at OWASP parameters, random tokens stored as hashes, constant-time comparison. It stayed small and tested. If we needed OAuth, magic links or MFA I would adopt a maintained library instead; that condition is written down as a decision.',
    ],
    review: ['authentication'],
  },
  {
    category: 'Security',
    question: 'What are the biggest security risks in Relay, and what’s not covered?',
    answer: [
      'Covered: cross-tenant access, double-booking, credential stuffing, CSRF, XSS via CSP and React escaping, AI output misuse, spam, log leaks. Not covered or demo-only: the bot challenge stops only naive bots; IP rate limits need a trusted proxy; no MFA or password reset; the audit log is append-only for the app but not tamper-proof against a database admin. THREAT_MODEL.md lists these.',
    ],
    review: ['abuse-protection', 'audit-log', 'authentication'],
  },
  {
    category: 'Reliability',
    question: 'What happens if the email provider is down, or the server crashes mid-request?',
    answer: [
      'Emails are written to an outbox table in the same transaction as the change, so a provider outage can’t break or duplicate a booking. The honest gap is events: automations run in-process after commit, so a crash in that window loses the automation run. The next step is a durable event table with a worker, which is safe because runs are already idempotent.',
    ],
    review: ['email-outbox', 'automations'],
  },
  {
    category: 'Testing',
    question: 'How did you test it?',
    answer: [
      'Unit tests for pure logic — the slot finder including the October DST change, permissions, spam rules, the AI validation boundary. Integration tests against real PostgreSQL as the restricted app role, because isolation and double-booking prevention are database guarantees. Both demo scenarios are integration tests. Playwright covers sign-up, the chat booking, hand-off, role restrictions and axe accessibility scans.',
    ],
    review: ['testing'],
  },
  {
    category: 'Product',
    question: 'What was the hardest trade-off?',
    answer: [
      'How much to let the assistant do. A generative model that answers everything demos well, but a small business pays for wrong answers. I chose: answer only from structured settings and the FAQ, book only with explicit confirmation, and hand everything else to a person with the reason visible. It’s less magical and much more trustworthy.',
    ],
    review: ['handoff', 'setup-knowledge'],
  },
  {
    category: 'Next steps',
    question: 'If you had another month, what would you build?',
    answer: [
      'In order: a durable event outbox and worker (also delivering emails); password reset and optional MFA; a real AI provider with evaluation tests and cost limits; a real CAPTCHA; data retention jobs; manual accessibility testing; and deployment with CI, backups and monitoring.',
    ],
    review: ['automations', 'email-outbox', 'customer-data'],
  },
];

/** Files to read before an interview, in order. */
export const STUDY_ORDER: { file: string; why: string }[] = [
  {
    file: 'src/modules/conversations/pipeline.ts',
    why: 'The whole chat request in one function — the spine of the product.',
  },
  { file: 'src/modules/assistant/provider.ts', why: 'The AI boundary: timeout, schema, references.' },
  {
    file: 'src/modules/conversations/flow.ts',
    why: 'How decisions are made; skim `runFlow`, `offerSlots`, `onConfirm`, `handOff`.',
  },
  {
    file: 'src/modules/scheduling/bookings.ts',
    why: '`createBooking`: re-check, savepoint retry, audit, outbox, events.',
  },
  { file: 'src/modules/scheduling/slots.ts', why: 'The pure slot finder and its tests.' },
  { file: 'src/lib/db.ts', why: '`withTenant` and why the setting is transaction-local.' },
  {
    file: 'prisma/migrations/20260915160500_tenant_isolation_and_constraints/migration.sql',
    why: 'RLS policies and the exclusion constraint.',
  },
  { file: 'src/modules/tenancy/permissions.ts', why: 'Roles and the machine allowlists.' },
  { file: 'src/modules/automations/engine.ts', why: 'Idempotent, least-privilege automation runs.' },
  { file: 'src/modules/auth/accounts.ts', why: 'Authentication without account enumeration.' },
  {
    file: 'tests/integration/database-guarantees.test.ts',
    why: 'The tests that prove the database guarantees.',
  },
  { file: 'tests/integration/chat.test.ts', why: 'Both demo scenarios as tests.' },
];

export interface Simulation {
  name: string;
  simulated: string;
  real: string;
  where: string[];
  replace: string;
}

export const SIMULATIONS: Simulation[] = [
  {
    name: 'AI provider',
    simulated:
      'Understanding customer messages uses a deterministic rules engine (keyword matching, intent rules, a date parser) instead of a language model.',
    real: 'The provider interface, output validation, timeouts, rejection logging and every decision made after interpretation.',
    where: ['src/modules/assistant/mock-provider.ts', 'src/modules/assistant/provider.ts'],
    replace:
      'Implement `AIProvider` with a hosted model’s structured-output API, add it to the `AI_PROVIDER` enum in src/lib/env.ts, and keep `understand()` unchanged. See docs/ai-provider.md.',
  },
  {
    name: 'Outgoing email',
    simulated:
      'No email is delivered. Messages are stored in the outbox with status “Stored — not delivered” and shown under Setup → Email outbox.',
    real: 'When emails are created, their exact content, and the transactional outbox write.',
    where: ['src/modules/notifications/email.ts', 'src/app/app/setup/outbox/page.tsx'],
    replace:
      'Implement `EmailProvider.deliver` for a transactional email service, and add a worker that sends QUEUED rows and marks them SENT or FAILED with retries.',
  },
  {
    name: 'Incoming email',
    simulated: 'Instead of a mail provider’s webhook, an owner pastes an email into a form.',
    real: 'Everything after receipt: interpretation, FAQ answers by email, hand-off, customer records and automations.',
    where: ['src/modules/conversations/email-channel.ts'],
    replace:
      'Add a webhook route that verifies the provider’s signature and calls the same function with a system context.',
  },
  {
    name: 'Bot challenge (CAPTCHA)',
    simulated: 'A hidden honeypot field and an HMAC-signed render timestamp. It stops naive bots only.',
    real: 'The `ChallengeProvider` interface and where it is enforced (new conversations, sign-up).',
    where: ['src/modules/protection/challenge.ts'],
    replace:
      'Implement `verify` with Cloudflare Turnstile or hCaptcha server-side verification and render their widget.',
  },
  {
    name: 'Demo data',
    simulated:
      'Two fictional businesses with two months of generated bookings, conversations, leads and audit history.',
    real: 'All of it lives in the database and goes through the same schema and constraints as live data.',
    where: ['prisma/seed.ts'],
    replace:
      'Sign up a new business at /signup — it starts empty apart from one service and default automations.',
  },
  {
    name: 'Hosting',
    simulated: 'PostgreSQL and the app run locally on this machine.',
    real: 'Production-style database roles, migrations, security headers and environment validation.',
    where: ['scripts/db.mjs', 'DEPLOYMENT.md'],
    replace:
      'Use a managed PostgreSQL and a Node host behind a reverse proxy, as described in DEPLOYMENT.md.',
  },
];
