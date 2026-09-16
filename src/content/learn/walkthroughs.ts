import type { Walkthrough } from './types';

/** Step-by-step tours of real requests through the code. */
export const WALKTHROUGHS: Walkthrough[] = [
  {
    slug: 'booking-through-chat',
    title: 'A booking through the chat',
    summary:
      'Demo scenario 1: “Can I book a service next Tuesday afternoon?” becomes a confirmed, audited booking.',
    tryIt: [
      'Open the Eik & Kant public page at /w/eik-og-kant and click “Ask a question” to open the chat.',
      'Type: Can I book a standard service next Tuesday afternoon?',
      'Pick a time, fill in a name and an email, and confirm.',
      'Log in as ingrid@eikogkant.example and open Bookings, the Audit log and Setup → Email outbox.',
    ],
    steps: [
      {
        title: 'The browser sends one input',
        beginner:
          'The chat window sends the typed message to the server, along with a secret key for this conversation that the browser remembers.',
        developer:
          '`POST /api/public/eik-og-kant/chat` with `{ conversationId, input: { kind: "text", text } }` and the `x-relay-conversation-token` header. A first message also carries the challenge fields. The handler checks Origin and body size, then calls the pipeline.',
        ref: { file: 'src/app/api/public/[slug]/chat/route.ts', region: 'chat-route' },
      },
      {
        title: 'Protect before doing any work',
        beginner:
          'Relay checks the message is a sensible size and that this visitor isn’t sending too many messages. A brand-new conversation must pass the bot check.',
        developer:
          'Zod validates the input union; rate limits apply per IP and per conversation (or conversation starts per IP); `enforceChallenge` runs for new conversations. The business is looked up by slug — never from the body.',
        ref: { file: 'src/modules/protection/rate-limit.ts', region: 'rate-limit' },
      },
      {
        title: 'Understand the message — outside the transaction',
        beginner:
          'The demo AI fills in its form: the customer wants to book, the service is “Standard bike service”, the time is next Tuesday afternoon.',
        developer:
          '`understand()` calls the provider with the message, local date and time in Europe/Oslo, the step and the public catalogue, then validates shape and references. The result is `intent: "book"`, a real `serviceId`, and a time preference with `partOfDay: "afternoon"`.',
        ref: { file: 'src/modules/assistant/provider.ts', region: 'understand' },
      },
      {
        title: 'Lock the conversation and let the flow decide',
        beginner:
          'Relay saves the message and decides the next step using fixed rules: a known service plus a time means “offer free times”.',
        developer:
          'Inside `withTenant`, the conversation row is locked `FOR UPDATE`, the customer message is stored with its interpretation, and `runFlow` handles the text input. `startBooking` → `offerSlots` asks the `findSlots` port.',
        ref: { file: 'src/modules/conversations/flow.ts', region: 'offer-slots' },
      },
      {
        title: 'Find free times',
        beginner:
          'Relay looks at who does this service, their Tuesday hours, holidays and existing bookings, and keeps only afternoon times at least an hour from now (Eik & Kant’s minimum notice).',
        developer:
          'The pipeline’s `searchSlots` narrows the window to 12:00–17:00 and calls `findSlotsForService`, which loads rules and calls the pure `findAvailableSlots`. The flow picks up to six varied options and stores them in state as `s1`…`s6`.',
        ref: { file: 'src/modules/scheduling/slots.ts', region: 'find-slots' },
      },
      {
        title: 'The customer picks a time and gives details',
        beginner:
          'Clicking a time sends only its short label, like “s2”. Relay then asks for a name and email, checks them, and shows a summary to confirm.',
        developer:
          '`choose_slot` looks the id up in server-held state (a forged time is impossible). `submit_details` validates with the customer schema; errors come back inside the form block. The state becomes `booking.confirm`.',
        ref: { file: 'src/modules/conversations/flow.ts', region: 'run-flow' },
      },
      {
        title: 'Confirm: re-check, insert, record',
        beginner:
          'On confirm, Relay checks one last time that the time is still free, saves the booking, writes it in the logbook, and puts the confirmation email in the outbox — all as one save.',
        developer:
          'The `createBooking` port calls the service as the assistant actor (`bookings.create` is on its allowlist). `findExactSlot` re-applies the rules, the insert runs in a savepoint loop over free staff under the exclusion constraint, then `recordAudit` and `queueEmail` run in the same transaction.',
        ref: { file: 'src/modules/scheduling/bookings.ts', region: 'create-booking' },
      },
      {
        title: 'After commit: automations, then the response',
        beginner:
          'Once the booking is safely saved, Relay runs the business’s rules (Eik & Kant emails first-time customers some tips) and sends everything new back to the chat, including the private link to manage the booking.',
        developer:
          '`runAutomations(events)` processes `conversation.started` and `booking.confirmed`. The response lists messages since the customer’s input plus `manageUrl`, which exists only in this response and the email — its hash is all that is stored.',
        ref: { file: 'src/modules/conversations/flow.ts', region: 'confirm-booking' },
      },
    ],
    related: ['chat-pipeline', 'availability', 'bookings', 'ai-boundary'],
  },
  {
    slug: 'unknown-question',
    title: 'A question Relay can’t answer',
    summary:
      'Demo scenario 2: “Do you offer a student discount?” goes to a person instead of getting a guess.',
    tryIt: [
      'On /w/eik-og-kant, open the chat and ask: Do you offer a student discount?',
      'Leave an email when asked.',
      'Log in as jonas@eikogkant.example (staff): the Inbox shows the conversation under “Needs a person”, with a task and a notification.',
      'Reply from the conversation page, then look at the customer’s chat window — the reply appears within a few seconds.',
    ],
    steps: [
      {
        title: 'Understood as a question — with no answer on file',
        beginner:
          'The demo AI recognises a question but finds no matching answer in the business’s knowledge base, prices or opening hours.',
        developer:
          'The interpretation is `ask_question` with `knowledgeItemId: null` and `topic: "none"`. Nothing in the catalogue matches, so there is no source to answer from.',
        ref: { file: 'src/modules/assistant/mock-provider.ts', region: 'mock-interpret' },
      },
      {
        title: 'The flow refuses to guess',
        beginner: 'Relay tells the customer it doesn’t have a reliable answer and that a person will reply.',
        developer:
          '`answer()` finds no FAQ, topic or service match and calls `handOff("unanswered_question")`. Without a known email, the reply includes a details form so the team can reach the customer later.',
        ref: { file: 'src/modules/conversations/flow.ts', region: 'handoff-flow' },
      },
      {
        title: 'The conversation changes hands',
        beginner:
          'The conversation is marked “Needs a person”, Relay stops answering in it, and the logbook records why.',
        developer:
          '`handOffConversation` authorizes `conversations.handoff` for the assistant, sets `NEEDS_HUMAN`, `assistantActive: false` and `handedOffAt`, audits the reason and returns a `conversation.handed_off` event.',
        ref: { file: 'src/modules/conversations/conversations.ts', region: 'handoff' },
      },
      {
        title: 'The team is told',
        beginner:
          'A default rule notifies everyone on the team and creates a task “Reply to <customer name>” due in four hours.',
        developer:
          'After commit, the default automation for `CONVERSATION_HANDED_OFF` runs: claim the run, `notify_team` and `create_task` as the automation actor, record steps and audit.',
        ref: { file: 'src/modules/automations/engine.ts', region: 'run-automation' },
      },
      {
        title: 'A person replies',
        beginner:
          'A staff member opens the conversation, sees exactly what Relay understood and why it handed over, and writes a reply.',
        developer:
          '`replyAsStaff` authorizes `inbox.reply`, stores a STAFF message, records `firstStaffReplyAt` once, and queues an email copy if the customer left an address.',
        ref: { file: 'src/modules/conversations/conversations.ts', region: 'staff-reply' },
      },
      {
        title: 'The customer sees it',
        beginner: 'The chat window checks for new messages every few seconds and shows the reply.',
        developer:
          'The widget polls `GET /api/public/[slug]/chat/[conversationId]?after=<id>` with the conversation token. The lookup matches id, organization and token hash together, so another business’s URL or a wrong token finds nothing.',
        ref: { file: 'src/modules/conversations/conversations.ts', region: 'find-conversation' },
      },
    ],
    related: ['handoff', 'ai-boundary', 'automations', 'setup-knowledge'],
  },
  {
    slug: 'staff-login',
    title: 'A staff member logs in',
    summary: 'From the login form to an authorized dashboard request.',
    tryIt: [
      'Visit /app/today while logged out: you are sent to /login with a return address.',
      'Log in as amina@eikogkant.example with the demo password.',
      'Try a wrong password for the same email several times to see the generic error, then the rate limit.',
    ],
    steps: [
      {
        title: 'No cookie? Redirect early — as a convenience',
        beginner:
          'If you have never logged in, Relay sends you to the login page before building the dashboard.',
        developer:
          'The proxy only checks that a session cookie exists and redirects with `next=`. It is not a security boundary; the server validates the session again for every page and action.',
        ref: { file: 'src/proxy.ts', region: 'proxy' },
      },
      {
        title: 'The login action',
        beginner:
          'When you submit the form, Relay first checks you haven’t tried too many times, then checks the password.',
        developer:
          'Rate limits per IP and per email run first. Then `authenticate`, `createSession` with a fresh token, the cookie, and a redirect filtered by `safeNext`.',
        ref: { file: 'src/app/(auth)/actions.ts', region: 'login-action' },
      },
      {
        title: 'Check the password without leaking anything',
        beginner:
          'Relay compares the password with the stored fingerprint. Wrong email or wrong password gives the same message and takes the same time.',
        developer:
          'scrypt verification with `timingSafeEqual`; unknown emails are verified against a dummy hash. Old parameters are upgraded on success.',
        ref: { file: 'src/modules/auth/accounts.ts', region: 'authenticate' },
      },
      {
        title: 'Create a session',
        beginner: 'Relay makes a new random key for this login and remembers only its fingerprint.',
        developer: '256 random bits, base64url; the row id is `sha256(token)`; absolute expiry in 14 days.',
        ref: { file: 'src/modules/auth/sessions.ts', region: 'session-create' },
      },
      {
        title: 'Store the key in a protected cookie',
        beginner: 'The browser keeps the key in a cookie that page scripts cannot read.',
        developer: 'HttpOnly, SameSite=Lax, and Secure with the `__Host-` prefix in production.',
        ref: { file: 'src/server/session.ts', region: 'session-cookie' },
      },
      {
        title: 'Every dashboard request: who, and for which business?',
        beginner:
          'On each page, Relay looks up the session, finds which businesses you belong to, and picks the active one — never trusting the browser to say which.',
        developer:
          '`getDashboardContext` (cached per request) builds a `MemberContext` from the session and memberships table.',
        ref: { file: 'src/server/context.ts', region: 'dashboard-context' },
      },
      {
        title: 'Every action: allowed?',
        beginner: 'Before changing anything, the code checks your role allows it.',
        developer:
          'Services call `authorizeIn(scope, ctx, permission)`, which also verifies the context’s organization matches the tenant transaction.',
        ref: { file: 'src/modules/tenancy/context.ts', region: 'authorize' },
      },
    ],
    related: ['authentication', 'authorization', 'abuse-protection'],
  },
  {
    slug: 'automation-run',
    title: 'An automation runs',
    summary: 'A booking needs approval: the owners are notified and an approval task appears — exactly once.',
    tryIt: [
      'On /w/eik-og-kant, book “E-bike diagnostics” in the chat (it needs approval).',
      'Log in as ingrid@eikogkant.example: see the notification, the approval task, and Automations → “Ask for approval on booking requests” → run history.',
    ],
    steps: [
      {
        title: 'The booking returns an event',
        beginner: 'Saving the booking also produces a note: “a booking was requested”.',
        developer:
          'Because the service is `APPROVAL`, `createBooking` stores `PENDING` and returns a `booking.requested` event. Nothing reacts until the transaction commits.',
        ref: { file: 'src/modules/scheduling/bookings.ts', region: 'create-booking' },
      },
      {
        title: 'The rule is checked again before running',
        beginner: 'Relay re-reads the rule and makes sure it still makes sense, then checks its conditions.',
        developer:
          '`automationDefinitionSchema` validates the stored JSON; incompatible or outdated definitions become a FAILED run instead of undefined behaviour.',
        ref: { file: 'src/modules/automations/definitions.ts', region: 'automation-schema' },
      },
      {
        title: 'Conditions',
        beginner:
          'Conditions like “only for this service” or “only outside opening hours” are simple yes/no checks.',
        developer: 'Pure evaluation against a loaded context; the first unmatched condition is reported.',
        ref: { file: 'src/modules/automations/evaluate.ts', region: 'evaluate-conditions' },
      },
      {
        title: 'Claim the run, execute, record',
        beginner:
          'Relay writes down “this rule is running for this event” so it can never run twice, does each step, and records how each went.',
        developer:
          'Insert `AutomationRun` (unique automation + event), run each action in its own transaction as the automation actor, update steps and status, audit `automation.run`.',
        ref: { file: 'src/modules/automations/engine.ts', region: 'run-automation' },
      },
      {
        title: 'Actions go through the normal services',
        beginner:
          'Notifying and creating tasks use the same code as when a person does it, with the same checks.',
        developer:
          '`executeAction` authorizes each action with the automation’s allowlist (`notifications.send`, `tasks.create`) and calls `notify` and `createTask`.',
        ref: { file: 'src/modules/automations/engine.ts', region: 'execute-action' },
      },
    ],
    related: ['automations', 'bookings', 'audit-log'],
  },
];

export function getWalkthrough(slug: string): Walkthrough | undefined {
  return WALKTHROUGHS.find((w) => w.slug === slug);
}
