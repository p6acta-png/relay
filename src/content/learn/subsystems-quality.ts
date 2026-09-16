import type { Subsystem } from './types';

export const QUALITY_SUBSYSTEMS: Subsystem[] = [
  {
    slug: 'testing',
    title: 'Testing strategy',
    group: 'Quality',
    summary:
      'Fast unit tests for pure logic, integration tests against real PostgreSQL for guarantees, and browser tests for the flows a person actually uses.',
    beginner: [
      'Tests are small programs that use Relay and check the result. They run in seconds and catch mistakes before anyone else sees them.',
      'Relay has three kinds. Unit tests check one piece of logic on its own, like “does the slot finder handle the clock change?”. Integration tests run real features against a real database, like “can two customers book the same time at once?”. Browser tests click through the actual website like a person would, and also scan pages for accessibility problems.',
      'The most valuable tests prove the promises Relay makes: businesses can’t see each other’s data, nobody is double-booked, the assistant can’t cancel bookings, and unknown questions go to a person.',
    ],
    professional: [
      'Vitest runs two projects. `unit` covers pure modules co-located as `*.test.ts` (slot finder with DST, permission matrix, spam rules, password hashing, the demo AI and the validation boundary, automation definitions, the highlighter). `integration` runs `tests/integration` sequentially against a dedicated `relay_test` database, migrated in global setup and connected as the restricted app role — so RLS and grants are exercised exactly as in production. Each file resets data by truncating as the owner role.',
      'Integration tests call module services directly rather than HTTP, which keeps them fast and precise, and use `Promise.all` to reproduce races. The two demo scenarios are integration tests, so the demo cannot silently break. Playwright tests in `tests/e2e` run the built app against a separate `relay_e2e` database and include axe accessibility scans.',
      'Password hashing uses lower scrypt parameters under `PASSWORD_HASH_COST=test`, and a unit test asserts that the default parameters stay at the OWASP minimum.',
    ],
    why: [
      {
        decision: 'A real PostgreSQL for integration tests, not mocks or SQLite.',
        because:
          'The important guarantees — RLS, exclusion constraints, grants — only exist in PostgreSQL. Mocks would test nothing that matters.',
        instead: 'Mocking Prisma or using an in-memory database.',
      },
      {
        decision: 'Services tested directly; a few end-to-end browser tests on top.',
        because:
          'Most logic is covered quickly and precisely; browser tests are slower and reserved for flows and accessibility.',
        instead: 'Testing everything through the browser.',
      },
      {
        decision: 'Tests that describe behaviour in plain sentences.',
        because: 'The test list doubles as a specification an interviewer can read.',
        instead: 'Tests named after functions.',
      },
    ],
    files: [
      { path: 'vitest.config.mts', role: 'Unit and integration projects' },
      { path: 'tests/integration/global-setup.ts', role: 'Starts PostgreSQL and migrates the test database' },
      { path: 'tests/integration/database-guarantees.test.ts', role: 'RLS, constraints and grants' },
      { path: 'tests/integration/chat.test.ts', role: 'Both demo scenarios and chat protection' },
      { path: 'tests/support/factories.ts', role: 'Creates users, businesses and members for tests' },
      { path: 'playwright.config.ts', role: 'Browser tests against the built app' },
      { path: 'TESTING.md', role: 'How to run each suite and what it covers' },
    ],
    snippets: [],
    failures: [
      {
        what: 'A test passes because it shares state with another test.',
        handling:
          'Integration files run one at a time and create their own businesses with unique slugs and emails.',
      },
      {
        what: 'Time-dependent tests fail on some days.',
        handling:
          'Pure functions take `now` as input; integration tests pick future weekdays relative to today.',
      },
      {
        what: 'Tests pass while production is misconfigured.',
        handling:
          'Integration tests connect as the same restricted role as the app and assert its attributes.',
      },
      {
        what: 'Coverage gaps.',
        handling:
          'Honest list: no load tests, no visual regression tests, and the dashboard UI is covered by a few browser flows rather than component tests.',
      },
    ],
    interview: [
      'I test the promises rather than the implementation. Unit tests cover pure logic like the slot finder, including a daylight-saving change. Integration tests run against real PostgreSQL as the restricted app role, because tenant isolation, double-booking prevention and the append-only audit log are database guarantees — mocks would not prove them. Races are reproduced with concurrent requests. Browser tests cover the main flows and run axe accessibility checks.',
    ],
    followUp: {
      question: 'How do you test a race condition reliably?',
      answer: [
        'Make the race wide rather than hoping for timing: fire several requests with `Promise.all` that all pass the application-level check, and assert the invariant on the outcome — exactly one booking exists and the others got CONFLICT. Because the guarantee is a database constraint, the test is deterministic in its result even though the interleaving varies. I also test the fallback path, where “anyone available” requests are spread across staff.',
      ],
    },
    tests: [
      {
        file: 'tests/integration/bookings.test.ts',
        name: 'lets only one of two simultaneous requests book the same person at the same time',
      },
      {
        file: 'tests/integration/database-guarantees.test.ts',
        name: 'hides other organizations’ rows even when the query forgets to filter',
      },
      {
        file: 'src/modules/scheduling/slots.test.ts',
        name: 'handles the switch to winter time in Oslo (25 October 2026)',
      },
    ],
    related: ['tenancy', 'availability', 'local-infrastructure'],
  },

  {
    slug: 'local-infrastructure',
    title: 'Local PostgreSQL, setup and deployment readiness',
    group: 'Quality',
    summary:
      'One command sets up a pinned PostgreSQL inside the project folder — no Docker, no admin rights — with the same roles a production database would use.',
    beginner: [
      'Relay needs a real database, but this computer has no admin rights and no Docker. So the project downloads PostgreSQL as an npm package and runs it from a folder inside the project, controlled by a small script.',
      '`npm run setup` does everything: creates a settings file with random secrets, starts the database, creates the tables, and fills in the demo businesses. `npm run dev` starts the database if needed and then the website.',
      'Nothing here depends on paid services. The same code could run on a hosted database later by changing the connection settings.',
    ],
    professional: [
      '`scripts/db.mjs` resolves the PostgreSQL 18.4 binaries from the pinned `@embedded-postgres/<platform>` package and drives them with `initdb` and `pg_ctl -w start/stop -m fast`. The JavaScript wrapper was rejected after a spike: on Windows its stop orphaned a worker process that held the port (ADR-003). The cluster lives in `.relay/postgres` on port 54329.',
      'Three roles mirror a production setup: `relay_admin` (bootstrap superuser, local only), `relay_owner` (owns tables, runs migrations) and `relay_app` (runtime: no superuser, no BYPASSRLS, not owner). `grant` gives the app role table privileges after migrations and revokes UPDATE/DELETE/TRUNCATE on the audit log. Separate `relay`, `relay_test` and `relay_e2e` databases isolate dev data from tests.',
      'Environment variables are validated with Zod at startup (`src/lib/env.ts`); `.env.example` documents them and setup fills secrets with `randomBytes`. Dependencies are pinned to exact versions, and npm’s `allowScripts` limits install scripts to the packages that need them. DEPLOYMENT.md describes the hosted equivalent: managed PostgreSQL with the two roles, migrations as a release step, a reverse proxy that sets forwarding headers, and real providers for email and bot checks.',
    ],
    why: [
      {
        decision: 'PostgreSQL binaries from npm driven by `pg_ctl`.',
        because:
          'No admin rights, no Docker, reproducible version, and it passed a start/stop reliability spike on this machine.',
        instead:
          'Docker, a system install, a hosted free tier, or SQLite (which lacks RLS and exclusion constraints).',
      },
      {
        decision: 'Separate owner and app roles even locally.',
        because:
          'If development runs as a superuser, RLS is silently bypassed and bugs only appear in production.',
        instead: 'One superuser connection string.',
      },
      {
        decision: 'Exact version pins, including Prisma 7.10.0 and TypeScript 6.0.3.',
        because:
          '`latest` pointed at a Prisma release candidate, and TypeScript 7 is not yet supported by the lint tooling.',
        instead: 'Caret ranges.',
      },
    ],
    files: [
      { path: 'scripts/db.mjs', role: 'Start, stop, status, reset and grants for local PostgreSQL' },
      { path: 'scripts/setup.mjs', role: 'One-command setup' },
      { path: 'src/lib/env.ts', role: 'Validated environment' },
      { path: '.env.example', role: 'Documented configuration' },
      { path: 'DEPLOYMENT.md', role: 'What a hosted deployment needs' },
      { path: 'DECISIONS.md', role: 'Architecture decision records' },
    ],
    snippets: [],
    failures: [
      {
        what: 'Port 54329 is taken.',
        handling: '`db:start` reports the conflict; the port is configurable in `.env`.',
      },
      {
        what: 'The database was not stopped cleanly (power loss).',
        handling:
          '`pg_ctl` recovers on the next start like any PostgreSQL; `db:reset` rebuilds from scratch after confirmation.',
      },
      {
        what: 'Someone points the app at a superuser in production.',
        handling: 'RLS would be bypassed. The role integration test and DEPLOYMENT.md both call this out.',
      },
    ],
    interview: [
      'The environment had no admin rights and no Docker, so I ran a spike: PostgreSQL binaries from a pinned npm package, controlled with PostgreSQL’s own `initdb` and `pg_ctl`. The JS wrapper leaked a process on Windows, so I documented that decision. Setup is one command, uses separate owner and app roles like production would, and keeps dev, test and e2e databases apart.',
    ],
    followUp: {
      question: 'What would change to deploy this?',
      answer: [
        'A managed PostgreSQL 16+ with btree_gist, an owner role for migrations and an app role without BYPASSRLS; `prisma migrate deploy` plus the grant step as a release task; the Next.js app on a Node host behind a proxy that sets `x-forwarded-for`; real secrets; and real email and bot-check providers. I would also add a worker process for email delivery and events, health checks, and backups with a retention policy.',
      ],
    },
    tests: [
      {
        file: 'tests/integration/database-guarantees.test.ts',
        name: 'runs the app as a role that cannot bypass row-level security',
      },
    ],
    related: ['tenancy', 'testing'],
  },

  {
    slug: 'interface-accessibility',
    title: 'Interface, design system and accessibility',
    group: 'Quality',
    summary:
      'Server-rendered pages with small client islands, a restrained Nordic editorial design system, and accessibility built into the shared components.',
    beginner: [
      'Relay’s look is meant to feel calm and trustworthy: warm paper tones, dark ink, one green for actions and one orange for things that need attention — no gradients or glowing effects.',
      'Accessibility means people using keyboards, screen readers or zoom can use Relay fully. The shared form fields always have labels, errors are announced, the chat announces new messages, charts have a table version, and status is never shown by colour alone.',
      'Most pages are built on the server and arrive ready to read. Only interactive parts — the chat widget, the automation builder, form feedback — run in the browser.',
    ],
    professional: [
      'Next.js App Router with React Server Components: pages load data on the server through the same services, and client components are limited to interactivity. Mutations use server actions with `useActionState`; forms whose inputs are controlled by React state submit through a transition, because React resets `<form action>` forms after the action and would desynchronise checkboxes and selects.',
      'Design tokens live in `globals.css` (Tailwind 4 `@theme`): paper, surface, ink, pine and signal colours, three radii, and self-hosted fonts via `next/font` (Schibsted Grotesk, Newsreader, IBM Plex Mono). Chart colours were checked with a palette validator for colour-vision deficiency separation and contrast.',
      'Shared components carry accessibility: `TextField` and friends wire `label`, `aria-describedby` and `aria-invalid`; `FormMessage` uses `role="alert"` for errors; the chat uses `role="log"` with `aria-live="polite"` and moves focus to the composer; the dashboard has a skip link; filters are links, so they work without JavaScript and can be shared; reduced motion is respected. Playwright runs axe on key pages.',
    ],
    why: [
      {
        decision: 'Server components by default, client components only for interaction.',
        because:
          'Less JavaScript, data loaded next to the services and authorization, and pages that work before hydration.',
        instead: 'A client-rendered SPA with a separate API for every screen.',
      },
      {
        decision: 'Accessibility in shared components rather than per page.',
        because: 'Every form gets labels and error announcements automatically.',
        instead: 'Fixing accessibility page by page after the fact.',
      },
      {
        decision: 'A custom, restrained visual language.',
        because:
          'The product should look like a tool a Norwegian small business would trust, not a template.',
        instead: 'An off-the-shelf component kit with default styling.',
      },
    ],
    files: [
      { path: 'src/app/globals.css', role: 'Design tokens and base styles' },
      { path: 'src/components/ui/field.tsx', role: 'Accessible form fields' },
      {
        path: 'src/components/ui/submit-without-reset.ts',
        role: 'Why controlled forms submit through a transition',
      },
      { path: 'src/app/w/[slug]/_components/chat-panel.tsx', role: 'Chat widget UI with live region' },
      { path: 'src/app/app/analytics/charts.tsx', role: 'SVG charts with accessible names and a table' },
      { path: 'tests/e2e/accessibility.spec.ts', role: 'axe scans of key pages' },
    ],
    snippets: [],
    failures: [
      {
        what: 'A colour-only status indicator.',
        handling: 'Badges always include text; chart series have a legend and table.',
      },
      {
        what: 'Keyboard users get lost after opening the chat.',
        handling: 'Focus moves to the message box; the close button and quick replies are real buttons.',
      },
      {
        what: 'Automated checks miss problems.',
        handling:
          'axe finds a subset of issues. No manual screen-reader audit has been done yet — stated in the docs.',
      },
    ],
    interview: [
      'The UI is server-rendered by default with small client islands, and accessibility is built into shared components — labelled fields with described errors, live regions in the chat, a skip link, charts with table fallbacks — and checked with axe in browser tests. I also found and fixed a subtle React 19 issue where the automatic form reset desynchronised controlled inputs after a failed submission.',
    ],
    followUp: {
      question: 'What would you check manually that axe cannot?',
      answer: [
        'Whether the reading and focus order make sense, that announcements are useful rather than noisy (the chat log in particular), that error messages explain how to fix the problem, zoom to 200% and 400% reflow, and a real screen reader pass with NVDA and VoiceOver on the booking flow.',
      ],
    },
    tests: [],
    related: ['web-boundary', 'chat-pipeline', 'analytics'],
  },
];
