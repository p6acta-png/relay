/** Data for the interactive architecture explorer at /learn/architecture. */

export interface ArchitectureNode {
  id: string;
  label: string;
  layer: string;
  what: string;
  why: string;
  files: string[];
  subsystem: string;
}

export interface ArchitectureScenario {
  slug: string;
  title: string;
  steps: { node: string; text: string }[];
  walkthrough?: string;
}

export const LAYERS = [
  { id: 'channels', label: 'Channels', hint: 'Where requests come from' },
  { id: 'edge', label: 'Web boundary', hint: 'Next.js entry points' },
  { id: 'guards', label: 'Guards', hint: 'Checked before any work' },
  { id: 'decide', label: 'Decide', hint: 'Understanding and rules' },
  { id: 'services', label: 'Services', hint: 'Business logic in src/modules' },
  { id: 'data', label: 'PostgreSQL', hint: 'One transaction per change' },
  { id: 'after', label: 'After commit', hint: 'Reactions to events' },
] as const;

export const NODES: ArchitectureNode[] = [
  {
    id: 'widget',
    label: 'Chat widget',
    layer: 'channels',
    what: 'The chat on a business’s public page. Sends customer inputs, renders reply blocks, polls for staff replies.',
    why: 'Holds no business logic — every decision is made on the server.',
    files: ['src/app/w/[slug]/_components/chat-provider.tsx', 'src/app/w/[slug]/_components/chat-panel.tsx'],
    subsystem: 'chat-pipeline',
  },
  {
    id: 'dashboard',
    label: 'Staff dashboard',
    layer: 'channels',
    what: 'Server-rendered pages for Today, Inbox, Bookings, Automations, Setup and more.',
    why: 'Pages load data through the same services the chat uses, with the member’s permissions.',
    files: ['src/app/app/layout.tsx', 'src/app/app/inbox/[id]/page.tsx'],
    subsystem: 'interface-accessibility',
  },
  {
    id: 'email-in',
    label: 'Email (simulated)',
    layer: 'channels',
    what: 'An owner pastes an inbound email; Relay handles it like a webhook would.',
    why: 'Shows a second channel reusing the AI boundary, FAQ and hand-off.',
    files: ['src/modules/conversations/email-channel.ts'],
    subsystem: 'setup-knowledge',
  },
  {
    id: 'proxy',
    label: 'Proxy',
    layer: 'edge',
    what: 'Adds a per-request Content-Security-Policy nonce and redirects to login when there is no session cookie.',
    why: 'Defence in depth against XSS. The redirect is a convenience, not the security check.',
    files: ['src/proxy.ts', 'next.config.ts'],
    subsystem: 'web-boundary',
  },
  {
    id: 'api',
    label: 'Public chat API',
    layer: 'edge',
    what: 'POST and GET route handlers for the widget. Checks Origin and body size, returns one error shape.',
    why: 'Thin on purpose: the pipeline module is testable without HTTP.',
    files: ['src/app/api/public/[slug]/chat/route.ts', 'src/server/http.ts'],
    subsystem: 'chat-pipeline',
  },
  {
    id: 'actions',
    label: 'Server actions',
    layer: 'edge',
    what: 'Form submissions from the dashboard, wrapped in `runAction` for consistent results and safe errors.',
    why: 'They are public POST endpoints, so they authenticate, authorize and validate like any API.',
    files: ['src/server/actions.ts', 'src/app/app/bookings/actions.ts'],
    subsystem: 'web-boundary',
  },
  {
    id: 'protection',
    label: 'Rate limits & bot check',
    layer: 'guards',
    what: 'Atomic PostgreSQL counters per IP, email or conversation; a challenge for new conversations and sign-up; spam signals.',
    why: 'Stops cheap abuse before any expensive work, without extra infrastructure.',
    files: [
      'src/modules/protection/rate-limit.ts',
      'src/modules/protection/challenge.ts',
      'src/modules/protection/spam.ts',
    ],
    subsystem: 'abuse-protection',
  },
  {
    id: 'session',
    label: 'Session & actor context',
    layer: 'guards',
    what: 'Validates the session cookie and builds who is acting, for which business — or a customer/assistant context for public requests.',
    why: 'Nothing the browser sends can choose the organization.',
    files: ['src/server/session.ts', 'src/server/context.ts', 'src/modules/tenancy/context.ts'],
    subsystem: 'authentication',
  },
  {
    id: 'validation',
    label: 'Validation',
    layer: 'guards',
    what: 'Zod schemas at every boundary: forms, chat inputs, stored configuration and AI output.',
    why: 'After the boundary, types can be trusted.',
    files: ['src/modules/conversations/model.ts', 'src/lib/errors.ts'],
    subsystem: 'web-boundary',
  },
  {
    id: 'ai',
    label: 'AI boundary',
    layer: 'decide',
    what: 'Asks the provider for an interpretation, then checks timeout, shape and references.',
    why: 'Provider output is untrusted input. Failures become “unknown”, never actions.',
    files: ['src/modules/assistant/provider.ts', 'src/modules/assistant/interpretation.ts'],
    subsystem: 'ai-boundary',
  },
  {
    id: 'flow',
    label: 'Conversation flow',
    layer: 'decide',
    what: 'A deterministic state machine that decides replies and requests actions through ports.',
    why: 'Code — not the model — decides what happens, so behaviour is predictable and tested.',
    files: ['src/modules/conversations/flow.ts'],
    subsystem: 'chat-pipeline',
  },
  {
    id: 'permissions',
    label: 'Permissions',
    layer: 'decide',
    what: 'Role matrix for people and allowlists for the assistant, automations and customers, checked inside services.',
    why: 'Every channel reaches the same services, so every channel gets the same checks.',
    files: ['src/modules/tenancy/permissions.ts'],
    subsystem: 'authorization',
  },
  {
    id: 'conversations',
    label: 'Conversations',
    layer: 'services',
    what: 'Conversations, messages, hand-off, staff replies and inbox queries.',
    why: 'Hand-off is idempotent and audited; the assistant goes quiet after it.',
    files: ['src/modules/conversations/conversations.ts'],
    subsystem: 'handoff',
  },
  {
    id: 'scheduling',
    label: 'Availability & bookings',
    layer: 'services',
    what: 'Pure slot finder, exact-slot re-check, and the booking lifecycle.',
    why: 'The same rules are shown to customers and enforced at insert.',
    files: ['src/modules/scheduling/slots.ts', 'src/modules/scheduling/bookings.ts'],
    subsystem: 'bookings',
  },
  {
    id: 'setup',
    label: 'Setup & knowledge',
    layer: 'services',
    what: 'Services, staff hours, time off, booking rules and FAQ answers.',
    why: 'Everything the assistant says about the business comes from here.',
    files: ['src/modules/catalog/manage.ts'],
    subsystem: 'setup-knowledge',
  },
  {
    id: 'postgres',
    label: 'Tenant transaction',
    layer: 'data',
    what: '`withTenant` sets the organization for one transaction; RLS, composite keys and constraints enforce the rules.',
    why: 'Isolation and no-double-booking hold even if application code has a bug.',
    files: [
      'src/lib/db.ts',
      'prisma/migrations/20260915160500_tenant_isolation_and_constraints/migration.sql',
    ],
    subsystem: 'tenancy',
  },
  {
    id: 'audit',
    label: 'Audit log',
    layer: 'data',
    what: 'Append-only record of who did what, written in the same transaction as the change.',
    why: 'Explains actions by people, the assistant and automations; the app role cannot edit it.',
    files: ['src/modules/audit/audit.ts'],
    subsystem: 'audit-log',
  },
  {
    id: 'outbox',
    label: 'Email outbox',
    layer: 'data',
    what: 'Emails inserted as rows alongside the change that caused them.',
    why: 'A booking never waits on, or fails because of, an email service.',
    files: ['src/modules/notifications/email.ts'],
    subsystem: 'email-outbox',
  },
  {
    id: 'automations',
    label: 'Automation engine',
    layer: 'after',
    what: 'Runs matching rules for domain events after commit — idempotent, least-privilege, step by step.',
    why: 'Reactions can never break or roll back the change that triggered them.',
    files: ['src/modules/automations/engine.ts'],
    subsystem: 'automations',
  },
  {
    id: 'notifications',
    label: 'Notifications & tasks',
    layer: 'after',
    what: 'In-app notifications and tasks for the team, mostly created by automations.',
    why: 'Nothing Relay hands over goes unnoticed.',
    files: ['src/modules/notifications/notifications.ts', 'src/modules/crm/tasks.ts'],
    subsystem: 'handoff',
  },
];

export const SCENARIOS: ArchitectureScenario[] = [
  {
    slug: 'booking',
    title: 'Customer books in the chat',
    walkthrough: 'booking-through-chat',
    steps: [
      { node: 'widget', text: 'The customer types “Can I book a service next Tuesday afternoon?”.' },
      { node: 'api', text: 'The route handler checks Origin and size, then calls the pipeline.' },
      { node: 'protection', text: 'Rate limits and, for a new conversation, the bot challenge.' },
      { node: 'validation', text: 'The input is parsed against the customer input schema.' },
      { node: 'ai', text: 'The demo AI returns intent “book”, a service id and “afternoon” — validated.' },
      { node: 'postgres', text: 'A tenant transaction starts and locks the conversation row.' },
      { node: 'flow', text: 'The flow decides to offer free times.' },
      {
        node: 'scheduling',
        text: 'The slot finder returns afternoon slots; the customer later picks one and confirms.',
      },
      { node: 'permissions', text: 'The assistant may create bookings (but never cancel or approve them).' },
      { node: 'audit', text: 'booking.created is recorded in the same transaction.' },
      { node: 'outbox', text: 'The confirmation email with the private manage link is queued.' },
      { node: 'automations', text: 'After commit, rules for booking.confirmed run (first-visit tips).' },
    ],
  },
  {
    slug: 'handoff',
    title: 'An unknown question',
    walkthrough: 'unknown-question',
    steps: [
      { node: 'widget', text: '“Do you offer a student discount?”' },
      { node: 'api', text: 'Same entry point and guards as any chat message.' },
      { node: 'ai', text: 'Understood as a question, but no FAQ or setting matches.' },
      { node: 'flow', text: 'The flow refuses to guess and hands off.' },
      { node: 'conversations', text: 'Status becomes “Needs a person”; the assistant goes quiet.' },
      { node: 'audit', text: 'conversation.handed_off is recorded with the reason.' },
      { node: 'automations', text: 'The default rule runs after commit.' },
      { node: 'notifications', text: 'The team gets a notification and a task.' },
      {
        node: 'dashboard',
        text: 'A staff member replies from the inbox; the widget shows it on its next poll.',
      },
    ],
  },
  {
    slug: 'login',
    title: 'Staff member logs in',
    walkthrough: 'staff-login',
    steps: [
      { node: 'proxy', text: 'No cookie on /app → redirect to /login (a convenience only).' },
      { node: 'actions', text: 'The login server action runs.' },
      { node: 'protection', text: 'Rate limits per IP and per email.' },
      {
        node: 'session',
        text: 'Password verified with scrypt; a new session and HttpOnly cookie are created.',
      },
      { node: 'dashboard', text: 'Each page builds the member context from the session and memberships.' },
      { node: 'permissions', text: 'Pages and services check the member’s role.' },
      { node: 'postgres', text: 'Business data is read inside the member’s tenant transaction.' },
    ],
  },
  {
    slug: 'setup-change',
    title: 'Owner changes booking rules',
    steps: [
      { node: 'dashboard', text: 'Ingrid edits minimum notice in Setup → Business & rules.' },
      { node: 'actions', text: 'The server action receives the form payload.' },
      { node: 'session', text: 'The member context is rebuilt from the session.' },
      {
        node: 'validation',
        text: 'Settings are validated with Zod (and CHECK constraints in the database).',
      },
      { node: 'permissions', text: '`setup.manage` — owners and admins only.' },
      { node: 'setup', text: 'The settings service updates the organization.' },
      { node: 'audit', text: 'settings.business_updated records which keys changed, not their text.' },
      { node: 'scheduling', text: 'The next slot search uses the new rule immediately.' },
    ],
  },
];
