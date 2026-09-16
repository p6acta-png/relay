# Security

This document lists the security controls Relay implements, where they live, and how they are tested. For the
threats they address and the risks that remain, see [THREAT_MODEL.md](THREAT_MODEL.md).

> **No compliance claims.** Relay is a portfolio project. It has not been audited or penetration-tested, and it
> makes no claim of certification (such as ISO 27001) or legal compliance (such as GDPR). The controls below are
> engineering practice, not a compliance programme.

## Controls

### Tenant isolation

| Control                                                                                                   | Where                                                                   | Proof                                                                     |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Row-level security on every business table, keyed on a transaction-local setting; fails closed when unset | `prisma/migrations/*_tenant_isolation_and_constraints`, `src/lib/db.ts` | `tests/integration/database-guarantees.test.ts`                           |
| App connects as a role that is not superuser, not table owner, `NOBYPASSRLS`                              | `scripts/db.mjs`                                                        | same file: "runs the app as a role that cannot bypass row-level security" |
| Composite foreign keys on `(organizationId, id)`                                                          | `prisma/schema.prisma`                                                  | "refuses references to another organization's rows"                       |
| Actor's organization must match the transaction's organization                                            | `src/modules/tenancy/context.ts` (`authorizeIn`)                        | `bookings.test.ts`, `setup.test.ts`                                       |
| Organization is never taken from the request body                                                         | `src/server/context.ts`, chat pipeline                                  | `chat.test.ts`: wrong token or another business's address                 |

### Authentication and sessions

| Control                                                                                                                            | Where                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| scrypt (N=2^17, r=8, p=1), 16-byte salt, parameters stored in the hash, rehash on login                                            | `src/modules/auth/password.ts`                                      |
| Constant-time comparison; dummy hash for unknown emails (no account enumeration by timing or message)                              | `src/modules/auth/accounts.ts`                                      |
| Minimum 10 characters, common-password and email-name checks                                                                       | `src/modules/auth/schemas.ts`                                       |
| 256-bit random session tokens; only SHA-256 stored; new session on every login                                                     | `src/modules/auth/sessions.ts`                                      |
| `HttpOnly`, `SameSite=Lax` cookie; `Secure` and `__Host-` prefix in production; 14-day absolute expiry; logout deletes the session | `src/server/session.ts`                                             |
| Login rate limits: 30 per IP and 10 per email per 15 minutes; sign-up: challenge + 10 per IP per hour                              | `src/app/(auth)/actions.ts`, `src/modules/protection/rate-limit.ts` |
| Post-login redirects restricted to known app paths (open-redirect protection)                                                      | `safeNext` in `src/app/(auth)/actions.ts`                           |

Browser tests check the production cookie flags (`tests/e2e/security.spec.ts`).

### Authorization

- One permission matrix for Owner, Admin and Staff, and short allowlists for non-human actors: the assistant
  (can create but never cancel or approve bookings), automations (no booking permissions at all) and customers
  (cancel their own booking only). `src/modules/tenancy/permissions.ts`
- Checks run **inside services**, so the chat, dashboard, email channel and automations share them. Pages render
  a 403 notice; server actions throw typed errors.
- Role management rules: admins cannot manage owners, staff manage nobody, the last owner cannot be removed or
  demoted.

### Input handling and web protections

| Control                                                                                                                                    | Where                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Zod validation at every boundary, including services, stored automation configuration and AI output                                        | modules, `src/lib/errors.ts`                  |
| Expected errors return safe messages; unexpected errors are logged with a reference and never returned                                     | `src/server/actions.ts`, `src/server/http.ts` |
| Nonce-based Content-Security-Policy (`strict-dynamic`, no `unsafe-eval` in production, `frame-ancestors 'none'`)                           | `src/proxy.ts`                                |
| `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; no `X-Powered-By`                              | `next.config.ts`                              |
| CSRF: SameSite=Lax cookies; Next.js server actions compare Origin and Host; public API checks Origin and uses a header token, not a cookie | `src/server/http.ts`                          |
| Public API body limited to 16 KB and JSON content type                                                                                     | `src/server/http.ts`                          |
| Customer text is always rendered as text by React, never as HTML                                                                           | chat and inbox components                     |
| Environment validated at startup; test-only password cost refused in production                                                            | `src/lib/env.ts`                              |

### Abuse protection

- PostgreSQL fixed-window rate limits for login, sign-up, conversation starts, chat messages (per IP and per
  conversation), polling and booking cancellation. Subjects are HMAC-hashed, so raw IPs and emails are not stored.
- A `ChallengeProvider` for new conversations and sign-up. **The shipped demo provider (honeypot + signed
  timestamp) stops only naive bots.**
- Spam signals (links, spam terms, markup, repetition, gibberish) stop automatic handling and hand the
  conversation to a person.

### AI boundary

- Provider output is treated as untrusted: timeout, schema validation, and references checked against the
  business's catalogue. Failures become "unknown".
- Intents are a closed list; the model has no tools and cannot trigger actions. Bookings require an explicit
  confirmation step in the flow.
- The provider receives no customer data, prices or conversation history.

### Secrets and data

- Every secret token (sessions, invites, conversation access, booking manage links) is stored as a SHA-256 hash.
- `.env` is git-ignored; `npm run setup` generates random local secrets. `.env.example` contains placeholders only.
- The demo password is public by design, so the seed script refuses to run against a non-localhost database or with
  `NODE_ENV=production`; the local database script (`scripts/db.mjs`) likewise only manages localhost.
- Audit metadata is schema-restricted to identifiers, enums, numbers and short strings without `@`; the app role
  cannot update, delete or truncate the audit log.
- Logs redact keys such as password, token, cookie, email, phone and message body, and mask email and phone
  patterns in strings.
- Customer erasure anonymises contact fields, message texts, lead summaries, booking notes and manage-link hashes.

## Not covered

- No MFA, password reset, account lockout notification or "log out everywhere" control.
- No real CAPTCHA; the demo challenge is bypassable by a determined bot.
- IP rate limits rely on a reverse proxy overwriting `x-forwarded-for`.
- The audit log is append-only for the app role, not tamper-evident against a database administrator.
- No dependency scanning, secret scanning or SAST in CI (there is no CI configuration yet).
- Outbox emails are not removed on customer erasure; no retention jobs.
- No manual penetration test or accessibility audit.

## Reporting

This is a portfolio project without a production deployment. If you find a security issue, please open an issue
in the repository without including exploit details, and it will be followed up.
