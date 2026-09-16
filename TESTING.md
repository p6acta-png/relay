# Testing

Relay tests the promises it makes — tenant isolation, no double-booking, least-privilege actors, honest
hand-offs — rather than implementation details. There are three suites.

| Suite       | Tool             | Runs against                                                        | Count               |
| ----------- | ---------------- | ------------------------------------------------------------------- | ------------------- |
| Unit        | Vitest           | Pure functions, no database                                         | 81 tests in 8 files |
| Integration | Vitest           | Real PostgreSQL (`relay_test`) as the restricted app role           | 65 tests in 6 files |
| End-to-end  | Playwright + axe | A production build on port 3100 with its own database (`relay_e2e`) | 16 tests in 5 files |

## Running

Everything below assumes `npm run setup` has been run once.

```bash
npm run check
```

Type-check, lint, then unit and integration tests. Integration tests start PostgreSQL if it is stopped and
migrate the test database in their global setup.

```bash
npm run test:unit
```

```bash
npm run test:integration
```

```bash
npm run test:e2e
```

The end-to-end command runs `scripts/e2e-server.mjs`: it migrates and **re-seeds** `relay_e2e`, runs
`next build`, and starts `next start` on port 3100. The first run takes a few minutes. If nothing in `src/`
changed since the last build, skip the build:

```bash
E2E_SKIP_BUILD=1 npx playwright test
```

A failed end-to-end test keeps a trace and screenshot; open the report with `npx playwright show-report`.

## What each suite proves

### Unit (`src/**/*.test.ts`, next to the code)

| File                              | Proves                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scheduling/slots.test.ts`        | Working hours, minimum notice, horizon, time off (personal and business-wide), busy intervals, time-of-day windows, **the 25 October 2026 DST change in Oslo**, load balancing between staff |
| `tenancy/permissions.test.ts`     | The role matrix; the assistant can create but not decide or cancel bookings; automations cannot touch bookings; customers can only cancel                                                    |
| `assistant/mock-provider.test.ts` | Intents, time preferences, contact extraction, and the validation boundary: wrong shape, unknown references and provider errors all become "unknown"                                         |
| `auth/password.test.ts`           | Salted scrypt, stored parameters, tampered hashes rejected, OWASP defaults                                                                                                                   |
| `protection/spam.test.ts`         | Links, spam terms, markup, repetition and gibberish are flagged; normal messages are not                                                                                                     |
| `automations/describe.test.ts`    | Automation definitions reject incompatible triggers/actions and unknown placeholders; conditions and templates evaluate correctly                                                            |
| `learn/highlight.test.ts`         | The code highlighter used in `/learn` keeps every character and handles comments                                                                                                             |
| `content/learn/content.test.ts`   | `/learn` stays true to the code: every file, code region, test name and cross-link it references exists                                                                                      |

### Integration (`tests/integration`)

| File                          | Proves                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database-guarantees.test.ts` | The app role cannot bypass RLS; queries without a filter see only their tenant; no tenant set returns nothing; cross-tenant writes and references are refused; overlapping bookings are impossible; the audit log is append-only            |
| `auth.test.ts`                | Registration rules, generic login errors, hashed sessions, logout and expiry, rate limits including under concurrency                                                                                                                       |
| `tenancy.test.ts`             | Onboarding in one transaction (rolled back on conflict), invitations through the demo outbox, role rules and last-owner protection                                                                                                          |
| `bookings.test.ts`            | Instant and approval bookings, **simultaneous booking races** (same person; "anyone available" spread across staff), customer cancellation window, rescheduling, actor permissions, cross-tenant refusal                                    |
| `chat.test.ts`                | **Both demo scenarios**, server-offered slots only, approval requests, FAQ answers with sources, quote → lead, input limits, the challenge, spam hand-off, token and tenant checks, automation idempotency and invalid stored configuration |
| `setup.test.ts`               | Staff read-only setup, settings validation and audit, services, staff hours, time off hiding slots and reporting clashes, knowledge publishing rules, the simulated email channel                                                           |

### End-to-end (`tests/e2e`)

| File                    | Proves                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.spec.ts`          | Redirect to login and back; identical errors for wrong password and unknown account; sign-up → onboarding → dashboard → logout; a second business cannot see the first one's data        |
| `chat.spec.ts`          | Scenario 1 through the UI, with the email in the outbox and the assistant's audit entry; scenario 2 including a staff reply appearing in the customer's chat; FAQ answer with its source |
| `roles.spec.ts`         | Staff see setup read-only and are refused audit, analytics and the outbox by direct URL                                                                                                  |
| `security.spec.ts`      | CSP with a fresh nonce per request and no `unsafe-eval`; hardening headers; `__Host-` session cookie with HttpOnly, Secure and SameSite=Lax; cross-site chat requests refused            |
| `accessibility.spec.ts` | axe WCAG 2.1 A/AA scans of public pages, `/learn`, the chat and key dashboard pages                                                                                                      |

## Conventions

- **Real database, restricted role.** Integration tests use the same `relay_app` role as the application, so RLS
  and grants behave as in production. Each file truncates all tables as the owner before it runs, and files run
  one at a time.
- **Services, not HTTP.** Integration tests call module services directly for speed and precision; the browser
  suite covers the HTTP layer and UI.
- **Races are reproduced, not assumed.** Concurrent requests use `Promise.all` and the test asserts the outcome
  (exactly one booking), not the interleaving.
- **Time is an input.** Pure functions take `now` and a time zone; integration tests pick future weekdays.
- **Fast hashing only in tests.** `PASSWORD_HASH_COST=test` lowers scrypt cost; the environment check refuses it
  in production, and a unit test pins the default parameters.
- **Test names are sentences** describing behaviour, so the list reads as a specification.

## Known gaps

- No load or soak tests.
- No visual regression tests; dashboard components are covered by browser flows rather than component tests.
- axe covers a subset of accessibility issues; no manual screen-reader pass has been done.
- No CI configuration yet; suites are run locally.
- A `pg` deprecation warning from inside Prisma appears in integration output (DECISIONS.md, ADR-010).
