# Threat model

A lightweight threat model for Relay as a hosted multi-tenant service. It describes what is worth protecting,
where trust changes, the main threats (grouped by STRIDE), how Relay responds, and what risk remains.
Controls are detailed in [SECURITY.md](SECURITY.md).

## Assets

| Asset                                                         | Why it matters                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Customer personal data (names, emails, phones, message texts) | Privacy; belongs to each business's customers                                |
| Business data (bookings, schedules, leads, settings)          | Confidentiality between competing businesses; operational correctness        |
| Staff accounts and sessions                                   | Full access to a business's data                                             |
| Booking integrity (no double-booking, correct status)         | Real people's time                                                           |
| Audit trail                                                   | Explaining what happened, including actions by the assistant and automations |
| Availability of the public chat                               | A business's customers depend on it                                          |

## Actors

- **Anonymous visitor / customer** — uses the public page and chat; holds a conversation token and possibly a
  booking manage link.
- **Staff member** (Owner, Admin, Staff) — authenticated dashboard user of one or more businesses.
- **Malicious visitor or bot** — spam, credential stuffing, scraping, attempts to abuse the chat or AI.
- **Malicious tenant** — a legitimate business account trying to reach another business's data.
- **AI provider** — an external, untrusted component whose output may be wrong or manipulated.
- **Operator** — whoever runs the database and server (trusted, but see residual risks).

## Trust boundaries

```
Browser ──(1)──▶ Next.js proxy / route handlers / server actions ──(2)──▶ Services ──(3)──▶ PostgreSQL
                                                   │
                                                   └──(4)──▶ AI provider (untrusted output)
```

1. **Internet → application.** Every request body, header and cookie is untrusted.
2. **Web layer → services.** Services re-authorize and re-validate; they do not trust callers.
3. **Application → database.** The app role is restricted; RLS and constraints enforce invariants even if
   application code is wrong.
4. **Application ↔ AI provider.** Only public catalogue data goes out; output is validated before use.

## Threats and responses

### Spoofing

| Threat                                       | Response                                                                     | Residual risk                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Credential stuffing / password guessing      | Slow scrypt, per-email and per-IP rate limits, generic errors                | Distributed attacks across many IPs against many emails; no MFA |
| Session theft                                | HttpOnly cookie, CSP against XSS, hashed session ids, logout deletes session | A stolen cookie works until expiry or logout (no device list)   |
| Guessing a conversation token or manage link | 256-bit random tokens, hashed at rest, looked up with organization + id      | Links forwarded by the customer grant access to that booking    |
| Forged `x-forwarded-for` to evade IP limits  | Per-email and per-conversation limits; proxy requirement documented          | Without a trusted proxy, IP limits are weak                     |

### Tampering

| Threat                                  | Response                                                                             | Residual risk                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Forged form fields (ids, roles, prices) | Server builds actor context; services authorize and validate; RLS and composite keys | —                                                   |
| Booking a time that was never offered   | Browser sends slot ids from server-held state; booking re-checks availability        | —                                                   |
| Concurrent double-booking               | Exclusion constraint                                                                 | —                                                   |
| Editing audit history through the app   | UPDATE/DELETE/TRUNCATE revoked for the app role                                      | An operator with owner rights can still modify rows |
| Cross-site request forgery              | SameSite=Lax, server-action Origin check, public API Origin check with header token  | Older browsers without SameSite support             |

### Repudiation

| Threat                                                         | Response                                                                                                          | Residual risk                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| "The assistant booked that, not me" / "who changed the rules?" | Audit entries for people, the assistant, automations and customers, written in the same transaction as the change | Not hash-chained or shipped off-host |

### Information disclosure

| Threat                                                    | Response                                                                       | Residual risk                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Tenant A reads tenant B's data                            | RLS (fail closed), composite keys, `authorizeIn` org check, restricted DB role | Identity tables are outside RLS and rely on code review |
| Account enumeration                                       | Identical message and timing for unknown email and wrong password              | Sign-up reveals that an email is taken                  |
| Error messages or logs leaking internals or personal data | Typed safe errors; references for unexpected errors; log redaction             | Redaction is pattern-based                              |
| Personal data sent to the AI provider                     | Only public catalogue and message text are sent                                | With a real provider, message text leaves the system    |
| XSS exposing data                                         | React escaping, text-only rendering of customer input, nonce-based CSP         | Inline styles are allowed (`style-src 'unsafe-inline'`) |

### Denial of service

| Threat                                               | Response                                                                                   | Residual risk                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Chat flooding / spam                                 | Challenge for new conversations, per-IP and per-conversation limits, spam signals hand off | The demo challenge stops only naive bots                    |
| Expensive requests (huge bodies, huge slot searches) | 16 KB body limit, message length limit, slot search capped at 62 days                      | No global request-rate protection; rely on the hosting edge |
| Slow AI provider blocking the database               | Understanding runs outside transactions with an 8 s timeout                                | Throughput still limited by provider latency                |

### Elevation of privilege

| Threat                                                           | Response                                                                                                                  | Residual risk                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Staff performing owner actions by posting directly               | Permission checks inside services                                                                                         | —                                                                   |
| Admin removing or demoting owners                                | `canManageRole`, last-owner protection                                                                                    | —                                                                   |
| Prompt injection making the assistant cancel or approve bookings | Closed intent list, validated output, assistant allowlist excludes cancel/decide, explicit confirmation to book           | The model could still misclassify intent and ask the wrong question |
| Automations doing more than intended                             | Least-privilege automation actor (no booking permissions), validated configuration, idempotent runs, no automation chains | Owners can configure noisy automations (e.g. many notifications)    |

## Top residual risks and next steps

1. **Bot protection is a demo.** Replace the challenge provider with Turnstile or hCaptcha before any public
   deployment.
2. **Operational trust.** Operators can modify data and the audit log; add hash-chaining or off-host audit
   shipping if that matters to customers.
3. **Account security.** Add password reset, MFA for owners, session listing and revocation.
4. **Event durability.** A crash after commit loses automation runs; add a durable event table and worker.
5. **Data lifecycle.** Add retention jobs and remove outbox emails on erasure.
6. **Supply chain.** Add CI with dependency and secret scanning; versions are already pinned.
