import type { Subsystem } from './types';

const ISOLATION_MIGRATION = 'prisma/migrations/20260915160500_tenant_isolation_and_constraints/migration.sql';

export const FOUNDATION_SUBSYSTEMS: Subsystem[] = [
  {
    slug: 'tenancy',
    title: 'Multi-tenancy and data isolation',
    group: 'Foundations',
    summary:
      'Many businesses share one database; PostgreSQL row-level security, composite foreign keys and a typed tenant scope keep each one’s data apart.',
    beginner: [
      'Relay is one app used by many businesses — a bike workshop and a hair salon share the same database. Each business must only ever see its own customers, bookings and messages. Mixing them up would be the worst possible bug.',
      'Most apps rely on remembering to add “only for this business” to every database query. Relay does that too, but it adds a second lock that works even if a programmer forgets: before any business data is read, Relay tells the database which business this request is for, and the database itself hides every other business’s rows.',
      'If Relay forgets to say which business it is working for, the database shows nothing at all. Failing closed like that is much safer than accidentally showing everything.',
    ],
    professional: [
      "Every business table has an `organizationId` and an RLS policy `USING (organizationId = app_current_org_id()) WITH CHECK (…)`. `withTenant(orgId, fn)` opens an interactive transaction and runs `set_config('app.org_id', orgId, true)` — transaction-local, so a pooled connection can never carry the setting into another request. `app_current_org_id()` uses `NULLIF(…, '')`, so an unset value yields NULL and every policy evaluates to false.",
      'RLS only protects if the connecting role is subject to it. The app connects as `relay_app`: not a superuser, `NOBYPASSRLS`, and not the table owner. Migrations run as `relay_owner`. An integration test asserts those role attributes, so a misconfigured environment fails CI rather than silently disabling isolation.',
      'Two more layers: composite foreign keys on `(organizationId, id)` make it impossible for a booking in business A to reference a service in business B, even via a crafted id; and the `TenantDb` branded type makes it a compile error to pass the raw Prisma client to a function that expects tenant-scoped access. `authorizeIn` also asserts that the actor’s organization equals the transaction’s organization.',
    ],
    why: [
      {
        decision: 'Shared tables with row-level security.',
        because:
          'One schema and one migration path keep operations simple for many small tenants, and RLS turns “forgot a WHERE clause” from a data leak into an empty result.',
        instead:
          'A database or schema per tenant (heavier to migrate and operate), or application filters alone.',
      },
      {
        decision: 'Transaction-local `set_config` inside an interactive transaction.',
        because:
          'Connection pools reuse connections. A session-level setting could leak one tenant’s id to the next request on that connection.',
        instead: '`SET app.org_id` at session level, or passing the tenant only in queries.',
      },
      {
        decision: 'Composite foreign keys including `organizationId`.',
        because:
          'RLS filters what you can see, but a plain FK would still accept an id from another tenant you learned somehow.',
        instead: 'Single-column foreign keys.',
      },
    ],
    files: [
      { path: 'src/lib/db.ts', role: '`withTenant`, `enterTenant`, the `TenantDb` brand' },
      { path: ISOLATION_MIGRATION, role: 'RLS policies, `app_current_org_id()`, CHECK constraints' },
      { path: 'prisma/schema.prisma', role: 'Composite relations on (organizationId, id)' },
      { path: 'scripts/db.mjs', role: 'Creates the owner and restricted app roles and grants' },
      { path: 'src/modules/tenancy/context.ts', role: '`authorizeIn`: actor org must match the scope' },
    ],
    snippets: [
      {
        title: 'Entering a tenant',
        ref: { file: 'src/lib/db.ts', region: 'with-tenant' },
        note: 'The organization id is validated as a UUID and set with `true` (transaction-local).',
      },
      {
        title: 'The policy function and the first policies',
        ref: {
          file: ISOLATION_MIGRATION,
          start: 'CREATE FUNCTION app_current_org_id()',
          end: 'ALTER TABLE "WorkingHours" ENABLE ROW LEVEL SECURITY;',
        },
        note: '`WITH CHECK` also stops writes into another tenant, not just reads.',
      },
    ],
    failures: [
      {
        what: 'A developer writes a query without an organization filter.',
        handling:
          'RLS still returns only the current tenant’s rows. Tested: “hides other organizations’ rows even when the query forgets to filter”.',
      },
      {
        what: 'Code reads business data outside `withTenant`.',
        handling:
          'No `app.org_id` is set, so the policies match nothing — the query returns an empty result (fails closed).',
      },
      {
        what: 'Someone deploys with the owner or a superuser as the app’s database user.',
        handling:
          'RLS would be bypassed. The role test in the integration suite catches this, and the setup script creates the right roles.',
      },
      {
        what: 'Identity tables (users, sessions, memberships) are not under RLS.',
        handling:
          'Deliberate: they are read before a tenant is known (login, invite acceptance). Only the auth, tenancy and protection modules touch them, and memberships are always filtered by the verified user.',
      },
    ],
    interview: [
      'Relay is multi-tenant with shared tables, and isolation is enforced by PostgreSQL rather than only by application code. Each request runs its business queries in a transaction that sets the tenant id locally; row-level security policies filter every business table by it, and composite foreign keys prevent cross-tenant references.',
      'The app connects as a restricted role that cannot bypass RLS, and there are integration tests that prove a query without a filter still can’t see another business, that no tenant set means no rows, and that writes into another tenant are rejected.',
    ],
    followUp: {
      question: 'What does RLS cost, and when would you choose a database per tenant instead?',
      answer: [
        'Every query gets an extra predicate on `organizationId`, which is cheap when that column leads the indexes, and every request needs a transaction to set the variable. It also makes debugging slightly less obvious — an empty result might be a missing tenant context.',
        'I would move to schema- or database-per-tenant for large customers with strict data-residency or contractual separation, very uneven tenant sizes, or per-tenant backups and restores. For many small businesses, shared tables with RLS are the pragmatic choice.',
      ],
    },
    tests: [
      {
        file: 'tests/integration/database-guarantees.test.ts',
        name: 'runs the app as a role that cannot bypass row-level security',
      },
      {
        file: 'tests/integration/database-guarantees.test.ts',
        name: 'returns nothing at all when no organization is set (fails closed)',
      },
      {
        file: 'tests/integration/database-guarantees.test.ts',
        name: 'refuses references to another organization’s rows (composite foreign keys)',
      },
    ],
    related: ['authorization', 'audit-log', 'local-infrastructure'],
  },

  {
    slug: 'authentication',
    title: 'Authentication and sessions',
    group: 'Foundations',
    summary:
      'Email and password with scrypt from Node’s standard library, and database-backed sessions in an HttpOnly cookie that can be revoked instantly.',
    beginner: [
      'Staff log in with an email and password. Relay never stores the password itself — only a scrambled “fingerprint” of it that is slow to compute on purpose. Even someone who stole the database would have to guess passwords one slow attempt at a time.',
      'After logging in, the browser gets a long random key in a cookie. The cookie is hidden from the page’s JavaScript, and the database only stores a fingerprint of that key too. Logging out deletes the session on the server, so the old cookie stops working immediately.',
      'Relay also avoids small leaks: the error message is the same whether the email exists or not, and it takes the same time either way, so an attacker cannot use the login form to find out who has an account.',
    ],
    professional: [
      'Passwords are hashed with `crypto.scrypt` at the OWASP minimum parameters (N=2^17, r=8, p=1), a 16-byte salt, and the parameters encoded in the stored string, so they can be raised later; `needsRehash` upgrades hashes on successful login. Verification uses `timingSafeEqual`. For unknown emails, `authenticate` still verifies against a dummy hash, which removes the timing side-channel for account enumeration.',
      'Sessions are rows keyed by `sha256(token)`, where the token is 256 random bits delivered in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` and the `__Host-` prefix in production). They have a 14-day absolute lifetime and are deleted on logout. Every login creates a new session, preventing session fixation. `getCurrentSession` is wrapped in React `cache`, so validation happens once per request.',
      'Login is rate-limited per IP and per email; sign-up requires the bot challenge and is limited per IP. Redirects after login go through `safeNext`, which only allows paths inside the app (open-redirect protection). The proxy’s redirect for missing cookies is only a convenience — every page and action validates the session on the server.',
    ],
    why: [
      {
        decision: 'A small custom session layer instead of an auth library.',
        because:
          'The requirements are narrow (email/password, one cookie, server-rendered app), and every piece uses standard primitives: `crypto.scrypt`, `randomBytes`, `timingSafeEqual`. It stays at a few hundred lines and is covered by unit and integration tests. The user asked to switch to a library if it grew complex; it did not.',
        instead:
          'Auth.js/Lucia-style libraries, which would be the right call for OAuth, magic links or MFA.',
      },
      {
        decision: 'Database sessions instead of JWTs.',
        because:
          'Logout and “log out everywhere” work instantly by deleting rows. No token revocation lists.',
        instead: 'Stateless signed tokens.',
      },
      {
        decision: 'scrypt instead of bcrypt or Argon2id.',
        because:
          'It is memory-hard, OWASP-listed and built into Node — no native dependency to install on Windows without admin rights.',
        instead: 'Argon2id via a native package (the stronger default when native builds are easy).',
      },
    ],
    files: [
      { path: 'src/modules/auth/password.ts', role: 'scrypt hashing, verification and rehash check' },
      { path: 'src/modules/auth/accounts.ts', role: 'Registration and `authenticate`' },
      { path: 'src/modules/auth/sessions.ts', role: 'Create, validate and invalidate sessions' },
      { path: 'src/server/session.ts', role: 'The only code that reads or writes the cookie' },
      { path: 'src/app/(auth)/actions.ts', role: 'Login, sign-up and logout server actions' },
      { path: 'src/lib/tokens.ts', role: 'Random tokens and SHA-256 hashing' },
    ],
    snippets: [
      {
        title: 'Constant-time password verification',
        ref: { file: 'src/modules/auth/password.ts', region: 'verify-password' },
        note: 'Parameters are read from the stored hash, bounded, and compared without early exit.',
      },
      {
        title: 'Authenticate without leaking which emails exist',
        ref: { file: 'src/modules/auth/accounts.ts', region: 'authenticate' },
        note: 'The dummy hash makes unknown emails take as long as wrong passwords.',
      },
      {
        title: 'The login action',
        ref: { file: 'src/app/(auth)/actions.ts', region: 'login-action' },
        note: 'Rate limits first, then authentication, then a brand-new session and a safe redirect.',
      },
      {
        title: 'The session cookie',
        ref: { file: 'src/server/session.ts', region: 'session-cookie' },
        note: 'HttpOnly and SameSite=Lax are set in exactly one place.',
      },
      {
        title: 'Only redirect to our own pages after login',
        ref: { file: 'src/app/(auth)/actions.ts', region: 'safe-next' },
        note: '`//evil.example` and backslash tricks are rejected; only known app paths are allowed.',
      },
    ],
    failures: [
      {
        what: 'Credential stuffing against one account.',
        handling:
          '10 attempts per email per 15 minutes, 30 per IP, each attempt costing a slow scrypt computation.',
      },
      {
        what: 'A session cookie is stolen.',
        handling:
          'HttpOnly blocks theft via XSS; logging out deletes the row. There is no “log out all devices” button yet, though `invalidateAllSessionsForUser` exists.',
      },
      {
        what: 'The database is leaked.',
        handling: 'Session ids and all other tokens are hashes; passwords are salted scrypt hashes.',
      },
      {
        what: 'Password reset.',
        handling:
          'Not implemented in this MVP — an honest gap. It would reuse the token + hash + outbox pattern from invites.',
      },
    ],
    interview: [
      'Authentication is email and password with scrypt from Node’s crypto module at OWASP parameters, and sessions stored in PostgreSQL. The cookie holds a random token; the database stores only its hash, so a leaked table can’t be replayed. Logout deletes the session, which a stateless JWT can’t do without extra machinery.',
      'I kept it custom because the scope was small and every primitive is standard — no hand-rolled crypto. If the product needed OAuth, magic links or MFA, I would move to a maintained library rather than grow this.',
    ],
    followUp: {
      question: 'Why is SameSite=Lax enough for CSRF protection here?',
      answer: [
        'Lax cookies are not sent on cross-site POST requests, which is how CSRF attacks submit forms. In addition, Next.js server actions check that the Origin header matches the host, and the public JSON API checks Origin explicitly and uses a header token rather than a cookie. I would still avoid state-changing GET requests, because Lax does send cookies on top-level GET navigations.',
      ],
    },
    tests: [
      {
        file: 'tests/integration/auth.test.ts',
        name: 'gives the same generic error for a wrong password and an unknown email',
      },
      {
        file: 'tests/integration/auth.test.ts',
        name: 'stores only a hash of the token and resolves the user from the raw token',
      },
      { file: 'tests/integration/auth.test.ts', name: 'stops working immediately after logout' },
      {
        file: 'src/modules/auth/password.test.ts',
        name: 'uses the OWASP minimum scrypt parameters by default',
      },
    ],
    related: ['authorization', 'abuse-protection', 'web-boundary'],
  },

  {
    slug: 'authorization',
    title: 'Roles, actors and permissions',
    group: 'Foundations',
    summary:
      'One permission matrix for people (Owner, Admin, Staff) and short allowlists for the assistant, automations and customers — checked inside every service.',
    beginner: [
      'Not everyone should be able to do everything. An owner can change prices and invite people; a mechanic can answer customers and handle bookings but not change the business’s settings.',
      'Relay also treats its own automatic helpers as “users” with limited rights. The chat assistant may suggest a booking or pass a conversation to a person, but it can never cancel a booking or change settings. An automation can create a task but cannot touch bookings. A customer with a booking link can only cancel that one booking.',
      'Hiding a button is not security — someone could still send the request. So every permission is checked on the server, inside the function that does the work.',
    ],
    professional: [
      '`ROLE_PERMISSIONS` maps each permission to the roles that hold it; `MACHINE_PERMISSIONS` lists what the ASSISTANT, AUTOMATION and CUSTOMER actors may do. Every service receives an `ActorContext` — a discriminated union of member, assistant, automation, customer and system — and calls `authorize` or `authorizeIn` before doing anything. The context is always built on the server: from the verified session and memberships table, from the public slug, or by the automation engine.',
      '`authorizeIn(scope, ctx, permission)` also asserts `scope.organizationId === ctx.organizationId`, throwing a programming error if a context from one business is used in another business’s transaction. Pages use `pageAccess` to render a 403 notice; actions use `requireMember`, which throws a typed error that `runAction` turns into a message.',
      'Role management has its own rules in `canManageRole`: admins cannot manage owners, staff manage nobody, and the last owner cannot be demoted or removed. The same actor model feeds the audit log, so every entry says whether a person, the assistant, an automation or a customer acted.',
    ],
    why: [
      {
        decision: 'Checks inside services, not only in routes or middleware.',
        because:
          'The chat, dashboard, email channel and automations all reach the same services. A check in one route would not protect the others.',
        instead: 'Route-level middleware guards.',
      },
      {
        decision: 'Non-human actors are first-class, with least privilege.',
        because:
          'The assistant processes untrusted text and automations run without a person watching; their blast radius should be small by construction.',
        instead: 'Running the assistant and automations with system or owner rights.',
      },
      {
        decision: 'A static permission matrix in code.',
        because:
          'Three roles do not need a database-driven policy engine, and a matrix is easy to review in a pull request and test.',
        instead: 'Custom roles stored per tenant (a sensible later step if customers ask for it).',
      },
    ],
    files: [
      { path: 'src/modules/tenancy/permissions.ts', role: 'The permission matrix and machine allowlists' },
      { path: 'src/modules/tenancy/context.ts', role: 'Actor contexts, `authorize`, `authorizeIn`' },
      { path: 'src/server/context.ts', role: 'Builds the member context from the session' },
      { path: 'src/modules/tenancy/team.ts', role: 'Invites, role changes, removal rules' },
    ],
    snippets: [
      {
        title: 'Who may do what',
        ref: { file: 'src/modules/tenancy/permissions.ts', region: 'permissions' },
        note: 'Read the assistant’s list: `bookings.create` is there, `bookings.cancel` and `bookings.decide` are not.',
      },
      {
        title: 'Checking a permission',
        ref: { file: 'src/modules/tenancy/context.ts', region: 'authorize' },
        note: 'The `switch` over `ctx.kind` is exhaustive — a new actor type would not compile until it is handled.',
      },
      {
        title: 'The dashboard context comes only from the server',
        ref: { file: 'src/server/context.ts', region: 'dashboard-context' },
        note: 'The active business must be one of the user’s memberships; nothing the browser sends can choose it.',
      },
      {
        title: 'Inviting a team member',
        ref: { file: 'src/modules/tenancy/team.ts', region: 'invite' },
        note: 'An admin cannot invite an owner, re-inviting revokes the old link, and the token is stored only as a hash.',
      },
    ],
    failures: [
      {
        what: 'A staff member posts directly to a setup server action.',
        handling:
          "`requireMember('setup.manage')` and the service’s own `authorizeIn` both reject it; the UI simply shows read-only forms.",
      },
      {
        what: 'A user switches to a business they are not a member of.',
        handling:
          '`switchOrganizationAction` checks membership; the dashboard context also falls back to a real membership.',
      },
      {
        what: 'An admin tries to remove the only owner.',
        handling:
          '`canManageRole` forbids admins touching owners, and `assertNotLastOwner` protects the last owner in any case.',
      },
    ],
    interview: [
      'Authorization is enforced in the service layer with an explicit actor context. People have roles in a permission matrix; the assistant, automations and customers have short allowlists — the assistant can create a booking or hand off, but never cancel or approve. Every service authorizes before it touches data, and also checks that the actor belongs to the tenant the transaction is scoped to.',
      'Because the checks are in services, the chat, dashboard, email channel and automations are all protected by the same code, and there are unit tests over the matrix plus integration tests for the forbidden paths.',
    ],
    followUp: {
      question: 'How would you support custom roles per business?',
      answer: [
        'Keep permissions as the stable vocabulary in code, and store role definitions per organization as sets of those permissions. `can()` would then look up the member’s role definition, cached per request. I would keep the machine allowlists in code — they are security boundaries, not customer configuration — and add an audit entry and tests for role edits.',
      ],
    },
    tests: [
      {
        file: 'src/modules/tenancy/permissions.test.ts',
        name: 'lets the assistant propose bookings and hand off, but never decide, cancel or configure',
      },
      {
        file: 'tests/integration/bookings.test.ts',
        name: 'refuses a context that does not match the transaction’s organization',
      },
      {
        file: 'tests/integration/tenancy.test.ts',
        name: 'stops admins from changing an owner and keeps at least one owner',
      },
      { file: 'tests/integration/setup.test.ts', name: 'lets staff read setup but not change it' },
    ],
    related: ['tenancy', 'authentication', 'audit-log', 'automations'],
  },

  {
    slug: 'web-boundary',
    title: 'Server actions, validation and errors',
    group: 'Foundations',
    summary:
      'Every input is validated with Zod where it enters; expected errors become friendly messages, unexpected ones become a log entry and a reference code.',
    beginner: [
      'Anything that arrives from outside — a form, a chat message, the AI’s answer — might be wrong or even malicious. Relay checks it at the door with precise rules: this must be an email, that must be a number between 5 and 480.',
      'When something is wrong in an expected way (“that time was just taken”), the person sees a clear message next to the right field. When something breaks unexpectedly, they see a short apology with a reference code, and the details go to the server log — never to the browser, where they could reveal how the system works inside.',
    ],
    professional: [
      'Mutations from the dashboard are Next.js server actions wrapped in `runAction`. It returns an `ActionResult` union: `AppError`s (VALIDATION, FORBIDDEN, CONFLICT, …) become `{ ok: false, message, fieldErrors }`, anything else is logged with a short random reference, and `unstable_rethrow` lets `redirect()` and `notFound()` pass through. Failed submissions echo non-sensitive field values back so forms keep their input.',
      'Services validate their own input with Zod (`safeParse` → `fieldErrorsFrom`), so validation does not depend on which caller is used. The public JSON API uses `readJson` (content-type and size limit), an Origin check and `jsonError`, which maps error codes to HTTP statuses with one response shape. The logger redacts keys like password, token, email and message body before writing JSON lines.',
      'The proxy (`src/proxy.ts`, Next 16’s replacement for middleware) adds a per-request nonce-based Content-Security-Policy; static headers (nosniff, frame denial, referrer and permissions policy) come from `next.config.ts`.',
    ],
    why: [
      {
        decision: 'Validation in services, not only in forms.',
        because:
          'Server actions are public HTTP endpoints; the chat and automations call the same services without any form.',
        instead: 'Client-side validation or route-only validation.',
      },
      {
        decision: 'Typed expected errors and a generic fallback.',
        because:
          'Users get actionable messages, attackers get nothing useful, and operators get a reference to search logs for.',
        instead: 'Returning `error.message` from any exception.',
      },
      {
        decision: 'A strict nonce-based CSP.',
        because: 'If an XSS bug slipped in, injected scripts without the nonce would not run.',
        instead: 'No CSP, or a policy with `unsafe-inline` scripts.',
      },
    ],
    files: [
      { path: 'src/server/actions.ts', role: '`runAction` and form field helpers' },
      { path: 'src/lib/errors.ts', role: '`AppError`, codes, HTTP status mapping, Zod field errors' },
      { path: 'src/server/http.ts', role: 'JSON errors, body limits, same-origin check' },
      { path: 'src/proxy.ts', role: 'CSP nonce and optimistic dashboard redirect' },
      { path: 'src/lib/logger.ts', role: 'Structured logs with redaction' },
    ],
    snippets: [
      {
        title: 'One wrapper for every server action',
        ref: { file: 'src/server/actions.ts', region: 'run-action' },
        note: 'The order matters: `unstable_rethrow` first, so a redirect is never mistaken for an error.',
      },
      {
        title: 'Content-Security-Policy with a fresh nonce',
        ref: { file: 'src/proxy.ts', region: 'proxy' },
        note: 'The cookie check here is only a convenience redirect; real checks happen on the server for every page.',
      },
      {
        title: 'Rejecting cross-site requests to the public API',
        ref: { file: 'src/server/http.ts', region: 'same-origin' },
        note: 'Browsers always send Origin on cross-site POSTs; non-browser clients still need a valid conversation token.',
      },
    ],
    failures: [
      {
        what: 'A form is submitted with tampered hidden fields.',
        handling:
          'The service validates and authorizes again; ids must belong to the tenant (RLS and composite keys).',
      },
      {
        what: 'A database error message contains internal details.',
        handling:
          'Only `AppError` messages reach users; everything else becomes “Something went wrong (ref abc123)”.',
      },
      {
        what: 'Log files accumulate personal data.',
        handling: 'The logger redacts sensitive keys and email/phone patterns in strings.',
      },
    ],
    interview: [
      'Every boundary validates with Zod: forms, the public JSON API, and even the AI’s output. Services validate their own input so no caller can skip it. Errors are split into expected, typed errors that users see, and unexpected ones that are logged with a reference code and never leaked.',
      'On top of that there is a nonce-based Content-Security-Policy, so even an XSS bug could not easily run injected scripts.',
    ],
    followUp: {
      question: 'Server actions look like function calls. What makes them safe?',
      answer: [
        'They are really POST endpoints with an unguessable action id, so I treat them like any public API: authenticate from the session cookie, authorize inside the service, validate every field, and never trust hidden inputs. Next.js adds an Origin versus Host check against CSRF, and SameSite=Lax cookies are a second layer.',
      ],
    },
    tests: [
      { file: 'tests/integration/chat.test.ts', name: 'rejects oversized messages and unknown input types' },
      {
        file: 'tests/integration/setup.test.ts',
        name: 'validates booking rules and audits which settings changed',
      },
    ],
    related: ['abuse-protection', 'authentication', 'interface-accessibility'],
  },

  {
    slug: 'abuse-protection',
    title: 'Rate limiting, bot checks and spam signals',
    group: 'Foundations',
    summary:
      'PostgreSQL-backed rate limits, a demo bot challenge behind a CAPTCHA-ready interface, and explainable spam signals that hand suspicious chats to a person.',
    beginner: [
      'A public chat and a login form attract abuse: bots trying passwords, scripts flooding a business with fake messages, spam links. Relay has a few layers of simple defences.',
      'Rate limits count how often something happens — for example 10 login attempts per email every 15 minutes — and say “try again later” past the limit. A bot check catches the laziest bots: a hidden field humans never fill in, and a check that the form wasn’t submitted faster than a person could type.',
      'Messages that look like spam (lots of links, typical spam words, HTML code) are not answered automatically. They are kept and passed to a person, so a real customer with an unusual message is never silently thrown away.',
    ],
    professional: [
      'Rate limiting is a fixed-window counter in PostgreSQL: one atomic `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count` per request, keyed by rule name and an HMAC of the subject (IP, email, conversation), so the table holds no raw personal data. Stored in the database rather than memory so it works across restarts and multiple instances; old windows are pruned opportunistically. Limits are layered: per IP (coarse, spoofable without a trusted proxy) and per email or conversation (the ones that matter).',
      '`ChallengeProvider` has `issue` and `verify`. The demo provider checks a honeypot field and an HMAC-signed render timestamp (at least 1.5 seconds old, at most 2 hours). A Turnstile or hCaptcha implementation would verify the widget token server-side through the same interface. It is required when a conversation starts and on sign-up.',
      '`assessMessage` returns reasons (links, spam terms, markup, repeated, gibberish). Flagged conversations are stored and handed off with reason `flagged`; they never create bookings or leads. All customer text is rendered as plain text by React, so markup is inert.',
    ],
    why: [
      {
        decision: 'Rate limits in PostgreSQL, not in memory or Redis.',
        because:
          'Zero extra infrastructure, correct across processes, and one indexed upsert is cheap at this scale.',
        instead: 'An in-memory map (breaks with more than one instance) or Redis (another service to run).',
      },
      {
        decision: 'Flag and hand off spam instead of blocking it.',
        because: 'False positives cost a real customer; a person can judge in seconds.',
        instead: 'Silently dropping suspicious messages.',
      },
      {
        decision: 'A challenge interface with an honest demo implementation.',
        because:
          'CAPTCHA services need accounts and keys; the boundary is ready, and the docs say plainly what the demo does not stop.',
        instead: 'Pretending the honeypot is real bot protection.',
      },
    ],
    files: [
      { path: 'src/modules/protection/rate-limit.ts', role: 'Rules and the atomic counter' },
      { path: 'src/modules/protection/challenge.ts', role: 'ChallengeProvider and the demo implementation' },
      { path: 'src/modules/protection/spam.ts', role: 'Explainable spam signals' },
      { path: 'src/server/request.ts', role: 'Client IP and its limitations' },
      { path: 'THREAT_MODEL.md', role: 'What these defences do and do not cover' },
    ],
    snippets: [
      {
        title: 'An atomic rate-limit counter',
        ref: { file: 'src/modules/protection/rate-limit.ts', region: 'rate-limit' },
        note: 'Read-then-write would let concurrent requests slip past; the upsert cannot.',
      },
      {
        title: 'The demo bot challenge',
        ref: { file: 'src/modules/protection/challenge.ts', region: 'challenge' },
        note: 'The timestamp is signed, so a bot cannot simply send an old one it made up.',
      },
      {
        title: 'Spam signals',
        ref: { file: 'src/modules/protection/spam.ts', region: 'spam' },
        note: 'Every rule has a name, so staff see why a conversation was flagged.',
      },
    ],
    failures: [
      {
        what: 'An attacker rotates IP addresses.',
        handling:
          'Per-IP limits weaken, but per-email and per-conversation limits still hold, and scrypt keeps each guess expensive.',
      },
      {
        what: 'The app runs without a reverse proxy that sets `x-forwarded-for`.',
        handling:
          'Clients could spoof the header. Documented as a deployment requirement in THREAT_MODEL.md and DEPLOYMENT.md.',
      },
      {
        what: 'A determined bot solves the demo challenge.',
        handling:
          'It will. That is why the interface exists: plug in Turnstile or hCaptcha before going public.',
      },
      {
        what: 'Fixed windows allow a burst at the boundary (up to twice the limit in a short span).',
        handling: 'Acceptable for these limits; a sliding window or token bucket is the upgrade path.',
      },
    ],
    interview: [
      'The public surfaces have layered, proportionate protection. Rate limits are an atomic upsert in PostgreSQL, keyed by an HMAC of the IP, email or conversation, so they work across instances without storing raw personal data. New conversations and sign-ups pass a challenge interface — a honeypot and signed timestamp in demo mode, ready for Turnstile. Spam heuristics don’t block; they hand the conversation to a person.',
      'I’m explicit about the limits: IP-based limits need a trusted proxy, and the demo challenge only stops naive bots.',
    ],
    followUp: {
      question: 'Why a fixed window rather than a sliding window or token bucket?',
      answer: [
        'A fixed window is one row and one atomic statement, easy to test, including under concurrency. Its weakness is a burst at the window edge. For login and chat limits in this range that burst is harmless. If limits needed to be tight or smooth, I would use a token bucket stored as tokens plus last-refill time, still updated atomically.',
      ],
    },
    tests: [
      { file: 'tests/integration/auth.test.ts', name: 'stays correct under concurrent requests' },
      {
        file: 'tests/integration/chat.test.ts',
        name: 'requires the challenge for a new conversation (honeypot filled = bot)',
      },
      {
        file: 'src/modules/protection/spam.test.ts',
        name: 'flags markup that looks like an injection attempt',
      },
    ],
    related: ['chat-pipeline', 'authentication', 'web-boundary'],
  },

  {
    slug: 'audit-log',
    title: 'The audit log',
    group: 'Foundations',
    summary:
      'An append-only record of who did what — people, the assistant, automations and customers — written in the same transaction as the change.',
    beginner: [
      'When something important happens — a booking is made, a conversation is handed over, a setting changes — Relay writes a line in a logbook: who did it, what they did, to what, and whether it worked.',
      'The logbook includes Relay’s own actions. If the assistant booked a time, the entry says “Relay assistant”. If an automation created a task, it names the automation. So an owner can always answer “why did this happen?”.',
      'The app is not allowed to edit or delete logbook entries, even if someone found a bug to exploit. And the log never stores message texts or email addresses — only what happened and which record it happened to.',
    ],
    professional: [
      '`recordAudit(scope, entry)` inserts into `AuditLog` with actor type, id and label, action, entity type and id, result and metadata. It takes a `TenantScope`, so it always runs inside the same transaction as the change: either both commit or neither does.',
      'Metadata is validated by a Zod schema that only allows short strings without `@`, numbers, booleans and small arrays of those — personal data and free text are rejected at runtime, not only by convention. The database grants the app role INSERT and SELECT on `AuditLog`, with UPDATE, DELETE and TRUNCATE revoked, and the table is under RLS like every business table.',
      'Actor types map directly from `ActorContext` via `actorOf`, so the audit trail reflects the same least-privilege model used for authorization. The dashboard’s audit page filters by entity, actor type and result.',
    ],
    why: [
      {
        decision: 'Audit entries in the same transaction as the change.',
        because:
          'A change without its audit entry, or an entry for a change that rolled back, would make the log untrustworthy.',
        instead: 'Writing audit events asynchronously or to log files.',
      },
      {
        decision: 'Append-only enforced by database privileges.',
        because: 'Application bugs or a compromised app process cannot rewrite history.',
        instead: 'Relying on the code never calling update or delete.',
      },
      {
        decision: 'No personal data in audit metadata.',
        because:
          'Audit logs are kept longer than business data and must survive a customer’s erasure request.',
        instead: 'Storing full before/after snapshots.',
      },
    ],
    files: [
      { path: 'src/modules/audit/audit.ts', role: 'Actors, metadata schema, record and list' },
      { path: 'scripts/db.mjs', role: 'Revokes UPDATE/DELETE/TRUNCATE on AuditLog for the app role' },
      { path: 'src/app/app/audit/page.tsx', role: 'Audit log view with filters' },
    ],
    snippets: [
      {
        title: 'Recording an entry',
        ref: { file: 'src/modules/audit/audit.ts', region: 'audit-record' },
        note: '`metadataSchema.parse` runs before the insert — an email address in metadata throws.',
      },
    ],
    failures: [
      {
        what: 'Someone tries to delete audit rows through the app’s connection.',
        handling: 'PostgreSQL refuses: permission denied. Tested in the database guarantees suite.',
      },
      {
        what: 'A developer adds a customer email to metadata.',
        handling:
          'The metadata schema rejects strings containing `@`, so the write — and its whole transaction — fails straight away in development.',
      },
      {
        what: 'A database owner or superuser edits the table directly.',
        handling:
          'Not prevented — that needs external, write-once storage or hash-chaining. Out of scope and stated in SECURITY.md.',
      },
    ],
    interview: [
      'Significant actions write an audit entry in the same transaction as the change, including actions by the assistant and automations, so an owner can always see why something happened. The app’s database role can insert and read audit rows but not update or delete them, and metadata is schema-restricted so it never contains personal data.',
    ],
    followUp: {
      question: 'How would you make the audit log tamper-evident even against a database administrator?',
      answer: [
        'Hash-chain the entries — each row stores a hash of its content plus the previous row’s hash — and periodically anchor the latest hash somewhere the administrator cannot write, or stream entries to write-once object storage. Verification replays the chain. For this MVP, database privileges are the proportionate level.',
      ],
    },
    tests: [
      {
        file: 'tests/integration/database-guarantees.test.ts',
        name: 'keeps the audit log append-only for the app role',
      },
    ],
    related: ['authorization', 'automations', 'customer-data'],
  },
];
