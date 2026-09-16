import type { Subsystem } from './types';

export const BUSINESS_SUBSYSTEMS: Subsystem[] = [
  {
    slug: 'automations',
    title: 'Automations',
    group: 'Running the business',
    summary:
      'Simple “when this happens, if these hold, do that” rules — validated, idempotent, least-privilege and recorded step by step.',
    beginner: [
      'Owners can set up small rules without programming: “When a booking needs approval, notify the owners and create a task”, or “When a new conversation starts and we’re closed, tell the customer we’ll reply in the morning”.',
      'Each rule has three parts: a trigger (what happened), optional conditions (only for this service, only when closed, only new customers), and one or more actions (send a message, email the customer, notify the team, create a task, assign someone). The builder shows the rule as a plain sentence while you edit it.',
      'Every time a rule runs, Relay records each step and whether it worked, and a rule can never run twice for the same event. Rules also cannot trigger other rules, so they can never get stuck in a loop.',
    ],
    professional: [
      'An automation is stored as JSON (`conditions`, `actions`) and validated with `automationDefinitionSchema` on save and again on every run, because stored configuration can become invalid (a deleted service, a schema change). Compatibility tables (`CONDITION_TRIGGERS`, `ACTION_TRIGGERS`) reject combinations that make no sense, and message templates only accept a fixed list of placeholders. On save, referenced services and members must belong to the organization.',
      'Services return domain events (`WithEvents`); callers dispatch them after commit with `runAutomations(events)`. For each matching automation, the engine evaluates conditions against a context loaded from the database, then claims the run by inserting an `AutomationRun` with a unique `(automationId, eventId)` — a duplicate delivery hits the constraint and is skipped. Each action runs in its own transaction through the normal services, as an `automation` actor with a narrow allowlist (it cannot create, cancel or decide bookings). Step results and an audit entry close the run.',
      'Events produced by actions are not dispatched again, which removes loops by construction. Dispatch is in-process and after commit; a crash in between loses the run — the documented next step is a durable event outbox and a worker.',
    ],
    why: [
      {
        decision: 'A small, fixed vocabulary of triggers, conditions and actions.',
        because:
          'Every combination can be validated, described in a sentence and tested. Small businesses need a few dependable rules, not a workflow language.',
        instead: 'A general expression language or visual node graph.',
      },
      {
        decision: 'Idempotency through a unique constraint on (automation, event).',
        because: 'It holds even with retries or double dispatch, without distributed locks.',
        instead: 'Checking “has this run?” in code before running.',
      },
      {
        decision: 'Actions call the same services as people, with their own least-privilege actor.',
        because:
          'Automations inherit all validation and audit, and cannot do anything the owner could not see or undo.',
        instead: 'Direct database writes from the automation engine.',
      },
    ],
    files: [
      { path: 'src/modules/automations/definitions.ts', role: 'Vocabulary, compatibility rules, schemas' },
      { path: 'src/modules/automations/engine.ts', role: 'Dispatch, idempotent runs, action execution' },
      { path: 'src/modules/automations/evaluate.ts', role: 'Condition evaluation and safe templates' },
      { path: 'src/modules/automations/manage.ts', role: 'Save, enable, delete, list runs' },
      { path: 'src/modules/events.ts', role: 'Domain event types' },
      {
        path: 'src/app/app/automations/_components/automation-builder.tsx',
        role: 'The builder UI with a live sentence',
      },
    ],
    snippets: [
      {
        title: 'What an automation may contain',
        ref: { file: 'src/modules/automations/definitions.ts', region: 'automation-schema' },
        note: 'The `superRefine` rejects conditions and actions that don’t fit the trigger.',
      },
      {
        title: 'One run: validate, match, claim, execute, record',
        ref: { file: 'src/modules/automations/engine.ts', region: 'run-automation' },
        note: 'The claim is an insert that fails on a duplicate — that is the idempotency guarantee.',
      },
      {
        title: 'Executing an action through real services',
        ref: { file: 'src/modules/automations/engine.ts', region: 'execute-action' },
        note: 'Each case authorizes with the automation’s own context before acting.',
      },
      {
        title: 'Conditions are pure',
        ref: { file: 'src/modules/automations/evaluate.ts', region: 'evaluate-conditions' },
        note: 'It returns the first condition that did not match, which the run history can explain.',
      },
      {
        title: 'Saving an automation',
        ref: { file: 'src/modules/automations/manage.ts', region: 'save-automation' },
        note: 'Schema validation first, then a check that every referenced service and member belongs to this business.',
      },
    ],
    failures: [
      {
        what: 'A stored automation refers to something that changed.',
        handling: 'Re-validation fails; the run is recorded as FAILED with “open it and save it again”.',
      },
      {
        what: 'One action in a sequence fails.',
        handling:
          'Later actions are skipped and recorded as skipped; earlier actions stay done (each ran in its own transaction).',
      },
      {
        what: 'The same event is dispatched twice.',
        handling: 'The unique constraint on `(automationId, eventId)` makes the second attempt a no-op.',
      },
      {
        what: 'The process crashes after a booking commits but before automations run.',
        handling:
          'Those runs are lost. Known limitation; the fix is a durable event outbox processed by a worker.',
      },
    ],
    interview: [
      'Automations are trigger–conditions–actions rules with a deliberately small vocabulary, validated with Zod when saved and again when run. Services emit domain events, and automations run after the transaction commits. Each run is claimed with a unique constraint on automation and event, so it is idempotent; each action goes through the normal services as a least-privilege automation actor, and every step is recorded and audited.',
      'Automations can’t trigger other automations, so loops are impossible. The honest limitation is that dispatch is in-process; in production I would add a durable event outbox.',
    ],
    followUp: {
      question: 'How would you make event delivery reliable?',
      answer: [
        'Write events to an `Event` table in the same transaction as the change — the transactional outbox pattern, as the email outbox already does. A worker polls with `FOR UPDATE SKIP LOCKED`, runs automations, and marks events processed. Because runs are already idempotent per event, at-least-once delivery is safe. Later, the same table could feed a queue.',
      ],
    },
    tests: [
      { file: 'tests/integration/chat.test.ts', name: 'never runs the same automation twice for one event' },
      {
        file: 'tests/integration/chat.test.ts',
        name: 'records a failed run when a stored configuration is no longer valid',
      },
      {
        file: 'src/modules/automations/describe.test.ts',
        name: 'rejects actions that do not fit the trigger',
      },
      {
        file: 'src/modules/automations/describe.test.ts',
        name: 'fills placeholders as plain text in the business’s time zone',
      },
    ],
    related: ['handoff', 'authorization', 'audit-log', 'email-outbox'],
  },

  {
    slug: 'email-outbox',
    title: 'Email and notifications',
    group: 'Running the business',
    summary:
      'Emails are written to an outbox table in the same transaction as the change; in demo mode they stay there, clearly labelled as not delivered.',
    beginner: [
      'Relay sends emails for booking confirmations, invitations and replies to customers. But this demo never sends a real email — that would need a paid service and could reach real inboxes by mistake.',
      'Instead, every email is saved to an “outbox” that owners can read in Setup → Email outbox, marked as not delivered. Everything else is real: the email is created at exactly the moment a real one would be, with the exact text.',
      'Team notifications (the bell icon) are separate: they appear inside the dashboard for the right people, for example when a customer is waiting for a reply.',
    ],
    professional: [
      '`queueEmail` validates the message and inserts an `OutboundEmail` row through the tenant scope — inside the caller’s transaction. That is the transactional outbox pattern: the business change and the email record commit or roll back together, and the request never waits on an email provider. With the demo provider the status is `STORED_IN_OUTBOX`; a real provider would get `QUEUED` rows that a delivery worker sends and marks `SENT` or `FAILED`.',
      '`EmailProvider` has a `deliver` method and an `isDemo` flag; the demo provider’s `deliver` throws, so it can never be mistaken for real delivery. The delivery worker is not built in this MVP, and the docs say so.',
      'Notifications are rows per membership, created by `notify` with recipients resolved from roles and explicit members — mostly by automations. The dashboard shows unread counts and marks them read per member.',
    ],
    why: [
      {
        decision: 'A transactional outbox instead of sending during the request.',
        because:
          'A slow or failing email service must never break or duplicate a booking, and an email must never go out for a change that rolled back.',
        instead: 'Calling an email API inside the booking flow.',
      },
      {
        decision: 'A visible demo outbox instead of a fake “sent” status.',
        because:
          'Reviewers can read every email the product would send, and nothing pretends to be delivered.',
        instead: 'Logging emails to the console or marking them sent.',
      },
    ],
    files: [
      {
        path: 'src/modules/notifications/email.ts',
        role: 'EmailProvider, demo provider, `queueEmail`, outbox listing',
      },
      { path: 'src/modules/notifications/notifications.ts', role: 'In-app notifications and recipients' },
      { path: 'src/app/app/setup/outbox/page.tsx', role: 'The outbox view and simulated inbound email' },
    ],
    snippets: [
      {
        title: 'Queueing an email inside the current transaction',
        ref: { file: 'src/modules/notifications/email.ts', region: 'queue-email' },
        note: 'There is no network call here — just a validated insert.',
      },
    ],
    failures: [
      {
        what: 'The booking transaction rolls back after the email was queued.',
        handling: 'The outbox row rolls back with it; no email for a booking that doesn’t exist.',
      },
      {
        what: 'A real provider is down.',
        handling:
          'With a worker, rows stay QUEUED and are retried; requests are unaffected. (Worker not built yet.)',
      },
      {
        what: 'Emails contain personal data and are kept forever.',
        handling: 'Not yet handled: a retention job for old outbox rows is a sensible next step.',
      },
    ],
    interview: [
      'Emails use a transactional outbox: the email is inserted in the same transaction as the booking or invite, so they commit together and the request never depends on an email service. In demo mode the rows stay in an outbox the owner can read; for production, a worker would deliver queued rows with retries through a provider interface.',
    ],
    followUp: {
      question: 'What delivery guarantee does the outbox give, and how do you avoid duplicate emails?',
      answer: [
        'At-least-once: a worker might send and crash before marking the row sent, then send again. To limit duplicates, pass the outbox row id as an idempotency key to the provider (most transactional email APIs support one) and mark rows sent in a short transaction immediately after the API call.',
      ],
    },
    tests: [
      {
        file: 'tests/integration/tenancy.test.ts',
        name: 'invites, emails (demo outbox) and accepts a new staff member',
      },
      {
        file: 'tests/integration/setup.test.ts',
        name: 'answers a known question from the knowledge base and stores the reply in the outbox',
      },
    ],
    related: ['bookings', 'automations', 'setup-knowledge'],
  },

  {
    slug: 'setup-knowledge',
    title: 'Setup and the knowledge base',
    group: 'Running the business',
    summary:
      'Services, staff hours, time off, booking rules and FAQ answers — structured data that the chat, the public page and the rules all read.',
    beginner: [
      'Relay only knows what the business tells it. In Setup, owners describe their services (how long, what price, instant or needs approval), who works when, holidays, booking rules, and answers to common questions.',
      'The knowledge base is a list of questions with exact answers and a few words customers might use. Relay gives those answers word for word and says where the answer came from. It never writes its own answer. If a question doesn’t match, it goes to a person — and the owner can add an answer for next time.',
      'Staff can see all of this but not change it; owners and admins can.',
    ],
    professional: [
      '`src/modules/catalog/manage.ts` holds the setup services: business settings (validated opening hours and policy ranges, also enforced by CHECK constraints), services (a bookable service needs a duration and at least one staff member; unique names map a Postgres unique violation to CONFLICT), staff with weekly hours (replaced as a whole), time off (reports clashing bookings instead of cancelling them), and knowledge items (published items need keywords). Each authorizes with `setup.view` or `setup.manage` and writes an audit entry recording which settings changed, never their free-text values.',
      'There is deliberately no retrieval-augmented generation: knowledge items are structured Q&A with keywords, matched by the provider and answered verbatim with a source label. That makes answers verifiable and removes hallucination for business facts.',
      'Setup also hosts the simulated inbound email channel. `receiveDemoEmail` runs the same `understand()` boundary: known questions get an answer by email through the outbox; everything else is handed off with an acknowledgement.',
    ],
    why: [
      {
        decision: 'Structured Q&A instead of RAG over documents.',
        because:
          'A small business has tens of recurring questions, not thousands of pages. Exact answers with sources are more trustworthy and need no vector database.',
        instead: 'Embedding documents and generating answers from retrieved chunks.',
      },
      {
        decision: 'Time off does not silently cancel existing bookings.',
        because:
          'Cancelling a customer’s booking is a decision with consequences; Relay shows the clashes and lets staff act.',
        instead: 'Automatically cancelling or moving affected bookings.',
      },
      {
        decision: 'Rules enforced in both Zod and database CHECK constraints.',
        because: 'Zod gives friendly field errors; the database guarantees invariants for any write path.',
        instead: 'Only one of the two.',
      },
    ],
    files: [
      { path: 'src/modules/catalog/manage.ts', role: 'Setup services with validation and audit' },
      { path: 'src/modules/catalog/opening-hours.ts', role: 'Opening-hours schema and descriptions' },
      { path: 'src/modules/conversations/email-channel.ts', role: 'Simulated inbound email channel' },
      {
        path: 'src/app/app/setup/actions.ts',
        role: 'Setup server actions (time zone conversion for time off)',
      },
    ],
    snippets: [
      {
        title: 'Updating business settings',
        ref: { file: 'src/modules/catalog/manage.ts', region: 'update-settings' },
        note: 'The audit entry lists changed keys and a few rule values — never descriptions or contact details.',
      },
      {
        title: 'The simulated email channel',
        ref: { file: 'src/modules/conversations/email-channel.ts', region: 'email-channel' },
        note: 'Same AI boundary as chat; email only answers what can be answered from settings or the FAQ.',
      },
    ],
    failures: [
      {
        what: 'An owner removes a staff member from a service that has future bookings.',
        handling: 'Existing bookings stay; the service simply stops offering that person for new times.',
      },
      {
        what: 'An owner saves a bookable service without staff.',
        handling: 'Validation error on the staff field: it could never be booked.',
      },
      {
        what: 'Whole-day time off on a daylight-saving day.',
        handling: 'The end is computed as local midnight of the next day, not start + 24 hours.',
      },
    ],
    interview: [
      'Everything the assistant says about the business comes from structured setup data: services, hours, booking rules and a Q&A knowledge base answered verbatim with a source. I chose that over RAG because the domain is small and correctness matters more than coverage; unknown questions go to a person and show the owner what to add.',
    ],
    followUp: {
      question: 'When would RAG become worth it?',
      answer: [
        'If businesses brought large, changing documents — product manuals, long policies — that can’t be maintained as Q&A. I would still keep answers grounded: retrieve passages, require citations, validate that cited passages exist, and fall back to hand-off below a confidence threshold. Structured facts like prices and hours would stay in settings.',
      ],
    },
    tests: [
      {
        file: 'tests/integration/setup.test.ts',
        name: 'removes offered times for a closed day and reports bookings that clash',
      },
      {
        file: 'tests/integration/setup.test.ts',
        name: 'requires staff for bookable services and rejects duplicate names',
      },
      {
        file: 'tests/integration/chat.test.ts',
        name: 'answers known questions from the FAQ and says where the answer came from',
      },
    ],
    related: ['ai-boundary', 'availability', 'authorization'],
  },

  {
    slug: 'analytics',
    title: 'Operational analytics',
    group: 'Running the business',
    summary:
      'A handful of honest numbers — conversations handled without a person, conversion, hand-offs, first reply time — computed straight from the rows.',
    beginner: [
      'Owners want to know whether Relay helps. The analytics page answers a few concrete questions for a chosen period: how many conversations were handled without a person, how many people who wanted to book actually booked, how quickly the team replied after a hand-off, and which services are booked most.',
      'Every number is counted directly from the bookings, conversations and leads in the database. Nothing is estimated or made to look better.',
    ],
    professional: [
      '`computeMetrics` runs a few aggregate SQL queries inside the tenant transaction: conversations with at least one customer message, the share without hand-off, booking-intent conversations that produced a booking (`EXISTS` on bookings with that conversation id), hand-offs with the median first-reply time via `percentile_cont`, bookings by origin, cancellations, leads and automation run outcomes. Daily series and service breakdowns feed accessible SVG charts with a table fallback.',
      'Definitions are explicit in code comments, so “conversion” means one thing. Analytics is limited to owners and admins.',
    ],
    why: [
      {
        decision: 'Compute from source rows on request.',
        because:
          'At this data size, queries are fast, always consistent and traceable. Pre-aggregation would add jobs and drift.',
        instead: 'A metrics table maintained by background jobs, or a third-party analytics service.',
      },
      {
        decision: 'Median first reply time, not average.',
        because: 'One weekend hand-off would distort an average; the median describes a typical wait.',
        instead: 'Mean response time.',
      },
    ],
    files: [
      { path: 'src/modules/analytics/metrics.ts', role: 'Metric definitions and SQL' },
      { path: 'src/app/app/analytics/page.tsx', role: 'Analytics page' },
      { path: 'src/app/app/analytics/charts.tsx', role: 'SVG charts with accessible tables' },
    ],
    snippets: [
      {
        title: 'Metrics from the rows themselves',
        ref: { file: 'src/modules/analytics/metrics.ts', region: 'metrics' },
        note: '`FILTER (WHERE …)` computes several counts in one pass over conversations.',
      },
    ],
    failures: [
      {
        what: 'Data grows to millions of conversations.',
        handling: 'Queries would slow down; add indexes on the date columns used, then daily rollups.',
      },
      {
        what: 'Demo data makes numbers look unrealistically good.',
        handling:
          'The seed includes abandoned booking chats and hand-offs so conversion and reply times are plausible, and the app is labelled as demo.',
      },
    ],
    interview: [
      'Analytics are a small set of operational metrics — automation rate, booking conversion from chat, hand-offs and median first reply time — computed with SQL aggregates directly from the tenant’s rows, so every number is traceable. I picked metrics an owner can act on rather than vanity counts.',
    ],
    followUp: {
      question: 'How do you define “conversion”, and what could make it misleading?',
      answer: [
        'Conversations where the flow detected booking intent and that are linked to a booking. It can mislead if a customer books by phone after chatting (undercount) or if intent detection is too eager (the denominator grows). I would show the definition next to the number and track it over time rather than as a single figure.',
      ],
    },
    tests: [],
    related: ['handoff', 'bookings', 'interface-accessibility'],
  },

  {
    slug: 'customer-data',
    title: 'Customer data and erasure',
    group: 'Running the business',
    summary:
      'Customers share details only when needed, and owners can erase a customer’s personal data while keeping anonymous counts intact.',
    beginner: [
      'Customers can chat without giving any personal details. Relay only asks for a name and email when it needs them — to book, to send a quote, or so a person can reply.',
      'If a customer asks to be forgotten, an owner or admin can erase them. Their name, email, phone and message texts are removed, but the fact that a booking happened remains, anonymously, so the business’s numbers still add up.',
      'This is a sensible privacy design, not a legal guarantee. Relay does not claim GDPR compliance — that depends on how a business uses it and on legal advice.',
    ],
    professional: [
      'Customers are per-organization rows unique on `(organizationId, email)`; a returning customer is recognised within one business only. `eraseCustomer` (permission `customers.erase`, owners and admins) nulls name, email and phone, replaces customer-authored message bodies and lead summaries, clears the stored AI interpretation and booking notes, removes the booking manage-token hash, sets `anonymisedAt`, and writes an audit entry — all in one transaction.',
      'Supporting choices: audit metadata cannot contain personal data, logs are redacted, rate-limit keys are HMACs, the AI provider receives no customer data, and customer text is always rendered as plain text.',
    ],
    why: [
      {
        decision: 'Anonymise rows instead of deleting them.',
        because:
          'Deleting bookings would break staff history and analytics; removing identifying fields satisfies the purpose of the request.',
        instead: 'Hard-deleting the customer and cascading.',
      },
      {
        decision: 'No customer accounts.',
        because: 'Less personal data stored, and no passwords for people who book once a year.',
        instead: 'Required customer registration.',
      },
    ],
    files: [
      { path: 'src/modules/customers/customers.ts', role: 'Upsert, lookup, erasure' },
      { path: 'src/app/app/customers/[id]/page.tsx', role: 'Customer detail with erase form' },
      { path: 'src/lib/logger.ts', role: 'Redaction of personal data in logs' },
    ],
    snippets: [
      {
        title: 'Erasing a customer',
        ref: { file: 'src/modules/customers/customers.ts', region: 'erase-customer' },
        note: 'The booking manage-token hash is removed too, so an old link cannot be used any more.',
      },
    ],
    failures: [
      {
        what: 'Personal data remains in the email outbox or audit log.',
        handling:
          'Audit metadata holds none by design. Outbox emails are not yet cleared on erasure — a known gap to fix before real use.',
      },
      {
        what: 'Backups still contain erased data.',
        handling: 'Outside the app; a real deployment needs a documented backup retention period.',
      },
    ],
    interview: [
      'Customers don’t need accounts and only give details when necessary. Erasure anonymises a customer in one transaction — contact fields, message texts, notes and the manage link — while keeping bookings as anonymous records, and it’s audited. I’m careful to call this privacy-minded design rather than compliance, and I know the gaps: outbox emails and backups.',
    ],
    followUp: {
      question: 'What would you add for data retention?',
      answer: [
        'A per-business retention setting and a scheduled job: anonymise customers with no activity for N months, delete old outbox emails and rate-limit rows, and prune expired sessions. Each run writes an audit summary. The functions already exist for most of it; the scheduler does not.',
      ],
    },
    tests: [],
    related: ['audit-log', 'tenancy'],
  },
];
