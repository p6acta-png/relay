# Deployment

Relay runs locally out of the box. This document describes what a hosted deployment would need. It has **not**
been deployed; treat this as a checklist, not a tested runbook.

## Components

| Component  | Local                                             | Hosted equivalent                                                                                |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Web app    | `next dev` / `next start`                         | Node.js 22+ host running `next build` then `next start`, behind a reverse proxy or platform edge |
| Database   | PostgreSQL 18.4 in `.relay/` via `scripts/db.mjs` | Managed PostgreSQL 16 or newer with the `btree_gist` extension                                   |
| Migrations | `npm run setup` / `npm run db:migrate`            | A release step running `prisma migrate deploy` as the owner role, then the grant step            |
| Email      | Demo outbox                                       | A transactional email provider plus a delivery worker (not built)                                |
| Bot check  | Demo honeypot + timestamp                         | Cloudflare Turnstile or hCaptcha (not built)                                                     |
| AI         | Deterministic demo provider                       | Optional hosted model behind `AIProvider` (not built)                                            |

## Database roles

Create two roles — never run the app as the table owner or a superuser, or row-level security is bypassed:

```sql
CREATE ROLE relay_owner LOGIN PASSWORD '…' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE relay_app   LOGIN PASSWORD '…' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE DATABASE relay OWNER relay_owner;
```

After migrations, apply the same grants as `scripts/db.mjs grant`:

```sql
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO relay_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO relay_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO relay_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM relay_app;
REVOKE ALL ON "_prisma_migrations" FROM relay_app;
```

The migrations create the `btree_gist` extension; on managed services the owner role may need permission to do
so, or an administrator creates it beforehand.

Run the integration test "runs the app as a role that cannot bypass row-level security" (or the equivalent
query) against the production role before going live.

## Environment

| Variable                                              | Production value                                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                            | `production`                                                                                                                        |
| `DATABASE_URL`                                        | Connection string for `relay_app` (with TLS, e.g. `?sslmode=require`)                                                               |
| `DATABASE_OWNER_URL`                                  | Connection string for `relay_owner` — only for the migration step                                                                   |
| `APP_URL`                                             | The public HTTPS origin, e.g. `https://relay.example`                                                                               |
| `APP_SECRET`                                          | At least 32 random characters (`openssl rand -base64 48`); rotating it resets rate-limit keys and invalidates open bot-check tokens |
| `DEMO_MODE`                                           | `false` — hides demo credentials                                                                                                    |
| `AI_PROVIDER`, `EMAIL_PROVIDER`, `CHALLENGE_PROVIDER` | Only the demo values exist in this build                                                                                            |

Do not set `PASSWORD_HASH_COST=test`; the app refuses to start with it in production. The local-only variables
(`TEST_*`, `E2E_*`, `LOCAL_PG_ADMIN_PASSWORD`) are not needed.

## Requirements before going live

1. **HTTPS only.** The session cookie uses the `__Host-` prefix and `Secure` in production.
2. **Trusted forwarding headers.** The proxy in front of the app must overwrite `x-forwarded-for` with the real
   client address; otherwise IP-based rate limits can be evaded (DECISIONS.md, ADR-013).
3. **Real bot protection** on sign-up and new conversations (implement `ChallengeProvider`).
4. **Email delivery**: implement `EmailProvider.deliver` and a worker that sends `QUEUED` outbox rows with
   retries and an idempotency key.
5. **Durable events**: move automation dispatch to an event table processed by a worker, so a crash after commit
   does not lose runs.
6. **Backups and retention**: automated PostgreSQL backups with a documented retention period; scheduled jobs to
   delete expired sessions, old rate-limit rows and old outbox emails.
7. **Monitoring**: collect the JSON logs, alert on `action.failed`, `api.failed` and `automations.*` errors, and
   add a health check endpoint.
8. **CI**: type-check, lint, unit and integration tests against a disposable PostgreSQL, Playwright, and
   dependency and secret scanning.
9. **Legal and privacy review** before handling real customer data. Relay makes no compliance claims.

## Release steps

```bash
npm ci
```

```bash
npx prisma generate
```

```bash
npx prisma migrate deploy
```

Run the grants above, then build and start:

```bash
npm run build
```

```bash
npm run start
```

The Prisma CLI steps read `DATABASE_OWNER_URL` (see `prisma.config.ts`), so set it for the release step; the running app only needs
`DATABASE_URL`.
