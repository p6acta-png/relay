# Demo script

A seven-minute demo of Relay with talking points. Timings are guides.

## Before you start

```bash
npm run dev
```

- Open **two browser windows**: a normal one for the customer, and a private one for staff (so the sessions don't
  mix).
- Password for every demo account: **`relay-demo-2026`**.
- If the demo data is old or you have clicked around a lot, reset it (this empties and re-seeds the dev database):

```bash
npm run db:seed
```

## 1. The problem and the product (30 s) — home page

Open **http://localhost:3000**.

> "Small businesses like this bike workshop answer the same questions and book the same appointments all day.
> Relay sits on their booking page and turns those conversations into bookings, leads or tasks — and hands
> anything unusual to a person."

Point at the trace card: _understood → checked → booked → recorded._

## 2. A customer books (90 s) — customer window

Open **http://localhost:3000/w/eik-og-kant** → **Ask a question**. Type:

> Can I book a standard service next Tuesday afternoon?

- Relay offers afternoon times. _"The AI only filled in a form — intent book, this service, Tuesday afternoon.
  Plain code found free times per mechanic in the shop's time zone."_
- Pick a time → enter a name and an email → **Continue** → **Confirm booking**.
- Point at the reference and the manage link. _"No customer account — a private link, stored only as a hash."_
- Point at the **Demo mode** label. _"The AI here is a deterministic demo provider; it's clearly labelled."_

## 3. A question Relay can't answer (60 s) — customer window

Click **Start a new conversation**. Type:

> Do you offer a student discount?

- _"It's not in their FAQ or settings, so Relay doesn't guess. It says a person will reply and asks for an email."_
- Enter a name and email → **Send**. Leave this window open.

## 4. Staff pick it up (90 s) — private window

Log in as **jonas@eikogkant.example** (staff).

- The sidebar shows the inbox count. Open **Inbox** → the conversation marked _Needs a person_.
- Point at **Relay understood** and the hand-off reason. _"Staff can see exactly why it handed over."_
- Point at the task created by the default automation.
- Reply: _"Yes — 10% off with a student card."_ Switch to the customer window: the reply appears within
  about five seconds.
- Try **http://localhost:3000/app/audit** as Jonas: _"Staff can't see the audit log — checked on the server, not
  just hidden."_

## 5. The owner's view (90 s) — private window

Log out and log in as **ingrid@eikogkant.example** (owner).

- **Bookings** → **Next 14 days**: the booking from step 2, with origin _Chat_.
- **Audit log** → filter actor _Assistant_: `booking.created`, `conversation.handed_off`. _"Written in the same
  transaction as the change; the app's database role can't edit or delete these rows."_
- **Setup → Email outbox**: the confirmation email. _"Emails go into an outbox table in the same transaction. In
  demo mode they're stored, not sent."_
- **Automations** → _Ask for approval on booking requests_ → run history. _"Runs are idempotent — one event can
  never run the same automation twice."_
- Optional: **Analytics** (labelled _Demo data_).

## 6. Proof (60 s) — editor or terminal

Open `tests/integration/database-guarantees.test.ts` and read three test names aloud:

- _runs the app as a role that cannot bypass row-level security_
- _hides other organizations' rows even when the query forgets to filter_
- _makes overlapping bookings for the same staff member impossible_

Then `tests/integration/bookings.test.ts`: _lets only one of two simultaneous requests book the same person at the
same time._

If there's time, run:

```bash
npm run check
```

## 7. Close (15 s)

> "Everything runs locally for free. The AI, email and bot check are demo implementations behind real interfaces,
> and the guide at /learn explains every subsystem — including what's not done yet."

## If something goes wrong

| Symptom                                           | Fix                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| "We could not verify this submission" in the chat | You typed within 1.5 s of loading the page — the demo bot check. Wait a moment and send again. |
| No afternoon times offered                        | The seed data may have filled that day; try "next Wednesday" or pick one of the offered times. |
| "Too many attempts"                               | Rate limits from repeated runs. Re-seed with `npm run db:seed`, which clears them.             |
| Database not running                              | `npm run db:start`, then refresh.                                                              |
| Staff reply doesn't appear                        | The chat window must stay open; polling runs every 5 seconds while it is visible.              |
