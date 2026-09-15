/**
 * Demo data: `npm run db:seed` (also run by `npm run setup`).
 *
 * WARNING: empties every table in the database DATABASE_URL points at, then creates:
 *  - Eik & Kant, a fictional bike and ski workshop in Oslo, with staff, hours, services, FAQs,
 *    automations and ~7 weeks of bookings, conversations, leads, tasks and automation runs;
 *  - Bakgården Frisør, a small second business used to demonstrate data isolation.
 *
 * History is generated with a seeded random generator, relative to today, so the dashboard
 * always has a realistic "today". Customer messages are interpreted by the real demo AI.
 * All people, emails and businesses are fictional.
 */
import path from 'node:path';
import pg from 'pg';
import type { Prisma } from '@/generated/prisma/client';
import type { AutomationTrigger } from '@/generated/prisma/enums';

process.loadEnvFile(path.resolve(import.meta.dirname, '../.env'));

const { enterTenant, prisma } = await import('@/lib/db');
/** One long transaction per business: all of its demo data appears, or none of it. */
const transaction = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
  prisma.$transaction(work, { timeout: 300_000, maxWait: 10_000 });
const { addDays, formatInZone, isoWeekday, toLocalDate, zonedTimeToUtc } = await import('@/lib/time');
const { generateReference, generateToken, hashToken } = await import('@/lib/tokens');
const { hashPassword } = await import('@/modules/auth/password');
const { interpretMessage } = await import('@/modules/assistant/mock-provider');
const { defaultAutomations } = await import('@/modules/automations/defaults');
const { DEMO_ACCOUNTS, DEMO_PASSWORD } = await import('@/content/demo');

type Scope = Awaited<ReturnType<typeof enterTenant>>;

// ─── Deterministic randomness ───────────────────────────────────────────────

let seed = 20260915;
function random() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const chance = (p: number) => random() < p;
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

const TZ = 'Europe/Oslo';
const now = new Date();
const today = toLocalDate(now, TZ);
const MIN = 60_000;
const HOUR = 60 * MIN;

// ─── Reset ──────────────────────────────────────────────────────────────────

async function reset() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
  await client.end();
}

// ─── Reference data ─────────────────────────────────────────────────────────

const CUSTOMER_NAMES = [
  'Kari Hansen',
  'Ole Johansen',
  'Nora Larsen',
  'Emil Andersen',
  'Sara Pedersen',
  'Henrik Nilsen',
  'Ida Kristiansen',
  'Magnus Jensen',
  'Thea Karlsen',
  'Lars Olsen',
  'Maja Bergstrøm',
  'Sander Eriksen',
  'Emma Haug',
  'Jakob Johannessen',
  'Leah Dahl',
  'Filip Lie',
  'Sofie Moen',
  'Aksel Strand',
  'Hanna Bakken',
  'Noah Rasmussen',
  'Frida Solheim',
  'Oskar Holm',
  'Julie Lunde',
  'Isak Berge',
  'Vilde Myhre',
  'Tobias Nygaard',
  'Selma Aune',
  'William Brekke',
  'Ella Sæther',
  'Mathias Engen',
  'Mia Vik',
  'Elias Hagen',
  'Amalie Fjeld',
  'Lucas Tangen',
  'Olivia Hovland',
  'Adrian Lien',
  'Astrid Ruud',
  'Ahmed Rahimi',
  'Zara Ali',
  'Mateusz Nowak',
  'Aisha Hussain',
  'Tomasz Kowalski',
];

const emailFor = (name: string, n: number) =>
  `${name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z ]/g, '')
    .replace(/ /g, '.')}${n > 0 ? n : ''}@example.com`;

interface ServiceSeed {
  key: string;
  name: string;
  description: string;
  kind: 'BOOKABLE' | 'QUOTE';
  durationMinutes?: number;
  priceNok?: number;
  priceIsFrom?: boolean;
  confirmationMode?: 'INSTANT' | 'APPROVAL';
  keywords: string[];
  staff: string[];
  openers?: string[];
}

const WORKSHOP_SERVICES: ServiceSeed[] = [
  {
    key: 'puncture',
    name: 'Puncture repair',
    description: 'New inner tube or patch, tyre checked for glass and wear.',
    kind: 'BOOKABLE',
    durationMinutes: 30,
    priceNok: 249,
    keywords: ['puncture', 'flat tyre', 'flat tire', 'inner tube', 'flat'],
    staff: ['jonas', 'petter', 'ingrid'],
    openers: [
      'I’ve got a flat tyre, can you fix it this week?',
      'Puncture on my commuter bike — any time tomorrow?',
      'Hi, can I book a puncture repair?',
    ],
  },
  {
    key: 'standard',
    name: 'Standard bike service',
    description: 'Gears and brakes adjusted, chain and bearings checked, everything tightened and cleaned.',
    kind: 'BOOKABLE',
    durationMinutes: 60,
    priceNok: 1190,
    keywords: ['service', 'servicing', 'tune-up', 'tune up', 'check-up', 'annual service'],
    staff: ['ingrid', 'jonas'],
    openers: [
      'Hi, I’d like to book a service for my bike',
      'Can I get my bike serviced next week?',
      'Time for the yearly service — do you have anything on Friday?',
    ],
  },
  {
    key: 'brakes',
    name: 'Hydraulic brake bleed',
    description: 'Fresh fluid and a proper bleed for brakes that feel soft or spongy.',
    kind: 'BOOKABLE',
    durationMinutes: 45,
    priceNok: 690,
    keywords: ['brake bleed', 'hydraulic brakes', 'spongy brakes', 'brakes'],
    staff: ['ingrid', 'jonas'],
    openers: [
      'My hydraulic brakes feel spongy, can I book a brake bleed?',
      'Can I book a time for my brakes? They feel soft.',
    ],
  },
  {
    key: 'ebike',
    name: 'E-bike diagnostics',
    description:
      'Motor, battery and display read-out. We confirm these bookings personally so the right mechanic is in.',
    kind: 'BOOKABLE',
    durationMinutes: 45,
    priceNok: 590,
    confirmationMode: 'APPROVAL',
    keywords: ['e-bike', 'ebike', 'electric bike', 'motor', 'battery', 'error code', 'display'],
    staff: ['ingrid', 'amina'],
    openers: [
      'My e-bike shows an error code, can I book a time?',
      'The motor on my electric bike cuts out — do you have time this week?',
    ],
  },
  {
    key: 'studded',
    name: 'Studded tyre fitting',
    description: 'Swap to studded winter tyres (tyres not included).',
    kind: 'BOOKABLE',
    durationMinutes: 30,
    priceNok: 399,
    keywords: ['studded', 'winter tyres', 'winter tires', 'spikes', 'piggdekk'],
    staff: ['jonas', 'petter'],
    openers: [
      'Can I book studded tyre fitting before the first snow?',
      'I need winter tyres fitted, what times do you have?',
    ],
  },
  {
    key: 'ski',
    name: 'Ski waxing and edges',
    description: 'Base cleaned and hot-waxed, edges sharpened. Cross-country or alpine.',
    kind: 'BOOKABLE',
    durationMinutes: 30,
    priceNok: 449,
    keywords: ['ski', 'skis', 'wax', 'waxing', 'edges', 'sharpen'],
    staff: ['amina'],
    openers: [
      'Can I get my skis waxed and the edges sharpened this week?',
      'Ski waxing before the weekend — any free time?',
    ],
  },
  {
    key: 'overhaul',
    name: 'Full overhaul',
    description: 'Stripped, cleaned, worn parts replaced and rebuilt. Priced after an assessment.',
    kind: 'QUOTE',
    priceNok: 2900,
    priceIsFrom: true,
    keywords: ['overhaul', 'rebuild', 'restoration', 'restore', 'strip down'],
    staff: [],
  },
  {
    key: 'wheel',
    name: 'Wheel build',
    description: 'A new wheel built by hand around the hub and rim you choose.',
    kind: 'QUOTE',
    keywords: ['wheel build', 'new wheel', 'custom wheel', 'build a wheel'],
    staff: [],
  },
];

const KNOWLEDGE = [
  {
    question: 'Do you give a warranty on repairs?',
    answer:
      'Yes. All workshop labour has a three-month warranty. Parts carry the manufacturer’s warranty, which is usually two years.',
    keywords: ['warranty', 'guarantee', 'garanti'],
    askedAs: ['Do you give any guarantee on the work?', 'Is there a warranty if something breaks again?'],
  },
  {
    question: 'How can I pay?',
    answer: 'Card or Vipps in the shop. Companies can ask for an invoice.',
    keywords: ['pay', 'payment', 'vipps', 'card', 'invoice', 'cash'],
    askedAs: ['Can I pay with Vipps?', 'Do you take card payment?'],
  },
  {
    question: 'How long does a service take?',
    answer:
      'Most services are done the same day if you bring the bike in before 10:00. Bigger jobs can take two to three working days — we tell you when you book.',
    keywords: ['how long', 'same day', 'ready', 'turnaround'],
    askedAs: ['How long does it take to get the bike back?', 'Will it be ready the same day?'],
  },
  {
    question: 'Can I borrow a bike while mine is in the workshop?',
    answer: 'We have two loan bikes. Ask for one when you book and we’ll hold it for you if it’s free.',
    keywords: ['loan bike', 'loaner', 'borrow', 'courtesy bike', 'replacement bike'],
    askedAs: ['Can I borrow a bike while you fix mine?'],
  },
  {
    question: 'Do you sell bikes?',
    answer:
      'We don’t sell new bikes, but we often have a few refurbished ones. Ask us what’s in the shop this week.',
    keywords: ['sell bikes', 'buy a bike', 'second hand', 'used bike', 'refurbished'],
    askedAs: ['Do you have any used bikes for sale?'],
  },
  {
    question: 'What is your cancellation policy?',
    answer:
      'You can cancel or move a booking free of charge up to 24 hours before, with the link in your confirmation email. After that, call in and we’ll sort it out.',
    keywords: ['cancellation policy', 'cancel policy', 'late cancellation', 'no show'],
    askedAs: ['What is your cancellation policy?'],
  },
  {
    question: 'Which e-bike systems do you work on?',
    answer:
      'Bosch, Shimano Steps and Yamaha. For other systems, send us the model first and we’ll check before you come in.',
    keywords: ['bosch', 'shimano steps', 'yamaha', 'brose', 'e-bike system', 'which brands'],
    askedAs: ['Do you work on Bosch motors?'],
  },
  {
    question: 'Where can I park?',
    answer: 'There’s street parking nearby, and you can roll the bike right up to the workshop door.',
    keywords: ['parking', 'park', 'car'],
    askedAs: ['Is there anywhere to park?'],
  },
];

const UNANSWERED = [
  {
    question: 'Do you offer a student discount?',
    reply: 'Hi! Yes — show a valid student card and you get 10 % off labour.',
  },
  {
    question: 'Can you convert my bike to a belt drive?',
    reply:
      'It depends on the frame — it needs a split rear triangle. Send us a photo of the rear dropout and we’ll tell you.',
  },
  {
    question: 'Do you repair Brompton internal hubs?',
    reply: 'We do. The 2-speed and 6-speed hubs usually take two days, parts permitting.',
  },
  {
    question: 'Can I rent a cargo bike from you for a weekend?',
    reply: 'Sorry, we don’t rent bikes. Bysykkel or a local cargo bike library might help.',
  },
  {
    question: 'Can you replace the rear shock on a 2012 mountain bike?',
    reply: 'Probably, but shock sizes vary. Bring it in or send the eye-to-eye length and stroke.',
  },
  {
    question: 'Do you service kick-sleds?',
    reply: 'Ha — we’ve done a few! Bring it in and we’ll have a look at the runners.',
  },
];

const QUOTES = [
  {
    text: 'Could you quote a full overhaul of my 1985 road bike? It has been in a shed for years.',
    service: 'overhaul',
  },
  { text: 'I need a new rear wheel built with a dynamo hub — what would it cost?', service: 'wheel' },
  { text: 'My old Peugeot needs a complete rebuild, can I get an estimate?', service: 'overhaul' },
  { text: 'Could you give me a price for restoring a vintage steel frame bike?', service: 'overhaul' },
  { text: 'Can I get a quote for a custom wheel build for gravel riding?', service: 'wheel' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const hours = (from: string, to: string) => {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  return { startMinute: fh! * 60 + fm!, endMinute: th! * 60 + tm! };
};

async function audit(
  scope: Scope,
  at: Date,
  entry: {
    actorType: 'USER' | 'CUSTOMER' | 'ASSISTANT' | 'AUTOMATION' | 'SYSTEM';
    actorId?: string | null;
    actorLabel: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    result?: 'SUCCESS' | 'FAILURE' | 'DENIED';
    metadata?: Record<string, unknown>;
  },
) {
  await scope.db.auditLog.create({
    data: {
      organizationId: scope.organizationId,
      createdAt: at,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      actorLabel: entry.actorLabel,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      result: entry.result ?? 'SUCCESS',
      metadata: (entry.metadata ?? {}) as object,
    },
  });
}

interface Msg {
  author: 'CUSTOMER' | 'ASSISTANT' | 'STAFF';
  body: string;
  blocks?: unknown[];
  understanding?: unknown;
  staffMembershipId?: string;
  gapMinutes?: number;
}

async function conversationWithMessages(
  scope: Scope,
  params: {
    startedAt: Date;
    customerId: string | null;
    status: 'OPEN' | 'NEEDS_HUMAN' | 'RESOLVED';
    assistantActive: boolean;
    messages: Msg[];
    hadBookingIntent?: boolean;
    handedOff?: boolean;
    assigneeId?: string | null;
    channel?: 'WEB_CHAT' | 'EMAIL';
    subject?: string;
  },
) {
  let at = params.startedAt.getTime();
  const conversation = await scope.db.conversation.create({
    data: {
      organizationId: scope.organizationId,
      channel: params.channel ?? 'WEB_CHAT',
      subject: params.subject ?? null,
      customerId: params.customerId,
      status: params.status,
      assistantActive: params.assistantActive,
      accessTokenHash: hashToken(generateToken()),
      state: params.assistantActive ? { step: 'idle', misunderstood: 0 } : { step: 'handed_off' },
      hadBookingIntent: params.hadBookingIntent ?? false,
      assigneeId: params.assigneeId ?? null,
      createdAt: params.startedAt,
      lastMessageAt: params.startedAt,
    },
  });
  let handedOffAt: Date | null = null;
  let firstStaffReplyAt: Date | null = null;
  for (const message of params.messages) {
    at += (message.gapMinutes ?? between(0, 1)) * MIN + between(2, 40) * 1000;
    const createdAt = new Date(at);
    if (message.author === 'STAFF' && !firstStaffReplyAt) firstStaffReplyAt = createdAt;
    await scope.db.message.create({
      data: {
        organizationId: scope.organizationId,
        conversationId: conversation.id,
        author: message.author,
        body: message.body,
        blocks: (message.blocks as object) ?? undefined,
        understanding: (message.understanding as object) ?? undefined,
        staffMembershipId: message.staffMembershipId ?? null,
        createdAt,
      },
    });
  }
  if (params.handedOff) handedOffAt = new Date(params.startedAt.getTime() + 2 * MIN);
  await scope.db.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(at),
      handedOffAt,
      firstStaffReplyAt,
      resolvedAt: params.status === 'RESOLVED' ? new Date(at + 10 * MIN) : null,
    },
  });
  return { conversation, endedAt: new Date(at) };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Resetting demo database…');
  await reset();

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = new Map<string, { id: string; name: string }>();
  for (const account of DEMO_ACCOUNTS) {
    const user = await prisma.user.create({
      data: { email: account.email, name: account.name, passwordHash },
    });
    users.set(account.email, user);
  }

  await seedWorkshop(users);
  await seedSalon(users);

  const counts = await prisma.$queryRaw<{ table: string; rows: number }[]>`
    SELECT 'organizations' AS table, count(*)::int AS rows FROM "Organization"
    UNION ALL SELECT 'users', count(*)::int FROM "User"`;
  console.log('Seeded:', counts.map((c) => `${c.rows} ${c.table}`).join(', '));
  console.log(`Log in with ${DEMO_ACCOUNTS[0].email} / ${DEMO_PASSWORD}`);
}

async function seedWorkshop(users: Map<string, { id: string; name: string }>) {
  console.log('Creating Eik & Kant…');
  await transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        slug: 'eik-og-kant',
        name: 'Eik & Kant',
        tagline: 'Bike and ski workshop on Torshov',
        description:
          'A small workshop fixing everyday bikes, e-bikes and skis. Book a time online, or tell us what’s wrong and we’ll take it from there.',
        city: 'Oslo',
        addressLine: 'Torshov',
        contactEmail: 'post@eikogkant.example',
        contactPhone: null,
        openingHours: [
          ...[1, 2, 3, 5].map((weekday) => ({ weekday, opens: 540, closes: 1020 })),
          { weekday: 4, opens: 540, closes: 1140 },
          { weekday: 6, opens: 600, closes: 900 },
        ],
        minNoticeMinutes: 60,
        bookingHorizonDays: 30,
        cancellationWindowHours: 24,
        slotIntervalMinutes: 30,
        handoffReplyHours: 4,
        isDemo: true,
        createdAt: new Date(now.getTime() - 60 * 24 * HOUR),
      },
    });
    const scope = await enterTenant(tx, org.id);
    const { db, organizationId } = scope;

    // Team
    const membership = async (email: string, role: 'OWNER' | 'ADMIN' | 'STAFF') =>
      tx.membership.create({ data: { organizationId, userId: users.get(email)!.id, role } });
    const ingridM = await membership('ingrid@eikogkant.example', 'OWNER');
    const aminaM = await membership('amina@eikogkant.example', 'ADMIN');
    const jonasM = await membership('jonas@eikogkant.example', 'STAFF');
    const members = { ingrid: ingridM, amina: aminaM, jonas: jonasM };

    const staff = {
      ingrid: await db.staffMember.create({
        data: {
          organizationId,
          displayName: 'Ingrid Solberg',
          title: 'Workshop lead',
          membershipId: ingridM.id,
          sortOrder: 0,
        },
      }),
      jonas: await db.staffMember.create({
        data: {
          organizationId,
          displayName: 'Jonas Haugen',
          title: 'Mechanic',
          membershipId: jonasM.id,
          sortOrder: 1,
        },
      }),
      amina: await db.staffMember.create({
        data: {
          organizationId,
          displayName: 'Amina Berg',
          title: 'E-bike and ski technician',
          membershipId: aminaM.id,
          sortOrder: 2,
        },
      }),
      petter: await db.staffMember.create({
        data: { organizationId, displayName: 'Petter Aas', title: 'Apprentice (no login)', sortOrder: 3 },
      }),
    };
    const workingHours: Record<
      keyof typeof staff,
      { weekday: number; startMinute: number; endMinute: number }[]
    > = {
      ingrid: [1, 2, 3, 5]
        .map((weekday) => ({ weekday, ...hours('09:00', '17:00') }))
        .concat([{ weekday: 4, ...hours('09:00', '19:00') }]),
      jonas: [2, 3, 5]
        .map((weekday) => ({ weekday, ...hours('10:00', '17:00') }))
        .concat([
          { weekday: 4, ...hours('11:00', '19:00') },
          { weekday: 6, ...hours('10:00', '15:00') },
        ]),
      amina: [1, 3, 4, 5].map((weekday) => ({ weekday, ...hours('09:00', '16:00') })),
      petter: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, ...hours('12:00', '17:00') })),
    };
    for (const [key, list] of Object.entries(workingHours)) {
      await db.workingHours.createMany({
        data: list.map((h) => ({ organizationId, staffMemberId: staff[key as keyof typeof staff].id, ...h })),
      });
    }
    // A closure and a day off, so time off is visible in the demo.
    const nextHoliday = addDays(today, 9 + ((8 - isoWeekday(addDays(today, 9))) % 7));
    await db.timeOff.create({
      data: {
        organizationId,
        staffMemberId: staff.jonas.id,
        startsAt: zonedTimeToUtc(addDays(today, 2), 0, TZ),
        endsAt: zonedTimeToUtc(addDays(today, 3), 0, TZ),
        reason: 'Course: Bosch e-bike certification',
      },
    });
    await db.timeOff.create({
      data: {
        organizationId,
        staffMemberId: null,
        startsAt: zonedTimeToUtc(nextHoliday, 0, TZ),
        endsAt: zonedTimeToUtc(addDays(nextHoliday, 1), 0, TZ),
        reason: 'Workshop closed: stocktaking',
      },
    });

    // Services
    const services = new Map<string, { id: string; seed: ServiceSeed }>();
    let order = 0;
    for (const s of WORKSHOP_SERVICES) {
      const service = await db.service.create({
        data: {
          organizationId,
          name: s.name,
          description: s.description,
          kind: s.kind,
          durationMinutes: s.durationMinutes ?? null,
          priceMinor: s.priceNok ? s.priceNok * 100 : null,
          priceIsFrom: s.priceIsFrom ?? false,
          confirmationMode: s.confirmationMode ?? 'INSTANT',
          keywords: s.keywords,
          sortOrder: order++,
        },
      });
      services.set(s.key, { id: service.id, seed: s });
      for (const person of s.staff) {
        await db.staffService.create({
          data: {
            organizationId,
            staffMemberId: staff[person as keyof typeof staff].id,
            serviceId: service.id,
          },
        });
      }
    }

    // Knowledge
    const knowledge = [];
    for (const [i, k] of KNOWLEDGE.entries()) {
      knowledge.push({
        ...k,
        row: await db.knowledgeItem.create({
          data: {
            organizationId,
            question: k.question,
            answer: k.answer,
            keywords: k.keywords,
            sortOrder: i,
          },
        }),
      });
    }

    // Automations
    const [handoffDefault, approvalDefault] = defaultAutomations();
    const automationRows = {
      handoff: await db.automation.create({
        data: {
          organizationId,
          name: handoffDefault!.name,
          description: handoffDefault!.description,
          trigger: handoffDefault!.trigger,
          conditions: handoffDefault!.conditions,
          actions: handoffDefault!.actions,
          createdByMembershipId: ingridM.id,
          createdAt: org.createdAt,
        },
      }),
      approval: await db.automation.create({
        data: {
          organizationId,
          name: 'E-bike requests go to Amina',
          description: 'Amina approves e-bike diagnostics, so she gets the task and a notification.',
          trigger: approvalDefault!.trigger,
          conditions: [],
          actions: [
            {
              type: 'notify_team',
              roles: [],
              membershipIds: [aminaM.id],
              message: 'Booking request: {{service.name}}, {{booking.when}}',
            },
            {
              type: 'create_task',
              title: 'Approve or decline {{booking.reference}}',
              kind: 'APPROVAL',
              dueInHours: 24,
              assigneeId: aminaM.id,
            },
          ],
          createdByMembershipId: aminaM.id,
          createdAt: org.createdAt,
        },
      }),
      afterHours: await db.automation.create({
        data: {
          organizationId,
          name: 'After-hours welcome',
          description: 'Lets people know the workshop is closed, and that Relay can still book them in.',
          trigger: 'CONVERSATION_STARTED',
          conditions: [{ type: 'business_hours', value: 'closed' }],
          actions: [
            {
              type: 'send_chat_reply',
              message:
                'By the way, the workshop is closed right now. Bookings still go straight into the calendar, and the team reads everything else when we open.',
            },
          ],
          createdByMembershipId: ingridM.id,
          createdAt: org.createdAt,
        },
      }),
      quotes: await db.automation.create({
        data: {
          organizationId,
          name: 'Quotes go to Ingrid',
          description: 'Overhauls and wheel builds need Ingrid’s eye before anyone gets a price.',
          trigger: 'LEAD_CREATED',
          conditions: [
            { type: 'service_is', serviceIds: [services.get('overhaul')!.id, services.get('wheel')!.id] },
          ],
          actions: [
            { type: 'assign_to', membershipId: ingridM.id },
            {
              type: 'create_task',
              title: 'Send a quote to {{customer.firstName}}',
              kind: 'FOLLOW_UP',
              dueInHours: 24,
              assigneeId: ingridM.id,
            },
          ],
          createdByMembershipId: ingridM.id,
          createdAt: org.createdAt,
        },
      }),
      firstVisit: await db.automation.create({
        data: {
          organizationId,
          name: 'First-visit tips',
          description: 'New customers get a short email about parking and what to bring.',
          trigger: 'BOOKING_CONFIRMED',
          conditions: [{ type: 'customer_is', value: 'new' }],
          actions: [
            {
              type: 'email_customer',
              subject: 'Before your first visit to {{business.name}}',
              body: 'Hi {{customer.firstName}},\n\nSee you {{booking.when}}. A few tips: roll the bike right up to the door, bring the key if you have a lock on it, and tell us about any noises — a short video helps.\n\nEik & Kant',
            },
          ],
          createdByMembershipId: aminaM.id,
          createdAt: org.createdAt,
        },
      }),
      cancellations: await db.automation.create({
        data: {
          organizationId,
          name: 'Tell Ingrid about cancellations',
          trigger: 'BOOKING_CANCELLED',
          conditions: [],
          actions: [
            {
              type: 'notify_team',
              roles: [],
              membershipIds: [ingridM.id],
              message: '{{service.name}} on {{booking.when}} was cancelled',
            },
          ],
          createdByMembershipId: ingridM.id,
          createdAt: org.createdAt,
        },
      }),
      emailHandoff: await db.automation.create({
        data: {
          organizationId,
          name: 'Hand email enquiries to a person',
          description: 'Switched off for now — Relay answers simple email questions itself.',
          trigger: 'CONVERSATION_STARTED',
          conditions: [{ type: 'channel_is', value: 'EMAIL' }],
          actions: [{ type: 'hand_off' }],
          enabled: false,
          createdByMembershipId: aminaM.id,
          createdAt: org.createdAt,
        },
      }),
    };

    await audit(scope, org.createdAt, {
      actorType: 'USER',
      actorId: users.get('ingrid@eikogkant.example')!.id,
      actorLabel: 'Ingrid Solberg',
      action: 'organization.created',
      entityType: 'Organization',
      entityId: org.id,
      metadata: { slug: org.slug },
    });

    // Customers
    const customers = [];
    for (const [i, name] of CUSTOMER_NAMES.entries()) {
      customers.push(
        await db.customer.create({
          data: {
            organizationId,
            name,
            email: emailFor(name, 0),
            phone: chance(0.7) ? `+47 9${between(10, 99)} ${between(10, 99)} ${between(100, 999)}` : null,
            createdAt: new Date(now.getTime() - (60 - (i % 55)) * 24 * HOUR),
          },
        }),
      );
    }
    const customerHasBooked = new Set<string>();

    const catalog = {
      services: [...services.values()].map((s) => ({
        id: s.id,
        name: s.seed.name,
        kind: s.seed.kind,
        keywords: s.seed.keywords,
      })),
      knowledge: knowledge.map((k) => ({ id: k.row.id, question: k.question, keywords: k.keywords })),
    };
    const understand = (text: string, at: Date, step = 'idle') => ({
      ...interpretMessage({
        message: text,
        localNow: { date: toLocalDate(at, TZ), minute: 600 },
        step,
        services: catalog.services,
        knowledge: catalog.knowledge,
      }),
      provider: 'demo-rules',
      rejected: null,
    });

    // ── Bookings, day by day, without overlaps (the exclusion constraint would refuse them anyway).
    const occupied = new Map<string, { start: number; end: number }[]>();
    const isFree = (staffId: string, start: Date, end: Date) =>
      !(occupied.get(staffId) ?? []).some((b) => start.getTime() < b.end && b.start < end.getTime());

    const bookable = [...services.values()].filter((s) => s.seed.kind === 'BOOKABLE');
    let bookingsCreated = 0;
    const recentOutbox: { email: string; subject: string; text: string; at: Date; bookingId: string }[] = [];

    for (let offset = -45; offset <= 14; offset++) {
      const date = addDays(today, offset);
      const weekday = isoWeekday(date);
      const fill = offset < 0 ? 0.42 : offset === 0 ? 0.55 : Math.max(0.12, 0.4 - offset * 0.025);

      for (const [key, member] of Object.entries(staff)) {
        for (const range of workingHours[key as keyof typeof staff].filter((h) => h.weekday === weekday)) {
          for (let minute = range.startMinute; minute < range.endMinute; minute += 30) {
            if (!chance(fill)) continue;
            const options = bookable.filter(
              (s) => s.seed.staff.includes(key) && minute + s.seed.durationMinutes! <= range.endMinute,
            );
            if (options.length === 0) continue;
            const service = pick(options);
            const startsAt = zonedTimeToUtc(date, minute, TZ);
            const endsAt = new Date(startsAt.getTime() + service.seed.durationMinutes! * MIN);
            if (!isFree(member.id, startsAt, endsAt)) continue;
            if (offset === 0 && startsAt < now && chance(0.2)) continue;

            occupied.set(member.id, [
              ...(occupied.get(member.id) ?? []),
              { start: startsAt.getTime(), end: endsAt.getTime() },
            ]);
            const customer = pick(customers);
            const viaChat = chance(0.58);
            // Booked 4 h – 4 days before the appointment, and never "in the future": upcoming
            // bookings get a creation time spread over the last ten days.
            const createdAt = new Date(
              Math.min(
                startsAt.getTime() - between(4, 96) * HOUR,
                now.getTime() - between(10, 60 * 24 * 10) * MIN,
              ),
            );
            const pastOnly = (instant: number) =>
              new Date(Math.max(createdAt.getTime() + MIN, Math.min(instant, now.getTime() - 2 * MIN)));
            const approval = service.seed.confirmationMode === 'APPROVAL';

            let status: 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'DECLINED' = 'CONFIRMED';
            if (approval && startsAt > now && chance(0.45)) status = 'PENDING';
            else if (approval && chance(0.1)) status = 'DECLINED';
            else if (chance(0.07)) status = 'CANCELLED';

            const token = generateToken();
            const booking = await db.booking.create({
              data: {
                organizationId,
                reference: generateReference('EK'),
                serviceId: service.id,
                staffMemberId: member.id,
                customerId: customer.id,
                createdByMembershipId: viaChat ? null : pick([ingridM.id, jonasM.id, aminaM.id]),
                startsAt,
                endsAt,
                status,
                origin: viaChat ? 'CHAT' : 'DASHBOARD',
                manageTokenHash: hashToken(token),
                decidedAt: approval && status !== 'PENDING' ? pastOnly(createdAt.getTime() + 3 * HOUR) : null,
                cancelledAt:
                  status === 'CANCELLED' ? pastOnly(createdAt.getTime() + between(1, 40) * HOUR) : null,
                createdAt,
              },
            });
            bookingsCreated++;
            const isNewCustomer = !customerHasBooked.has(customer.id);
            customerHasBooked.add(customer.id);

            let conversationId: string | null = null;
            if (viaChat) {
              const opener = pick(service.seed.openers!);
              const when = formatInZone(startsAt, TZ, "EEEE d MMMM 'at' HH:mm");
              const day = formatInZone(startsAt, TZ, 'EEEE d MMMM');
              const { conversation } = await conversationWithMessages(scope, {
                startedAt: new Date(createdAt.getTime() - between(3, 8) * MIN),
                customerId: customer.id,
                status: startsAt < now ? 'RESOLVED' : 'OPEN',
                assistantActive: true,
                hadBookingIntent: true,
                messages: [
                  {
                    author: 'ASSISTANT',
                    body: 'Hi! I’m the automated assistant for Eik & Kant. I can book you in, answer questions about prices and opening hours, or pass you to someone at the workshop.',
                    gapMinutes: 0,
                  },
                  { author: 'CUSTOMER', body: opener, understanding: understand(opener, createdAt) },
                  {
                    author: 'ASSISTANT',
                    body: `These times are free for ${service.seed.name}:\n(about ${service.seed.durationMinutes} min · ${new Intl.NumberFormat('nb-NO').format(service.seed.priceNok!)} kr.${approval ? ' The workshop confirms this service personally.' : ''})`,
                    blocks: [
                      {
                        type: 'slot_options',
                        days: [
                          {
                            label: day,
                            slots: [
                              { id: 's1', time: formatInZone(startsAt, TZ, 'HH:mm') },
                              {
                                id: 's2',
                                time: formatInZone(new Date(startsAt.getTime() + 90 * MIN), TZ, 'HH:mm'),
                              },
                            ],
                          },
                        ],
                        canShowMore: true,
                      },
                    ],
                  },
                  { author: 'CUSTOMER', body: when, gapMinutes: 1 },
                  {
                    author: 'ASSISTANT',
                    body: `${when} — great choice. Who is the booking for?`,
                    blocks: [{ type: 'details_form', purpose: 'booking', requirePhone: false, prefill: {} }],
                  },
                  { author: 'CUSTOMER', body: 'Shared contact details', gapMinutes: 1 },
                  {
                    author: 'ASSISTANT',
                    body: approval
                      ? 'Here’s your request. Shall I send it?'
                      : 'Here’s your booking. Shall I confirm it?',
                  },
                  { author: 'CUSTOMER', body: 'Confirm' },
                  {
                    author: 'ASSISTANT',
                    body: approval
                      ? `Your request is in. Eik & Kant will confirm it shortly — you’ll get an email at ${customer.email} either way.`
                      : `You’re booked in. I’ve sent a confirmation to ${customer.email} with a link to change or cancel.`,
                    blocks: [
                      {
                        type: 'booking_result',
                        status: approval ? 'PENDING' : 'CONFIRMED',
                        reference: booking.reference,
                        service: service.seed.name,
                        when,
                      },
                    ],
                  },
                ],
              });
              conversationId = conversation.id;
              await db.booking.update({ where: { id: booking.id }, data: { conversationId } });
            }

            await audit(scope, createdAt, {
              actorType: viaChat ? 'ASSISTANT' : 'USER',
              actorId: viaChat ? null : users.get('jonas@eikogkant.example')!.id,
              actorLabel: viaChat ? 'Relay assistant' : 'Jonas Haugen',
              action: approval ? 'booking.requested' : 'booking.created',
              entityType: 'Booking',
              entityId: booking.id,
              metadata: {
                status: approval ? 'PENDING' : 'CONFIRMED',
                origin: viaChat ? 'CHAT' : 'DASHBOARD',
                serviceId: service.id,
                staffMemberId: member.id,
              },
            });

            if (approval) {
              await automationRun(
                scope,
                automationRows.approval,
                createdAt,
                { bookingId: booking.id, conversationId },
                [
                  { action: 'notify_team', status: 'succeeded', detail: 'Notified 1 team member.' },
                  { action: 'create_task', status: 'succeeded', detail: 'Task created.' },
                ],
              );
              if (status === 'PENDING') {
                await db.task.create({
                  data: {
                    organizationId,
                    title: `Approve or decline ${booking.reference}`,
                    kind: 'APPROVAL',
                    assigneeId: aminaM.id,
                    dueAt: new Date(createdAt.getTime() + 24 * HOUR),
                    bookingId: booking.id,
                    conversationId,
                    createdAt,
                  },
                });
                await db.notification.create({
                  data: {
                    organizationId,
                    membershipId: aminaM.id,
                    title: `Booking request: ${service.seed.name}, ${formatInZone(startsAt, TZ, "EEEE d MMMM 'at' HH:mm")}`,
                    href: `/app/bookings/${booking.id}`,
                    createdAt,
                  },
                });
              } else {
                await audit(scope, booking.decidedAt!, {
                  actorType: 'USER',
                  actorId: users.get('amina@eikogkant.example')!.id,
                  actorLabel: 'Amina Berg',
                  action: status === 'DECLINED' ? 'booking.declined' : 'booking.approved',
                  entityType: 'Booking',
                  entityId: booking.id,
                  metadata: { from: 'PENDING', to: status === 'DECLINED' ? 'DECLINED' : 'CONFIRMED' },
                });
              }
            }
            if (status === 'CONFIRMED' && isNewCustomer) {
              await automationRun(
                scope,
                automationRows.firstVisit,
                createdAt,
                { bookingId: booking.id, conversationId },
                [{ action: 'email_customer', status: 'succeeded', detail: 'Email placed in the outbox.' }],
              );
            }
            if (status === 'CANCELLED') {
              await audit(scope, booking.cancelledAt!, {
                actorType: 'CUSTOMER',
                actorId: customer.id,
                actorLabel: 'Customer',
                action: 'booking.cancelled',
                entityType: 'Booking',
                entityId: booking.id,
                metadata: { from: 'CONFIRMED', by: 'customer' },
              });
              await automationRun(
                scope,
                automationRows.cancellations,
                booking.cancelledAt!,
                { bookingId: booking.id, conversationId },
                [{ action: 'notify_team', status: 'succeeded', detail: 'Notified 1 team member.' }],
              );
            }
            if (createdAt > new Date(now.getTime() - 7 * 24 * HOUR) && status !== 'DECLINED') {
              recentOutbox.push({
                email: customer.email!,
                subject: `${approval ? 'We received your request' : 'Booking confirmed'}: ${service.seed.name}, ${formatInZone(startsAt, TZ, "EEEE d MMMM 'at' HH:mm")}`,
                text: `Hi ${customer.name!.split(' ')[0]},\n\n${approval ? 'Thanks for your request. Eik & Kant will confirm it shortly.' : 'You’re booked in at Eik & Kant.'}\n\n${service.seed.name}\n${formatInZone(startsAt, TZ, "EEEE d MMMM 'at' HH:mm")}\nTorshov\nReference: ${booking.reference}\n\nChange or cancel (up to 24 hours before): ${process.env.APP_URL}/w/eik-og-kant/booking/${token}`,
                at: createdAt,
                bookingId: booking.id,
              });
            }
          }
        }
      }
    }
    for (const mail of recentOutbox) {
      await db.outboundEmail.create({
        data: {
          organizationId,
          toAddress: mail.email,
          subject: mail.subject,
          textBody: mail.text,
          provider: 'demo-outbox',
          status: 'STORED_IN_OUTBOX',
          relatedType: 'Booking',
          relatedId: mail.bookingId,
          createdAt: mail.at,
        },
      });
    }

    // ── Customers who asked for a time and left without booking (keeps conversion honest).
    for (let i = 0; i < 38; i++) {
      const service = pick(bookable);
      const opener = pick(service.seed.openers!);
      const startedAt = new Date(now.getTime() - between(1, 44 * 24) * HOUR);
      const offeredDay = formatInZone(new Date(startedAt.getTime() + 26 * HOUR), TZ, 'EEEE d MMMM');
      await conversationWithMessages(scope, {
        startedAt,
        customerId: null,
        status: chance(0.6) ? 'RESOLVED' : 'OPEN',
        assistantActive: true,
        hadBookingIntent: true,
        messages: [
          {
            author: 'ASSISTANT',
            body: 'Hi! I’m the automated assistant for Eik & Kant. I can book you in, answer questions about prices and opening hours, or pass you to someone at the workshop.',
            gapMinutes: 0,
          },
          { author: 'CUSTOMER', body: opener, understanding: understand(opener, startedAt) },
          {
            author: 'ASSISTANT',
            body: `Here are the next free times for ${service.seed.name}:`,
            blocks: [
              {
                type: 'slot_options',
                days: [
                  {
                    label: offeredDay,
                    slots: [
                      { id: 's1', time: '10:00' },
                      { id: 's2', time: '14:30' },
                    ],
                  },
                ],
                canShowMore: true,
              },
            ],
          },
          ...(chance(0.35)
            ? [{ author: 'CUSTOMER' as const, body: 'Show me more times', gapMinutes: 1 }]
            : []),
        ],
      });
    }

    // ── Questions answered from the FAQ.
    for (let i = 0; i < 26; i++) {
      const item = pick(knowledge);
      const question = pick(item.askedAs);
      const startedAt = new Date(now.getTime() - between(1, 44 * 24) * HOUR - between(0, 50) * MIN);
      await conversationWithMessages(scope, {
        startedAt,
        customerId: null,
        status: 'RESOLVED',
        assistantActive: true,
        messages: [
          {
            author: 'ASSISTANT',
            body: 'Hi! I’m the automated assistant for Eik & Kant. I can book you in, answer questions about prices and opening hours, or pass you to someone at the workshop.',
            gapMinutes: 0,
          },
          { author: 'CUSTOMER', body: question, understanding: understand(question, startedAt) },
          {
            author: 'ASSISTANT',
            body: item.answer,
            blocks: [{ type: 'source', label: `From the FAQ: ${item.question}` }],
          },
          ...(chance(0.4)
            ? [
                {
                  author: 'CUSTOMER' as const,
                  body: 'Thanks!',
                  understanding: understand('Thanks!', startedAt),
                },
                { author: 'ASSISTANT' as const, body: 'You’re welcome! Anything else I can help with?' },
              ]
            : []),
        ],
      });
    }

    // ── Questions Relay could not answer: handed to a person.
    for (const [i, item] of UNANSWERED.entries()) {
      const recent = i < 3;
      const startedAt = recent
        ? new Date(now.getTime() - (i === 0 ? 40 : i === 1 ? 150 : 26 * 60) * MIN)
        : new Date(now.getTime() - between(3, 40) * 24 * HOUR);
      const customer = customers[(i * 7 + 3) % customers.length]!;
      const repliedBy = pick([members.jonas, members.ingrid]);
      const { conversation, endedAt } = await conversationWithMessages(scope, {
        startedAt,
        customerId: customer.id,
        status: recent ? 'NEEDS_HUMAN' : 'RESOLVED',
        assistantActive: false,
        handedOff: true,
        assigneeId: recent && i === 2 ? members.jonas.id : null,
        messages: [
          {
            author: 'ASSISTANT',
            body: 'Hi! I’m the automated assistant for Eik & Kant. I can book you in, answer questions about prices and opening hours, or pass you to someone at the workshop.',
            gapMinutes: 0,
          },
          { author: 'CUSTOMER', body: item.question, understanding: understand(item.question, startedAt) },
          {
            author: 'ASSISTANT',
            body: 'I don’t have a reliable answer to that, so I’ve passed your question to the team. Leave your email so they can reach you even if you close this window.',
            blocks: [
              { type: 'handoff_notice', replyWithinHours: 4 },
              { type: 'details_form', purpose: 'handoff', requirePhone: false, prefill: {} },
            ],
          },
          { author: 'CUSTOMER', body: 'Shared contact details', gapMinutes: 1 },
          {
            author: 'ASSISTANT',
            body: `Thanks, ${customer.name!.split(' ')[0]}. Someone from Eik & Kant will reply here, or by email to ${customer.email} if you’ve left.`,
          },
          ...(recent
            ? []
            : [
                {
                  author: 'STAFF' as const,
                  body: item.reply,
                  staffMembershipId: repliedBy.id,
                  gapMinutes: between(20, 200),
                },
              ]),
        ],
      });
      await audit(scope, new Date(startedAt.getTime() + MIN), {
        actorType: 'ASSISTANT',
        actorLabel: 'Relay assistant',
        action: 'conversation.handed_off',
        entityType: 'Conversation',
        entityId: conversation.id,
        metadata: { reason: 'unanswered_question' },
      });
      await automationRun(
        scope,
        automationRows.handoff,
        new Date(startedAt.getTime() + MIN),
        { conversationId: conversation.id },
        [
          { action: 'notify_team', status: 'succeeded', detail: 'Notified 3 team members.' },
          { action: 'create_task', status: 'succeeded', detail: 'Task created.' },
        ],
      );
      await db.task.create({
        data: {
          organizationId,
          title: `Reply to ${customer.name!.split(' ')[0]}`,
          kind: 'HANDOFF',
          dueAt: new Date(startedAt.getTime() + 4 * HOUR),
          conversationId: conversation.id,
          assigneeId: recent && i === 2 ? members.jonas.id : null,
          status: recent ? 'OPEN' : 'DONE',
          completedAt: recent ? null : endedAt,
          createdAt: new Date(startedAt.getTime() + MIN),
        },
      });
      if (recent) {
        for (const m of Object.values(members)) {
          await db.notification.create({
            data: {
              organizationId,
              membershipId: m.id,
              title: 'A customer is waiting for a reply',
              body: item.question,
              href: `/app/inbox/${conversation.id}`,
              createdAt: new Date(startedAt.getTime() + MIN),
            },
          });
        }
      } else {
        await audit(scope, endedAt, {
          actorType: 'USER',
          actorId: repliedBy.userId,
          actorLabel: repliedBy === members.jonas ? 'Jonas Haugen' : 'Ingrid Solberg',
          action: 'conversation.staff_replied',
          entityType: 'Conversation',
          entityId: conversation.id,
          metadata: { emailed: true },
        });
      }
    }

    // ── Quote requests → leads.
    const leadStatuses = ['NEW', 'NEW', 'CONTACTED', 'WON', 'LOST'] as const;
    for (const [i, quote] of QUOTES.entries()) {
      const startedAt = new Date(now.getTime() - (i === 0 ? 5 : i === 1 ? 30 : between(3, 30) * 24) * HOUR);
      const customer = customers[(i * 5 + 11) % customers.length]!;
      const service = services.get(quote.service)!;
      const { conversation, endedAt } = await conversationWithMessages(scope, {
        startedAt,
        customerId: customer.id,
        status: leadStatuses[i] === 'NEW' ? 'OPEN' : 'RESOLVED',
        assistantActive: true,
        messages: [
          {
            author: 'ASSISTANT',
            body: 'Hi! I’m the automated assistant for Eik & Kant. I can book you in, answer questions about prices and opening hours, or pass you to someone at the workshop.',
            gapMinutes: 0,
          },
          { author: 'CUSTOMER', body: quote.text, understanding: understand(quote.text, startedAt) },
          {
            author: 'ASSISTANT',
            body: `A ${service.seed.name.toLowerCase()} needs a look before it can be priced, so I’ll pass your request to the workshop for a quote. Where can they reach you?`,
            blocks: [{ type: 'details_form', purpose: 'quote', requirePhone: false, prefill: {} }],
          },
          { author: 'CUSTOMER', body: 'Shared contact details', gapMinutes: 2 },
          {
            author: 'ASSISTANT',
            body: `Thanks, ${customer.name!.split(' ')[0]}. I’ve sent your request to Eik & Kant — they usually get back to you within 4 hours, by email to ${customer.email}.`,
          },
        ],
      });
      const status = leadStatuses[i]!;
      const lead = await db.lead.create({
        data: {
          organizationId,
          customerId: customer.id,
          conversationId: conversation.id,
          serviceId: service.id,
          summary: quote.text,
          status,
          origin: 'CHAT',
          assigneeId: ingridM.id,
          closedAt:
            status === 'WON' || status === 'LOST' ? new Date(endedAt.getTime() + 2 * 24 * HOUR) : null,
          createdAt: endedAt,
        },
      });
      await audit(scope, endedAt, {
        actorType: 'ASSISTANT',
        actorLabel: 'Relay assistant',
        action: 'lead.created',
        entityType: 'Lead',
        entityId: lead.id,
        metadata: { origin: 'CHAT', serviceId: service.id },
      });
      const failed = i === 3;
      await automationRun(
        scope,
        automationRows.quotes,
        endedAt,
        { leadId: lead.id, conversationId: conversation.id },
        failed
          ? [
              { action: 'assign_to', status: 'succeeded', detail: 'Lead assigned.' },
              { action: 'create_task', status: 'failed', detail: 'Team member not found.' },
            ]
          : [
              { action: 'assign_to', status: 'succeeded', detail: 'Lead assigned.' },
              { action: 'create_task', status: 'succeeded', detail: 'Task created.' },
            ],
        failed ? 'Team member not found.' : null,
      );
      if (!failed) {
        await db.task.create({
          data: {
            organizationId,
            title: `Send a quote to ${customer.name!.split(' ')[0]}`,
            kind: 'FOLLOW_UP',
            assigneeId: ingridM.id,
            leadId: lead.id,
            conversationId: conversation.id,
            dueAt: new Date(endedAt.getTime() + 24 * HOUR),
            status: status === 'NEW' ? 'OPEN' : 'DONE',
            completedAt: status === 'NEW' ? null : new Date(endedAt.getTime() + 20 * HOUR),
            createdAt: endedAt,
          },
        });
      }
      if (status !== 'NEW') {
        await audit(scope, new Date(endedAt.getTime() + 20 * HOUR), {
          actorType: 'USER',
          actorId: users.get('ingrid@eikogkant.example')!.id,
          actorLabel: 'Ingrid Solberg',
          action: 'lead.status_changed',
          entityType: 'Lead',
          entityId: lead.id,
          metadata: { from: 'NEW', to: status },
        });
      }
    }

    // ── A simulated inbound email, answered by a person.
    const emailCustomer = customers[20]!;
    const emailAt = new Date(now.getTime() - 2 * 24 * HOUR);
    const { conversation: emailConversation } = await conversationWithMessages(scope, {
      startedAt: emailAt,
      customerId: emailCustomer.id,
      channel: 'EMAIL',
      subject: 'Gears slipping on my commuter',
      status: 'RESOLVED',
      assistantActive: false,
      handedOff: true,
      messages: [
        {
          author: 'CUSTOMER',
          body: 'Hi, the gears on my commuter bike keep slipping on the hills. Is that something you can fix quickly, and roughly what does it cost?\n\nFrida',
          gapMinutes: 0,
          understanding: understand(
            'the gears on my commuter bike keep slipping on the hills. Is that something you can fix quickly, and roughly what does it cost?',
            emailAt,
          ),
        },
        {
          author: 'STAFF',
          body: 'Hi Frida, that’s usually a worn chain or a cable that needs adjusting — a standard service (1 190 kr) sorts it, often the same day. You can book a time on our page.\n\nJonas',
          staffMembershipId: jonasM.id,
          gapMinutes: 95,
        },
      ],
    });
    await db.outboundEmail.create({
      data: {
        organizationId,
        toAddress: emailCustomer.email!,
        subject: 'Re: Gears slipping on my commuter',
        textBody:
          'Hi Frida, that’s usually a worn chain or a cable that needs adjusting — a standard service (1 190 kr) sorts it, often the same day. You can book a time on our page.\n\n— Jonas, Eik & Kant',
        provider: 'demo-outbox',
        status: 'STORED_IN_OUTBOX',
        relatedType: 'Conversation',
        relatedId: emailConversation.id,
        createdAt: new Date(emailAt.getTime() + 96 * MIN),
      },
    });

    // ── A pending invite and settings history.
    const inviteToken = generateToken();
    const invite = await db.invite.create({
      data: {
        organizationId,
        email: 'petter@eikogkant.example',
        role: 'STAFF',
        tokenHash: hashToken(inviteToken),
        invitedById: ingridM.id,
        expiresAt: new Date(now.getTime() + 5 * 24 * HOUR),
        createdAt: new Date(now.getTime() - 2 * 24 * HOUR),
      },
    });
    await db.outboundEmail.create({
      data: {
        organizationId,
        toAddress: 'petter@eikogkant.example',
        subject: 'Ingrid Solberg invited you to Eik & Kant on Relay',
        textBody: `Hi,\n\nIngrid Solberg has invited you to join Eik & Kant on Relay as staff.\n\nAccept the invitation: ${process.env.APP_URL}/invite/${inviteToken}\n\nThe link expires in 7 days. If you were not expecting this, you can ignore this email.`,
        provider: 'demo-outbox',
        status: 'STORED_IN_OUTBOX',
        relatedType: 'Invite',
        relatedId: invite.id,
        createdAt: invite.createdAt,
      },
    });
    await audit(scope, invite.createdAt, {
      actorType: 'USER',
      actorId: users.get('ingrid@eikogkant.example')!.id,
      actorLabel: 'Ingrid Solberg',
      action: 'invite.created',
      entityType: 'Invite',
      entityId: invite.id,
      metadata: { role: 'STAFF' },
    });
    await audit(scope, new Date(now.getTime() - 12 * 24 * HOUR), {
      actorType: 'USER',
      actorId: users.get('amina@eikogkant.example')!.id,
      actorLabel: 'Amina Berg',
      action: 'settings.booking_policy_updated',
      entityType: 'Organization',
      entityId: org.id,
      metadata: { minNoticeMinutes: 60, cancellationWindowHours: 24 },
    });
    await audit(scope, new Date(now.getTime() - 20 * 24 * HOUR), {
      actorType: 'USER',
      actorId: users.get('amina@eikogkant.example')!.id,
      actorLabel: 'Amina Berg',
      action: 'automation.disabled',
      entityType: 'Automation',
      entityId: automationRows.emailHandoff.id,
    });

    console.log(
      `  ${bookingsCreated} bookings, ${customers.length} customers, ${KNOWLEDGE.length} FAQs, ${Object.keys(automationRows).length} automations`,
    );
  });
}

async function automationRun(
  scope: Scope,
  automation: { id: string; name: string; trigger: string },
  at: Date,
  links: { conversationId?: string | null; bookingId?: string | null; leadId?: string | null },
  steps: { action: string; status: 'succeeded' | 'skipped' | 'failed'; detail: string }[],
  error: string | null = null,
) {
  const run = await scope.db.automationRun.create({
    data: {
      organizationId: scope.organizationId,
      automationId: automation.id,
      eventId: crypto.randomUUID(),
      trigger: automation.trigger as AutomationTrigger,
      status: error ? 'FAILED' : 'SUCCEEDED',
      steps,
      error,
      conversationId: links.conversationId ?? null,
      bookingId: links.bookingId ?? null,
      leadId: links.leadId ?? null,
      startedAt: new Date(at.getTime() + 2000),
      finishedAt: new Date(at.getTime() + 2400),
    },
  });
  await audit(scope, new Date(at.getTime() + 2400), {
    actorType: 'AUTOMATION',
    actorId: automation.id,
    actorLabel: `Automation: ${automation.name}`,
    action: 'automation.run',
    entityType: 'Automation',
    entityId: automation.id,
    result: error ? 'FAILURE' : 'SUCCESS',
    metadata: { runId: run.id, trigger: automation.trigger, steps: steps.length },
  });
}

async function seedSalon(users: Map<string, { id: string; name: string }>) {
  console.log('Creating Bakgården Frisør…');
  await transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        slug: 'bakgarden-frisor',
        name: 'Bakgården Frisør',
        tagline: 'A small hair salon in a Grünerløkka backyard',
        description:
          'Cuts, colour and beard trims. Fictional business used to show that businesses on Relay never see each other’s data.',
        city: 'Oslo',
        addressLine: 'Grünerløkka',
        contactEmail: 'hei@bakgarden.example',
        openingHours: [2, 3, 4, 5]
          .map((weekday) => ({ weekday, opens: 600, closes: 1080 }))
          .concat([{ weekday: 6, opens: 600, closes: 840 }]),
        isDemo: true,
      },
    });
    const scope = await enterTenant(tx, org.id);
    const { db, organizationId } = scope;
    const owner = await tx.membership.create({
      data: { organizationId, userId: users.get('sofie@bakgarden.example')!.id, role: 'OWNER' },
    });
    const sofie = await db.staffMember.create({
      data: { organizationId, displayName: 'Sofie Lund', title: 'Hairdresser', membershipId: owner.id },
    });
    await db.workingHours.createMany({
      data: [2, 3, 4, 5]
        .map((weekday) => ({
          organizationId,
          staffMemberId: sofie.id,
          weekday,
          startMinute: 600,
          endMinute: 1080,
        }))
        .concat([{ organizationId, staffMemberId: sofie.id, weekday: 6, startMinute: 600, endMinute: 840 }]),
    });
    const cut = await db.service.create({
      data: {
        organizationId,
        name: 'Haircut',
        description: 'Wash, cut and finish.',
        durationMinutes: 45,
        priceMinor: 69000,
        keywords: ['haircut', 'cut', 'trim', 'klipp'],
      },
    });
    const colour = await db.service.create({
      data: {
        organizationId,
        name: 'Colour',
        description: 'Full colour or highlights.',
        durationMinutes: 120,
        priceMinor: 149000,
        priceIsFrom: true,
        keywords: ['colour', 'color', 'highlights', 'farge'],
      },
    });
    const beard = await db.service.create({
      data: {
        organizationId,
        name: 'Beard trim',
        durationMinutes: 30,
        priceMinor: 39000,
        keywords: ['beard', 'skjegg'],
      },
    });
    for (const service of [cut, colour, beard]) {
      await db.staffService.create({
        data: { organizationId, staffMemberId: sofie.id, serviceId: service.id },
      });
    }
    for (const definition of defaultAutomations()) {
      await db.automation.create({
        data: {
          organizationId,
          name: definition.name,
          description: definition.description,
          trigger: definition.trigger,
          conditions: definition.conditions,
          actions: definition.actions,
          createdByMembershipId: owner.id,
        },
      });
    }
    const names = ['Marte Solli', 'Kristoffer Aasen', 'Linnea Wold'];
    for (const [i, name] of names.entries()) {
      const customer = await db.customer.create({ data: { organizationId, name, email: emailFor(name, 0) } });
      let date = addDays(today, i + 1);
      while (isoWeekday(date) === 1 || isoWeekday(date) === 7) date = addDays(date, 1);
      await db.booking.create({
        data: {
          organizationId,
          reference: generateReference('BF'),
          serviceId: i === 1 ? colour.id : cut.id,
          staffMemberId: sofie.id,
          customerId: customer.id,
          startsAt: zonedTimeToUtc(date, 660 + i * 60, TZ),
          endsAt: zonedTimeToUtc(date, 660 + i * 60 + (i === 1 ? 120 : 45), TZ),
          status: 'CONFIRMED',
          origin: 'DASHBOARD',
          createdByMembershipId: owner.id,
        },
      });
    }
    await audit(scope, org.createdAt, {
      actorType: 'USER',
      actorId: users.get('sofie@bakgarden.example')!.id,
      actorLabel: 'Sofie Lund',
      action: 'organization.created',
      entityType: 'Organization',
      entityId: org.id,
      metadata: { slug: org.slug },
    });
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
