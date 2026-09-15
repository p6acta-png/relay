import 'server-only';
import { z } from 'zod';
import { PG_UNIQUE_VIOLATION, postgresErrorCode, type TenantScope } from '@/lib/db';
import { AppError, fieldErrorsFrom } from '@/lib/errors';
import { recordAudit } from '@/modules/audit/audit';
import { emailSchema } from '@/modules/auth/schemas';
import { actorOf, authorizeIn, type ActorContext } from '@/modules/tenancy/context';
import { openingHoursSchema } from './opening-hours';

/**
 * Setup: everything a business configures and Relay uses — profile, booking rules, services,
 * staff and their hours, time off and the knowledge base. Owners and admins may change it;
 * staff can read it.
 */

function parse<T extends z.ZodType>(
  schema: T,
  input: unknown,
  message = 'Check the highlighted fields.',
): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError('VALIDATION', message, fieldErrorsFrom(result.error.issues));
  return result.data;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

// ─── Business profile & booking rules ───────────────────────────────────────

export const businessSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Enter the business name.').max(80),
  tagline: optionalText(120),
  description: optionalText(600),
  contactEmail: z.union([z.literal(''), emailSchema]).transform((v) => v || null),
  contactPhone: optionalText(30),
  addressLine: optionalText(120),
  city: optionalText(60),
  openingHours: openingHoursSchema,
  minNoticeMinutes: z.coerce.number().int().min(0).max(10080),
  bookingHorizonDays: z.coerce.number().int().min(1, 'At least 1 day.').max(365),
  cancellationWindowHours: z.coerce.number().int().min(0).max(336),
  slotIntervalMinutes: z.coerce.number().pipe(z.union([z.literal(15), z.literal(30), z.literal(60)])),
  handoffReplyHours: z.coerce.number().int().min(1).max(168),
});

export async function getBusinessSettings(scope: TenantScope, ctx: ActorContext) {
  authorizeIn(scope, ctx, 'setup.view');
  return scope.db.organization.findUniqueOrThrow({ where: { id: scope.organizationId } });
}

// #region learn:update-settings
export async function updateBusinessSettings(scope: TenantScope, ctx: ActorContext, input: unknown) {
  authorizeIn(scope, ctx, 'setup.manage');
  const data = parse(businessSettingsSchema, input);
  const before = await scope.db.organization.findUniqueOrThrow({ where: { id: scope.organizationId } });
  await scope.db.organization.update({ where: { id: scope.organizationId }, data });

  // Record which settings changed (names and rule values only, never free text).
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(data[key]),
  );
  if (changed.length) {
    await recordAudit(scope, {
      actor: actorOf(ctx),
      action: 'settings.business_updated',
      entityType: 'Organization',
      entityId: scope.organizationId,
      metadata: {
        changed,
        minNoticeMinutes: data.minNoticeMinutes,
        cancellationWindowHours: data.cancellationWindowHours,
        bookingHorizonDays: data.bookingHorizonDays,
      },
    });
  }
}
// #endregion learn:update-settings

// ─── Services ───────────────────────────────────────────────────────────────

export const serviceSchema = z
  .object({
    name: z.string().trim().min(2, 'Name the service.').max(80),
    description: z.string().trim().max(400).default(''),
    kind: z.enum(['BOOKABLE', 'QUOTE']),
    durationMinutes: z.coerce.number().int().min(5).max(480).nullable(),
    priceNok: z
      .union([z.literal('').transform(() => null), z.coerce.number().min(0).max(1_000_000)])
      .nullable(),
    priceIsFrom: z.boolean().default(false),
    confirmationMode: z.enum(['INSTANT', 'APPROVAL']),
    keywords: z
      .string()
      .max(500)
      .transform((v) =>
        [
          ...new Set(
            v
              .split(',')
              .map((k) => k.trim().toLowerCase())
              .filter(Boolean),
          ),
        ].slice(0, 20),
      ),
    active: z.boolean().default(true),
    staffIds: z.array(z.uuid()).max(50).default([]),
  })
  .superRefine((value, issue) => {
    if (value.kind === 'BOOKABLE' && !value.durationMinutes) {
      issue.addIssue({
        code: 'custom',
        path: ['durationMinutes'],
        message: 'Bookable services need a duration.',
      });
    }
    if (value.kind === 'BOOKABLE' && value.active && value.staffIds.length === 0) {
      issue.addIssue({
        code: 'custom',
        path: ['staffIds'],
        message: 'Choose who can do this service, or it can’t be booked.',
      });
    }
  });

export async function listServices(scope: TenantScope, ctx: ActorContext) {
  authorizeIn(scope, ctx, 'setup.view');
  return scope.db.service.findMany({
    where: { organizationId: scope.organizationId },
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { staff: { select: { staffMemberId: true } }, _count: { select: { bookings: true } } },
  });
}

export async function saveService(scope: TenantScope, ctx: ActorContext, id: string | null, input: unknown) {
  authorizeIn(scope, ctx, 'setup.manage');
  const data = parse(serviceSchema, input);
  const { db, organizationId } = scope;
  const staff = await db.staffMember.count({ where: { organizationId, id: { in: data.staffIds } } });
  if (staff !== data.staffIds.length)
    throw new AppError('VALIDATION', 'One of the chosen staff members no longer exists.');

  const values = {
    name: data.name,
    description: data.description,
    kind: data.kind,
    durationMinutes: data.kind === 'BOOKABLE' ? data.durationMinutes : null,
    priceMinor: data.priceNok === null ? null : Math.round(data.priceNok * 100),
    priceIsFrom: data.priceIsFrom,
    confirmationMode: data.confirmationMode,
    keywords: data.keywords,
    active: data.active,
  };
  let serviceId = id;
  try {
    if (id) {
      const { count } = await db.service.updateMany({ where: { id, organizationId }, data: values });
      if (count === 0) throw new AppError('NOT_FOUND', 'Service not found.');
    } else {
      const last = await db.service.aggregate({ where: { organizationId }, _max: { sortOrder: true } });
      serviceId = (
        await db.service.create({
          data: { ...values, organizationId, sortOrder: (last._max.sortOrder ?? 0) + 1 },
        })
      ).id;
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (postgresErrorCode(error) === PG_UNIQUE_VIOLATION) {
      throw new AppError('CONFLICT', 'A service with that name already exists.', {
        name: 'Choose another name.',
      });
    }
    throw error;
  }

  await db.staffService.deleteMany({ where: { organizationId, serviceId: serviceId! } });
  if (data.kind === 'BOOKABLE' && data.staffIds.length) {
    await db.staffService.createMany({
      data: data.staffIds.map((staffMemberId) => ({ organizationId, staffMemberId, serviceId: serviceId! })),
    });
  }
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: id ? 'settings.service_updated' : 'settings.service_created',
    entityType: 'Service',
    entityId: serviceId,
    metadata: {
      kind: data.kind,
      active: data.active,
      confirmationMode: data.confirmationMode,
      staff: data.staffIds.length,
    },
  });
  return { id: serviceId! };
}

// ─── Staff & working hours ──────────────────────────────────────────────────

const minuteOfDay = z.coerce.number().int().min(0).max(1440);

export const staffSchema = z.object({
  displayName: z.string().trim().min(2, 'Enter a name.').max(80),
  title: optionalText(80),
  active: z.boolean().default(true),
  membershipId: z.union([z.literal(''), z.uuid()]).transform((v) => v || null),
  hours: z
    .array(
      z
        .object({
          weekday: z.coerce.number().int().min(1).max(7),
          startMinute: minuteOfDay,
          endMinute: minuteOfDay,
        })
        .refine((h) => h.endMinute > h.startMinute, 'Finish time must be after start time.'),
    )
    .max(21),
});

export async function listStaff(scope: TenantScope, ctx: ActorContext) {
  authorizeIn(scope, ctx, 'setup.view');
  return scope.db.staffMember.findMany({
    where: { organizationId: scope.organizationId },
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { displayName: 'asc' }],
    include: {
      workingHours: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
      services: { select: { service: { select: { id: true, name: true } } } },
      membership: { select: { id: true, role: true } },
    },
  });
}

export async function saveStaffMember(
  scope: TenantScope,
  ctx: ActorContext,
  id: string | null,
  input: unknown,
) {
  authorizeIn(scope, ctx, 'setup.manage');
  const data = parse(staffSchema, input);
  const { db, organizationId } = scope;
  if (data.membershipId) {
    const member = await db.membership.findFirst({ where: { id: data.membershipId, organizationId } });
    if (!member) throw new AppError('VALIDATION', 'That team member is not part of this business.');
    const linked = await db.staffMember.findFirst({
      where: { organizationId, membershipId: data.membershipId, ...(id ? { id: { not: id } } : {}) },
    });
    if (linked) {
      throw new AppError('VALIDATION', 'Check the highlighted fields.', {
        membershipId: `That login already belongs to ${linked.displayName}.`,
      });
    }
  }
  const values = {
    displayName: data.displayName,
    title: data.title,
    active: data.active,
    membershipId: data.membershipId,
  };
  let staffId = id;
  if (id) {
    const { count } = await db.staffMember.updateMany({ where: { id, organizationId }, data: values });
    if (count === 0) throw new AppError('NOT_FOUND', 'Staff member not found.');
  } else {
    const last = await db.staffMember.aggregate({ where: { organizationId }, _max: { sortOrder: true } });
    staffId = (
      await db.staffMember.create({
        data: { ...values, organizationId, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      })
    ).id;
  }
  // Replace the weekly hours as a whole: simpler to reason about than patching individual ranges.
  await db.workingHours.deleteMany({ where: { organizationId, staffMemberId: staffId! } });
  if (data.hours.length) {
    await db.workingHours.createMany({
      data: data.hours.map((h) => ({ ...h, organizationId, staffMemberId: staffId! })),
    });
  }
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: id ? 'settings.staff_updated' : 'settings.staff_created',
    entityType: 'StaffMember',
    entityId: staffId,
    metadata: { active: data.active, weeklyRanges: data.hours.length },
  });
  return { id: staffId! };
}

// ─── Time off ───────────────────────────────────────────────────────────────

export const timeOffSchema = z
  .object({
    staffMemberId: z.union([z.literal(''), z.uuid()]).transform((v) => v || null),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: optionalText(120),
  })
  .refine((v) => v.endsAt > v.startsAt, { path: ['endsAt'], message: 'The end must be after the start.' });

export async function listTimeOff(scope: TenantScope, ctx: ActorContext, from: Date) {
  authorizeIn(scope, ctx, 'setup.view');
  return scope.db.timeOff.findMany({
    where: { organizationId: scope.organizationId, endsAt: { gte: from } },
    orderBy: { startsAt: 'asc' },
    include: { staffMember: { select: { displayName: true } } },
  });
}

export async function addTimeOff(scope: TenantScope, ctx: ActorContext, input: unknown) {
  authorizeIn(scope, ctx, 'setup.manage');
  const data = parse(timeOffSchema, input);
  if (data.staffMemberId) {
    const staff = await scope.db.staffMember.findFirst({
      where: { id: data.staffMemberId, organizationId: scope.organizationId },
    });
    if (!staff) throw new AppError('VALIDATION', 'Staff member not found.');
  }
  // Existing bookings are not cancelled automatically — the page lists the ones that now clash.
  const created = await scope.db.timeOff.create({ data: { ...data, organizationId: scope.organizationId } });
  const clashes = await scope.db.booking.count({
    where: {
      organizationId: scope.organizationId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      startsAt: { lt: data.endsAt },
      endsAt: { gt: data.startsAt },
      ...(data.staffMemberId ? { staffMemberId: data.staffMemberId } : {}),
    },
  });
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'settings.time_off_added',
    entityType: 'TimeOff',
    entityId: created.id,
    metadata: { wholeBusiness: !data.staffMemberId, clashingBookings: clashes },
  });
  return { id: created.id, clashes };
}

export async function removeTimeOff(scope: TenantScope, ctx: ActorContext, id: string) {
  authorizeIn(scope, ctx, 'setup.manage');
  const { count } = await scope.db.timeOff.deleteMany({
    where: { id, organizationId: scope.organizationId },
  });
  if (count === 0) throw new AppError('NOT_FOUND', 'Time off not found.');
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'settings.time_off_removed',
    entityType: 'TimeOff',
    entityId: id,
  });
}

// ─── Knowledge base ─────────────────────────────────────────────────────────

export const knowledgeSchema = z.object({
  question: z.string().trim().min(5, 'Write the question as a customer would ask it.').max(200),
  answer: z.string().trim().min(5, 'Write the answer.').max(1500),
  keywords: z
    .string()
    .max(500)
    .transform((v) =>
      [
        ...new Set(
          v
            .split(',')
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean),
        ),
      ].slice(0, 20),
    ),
  published: z.boolean().default(true),
});

export async function listKnowledge(scope: TenantScope, ctx: ActorContext) {
  authorizeIn(scope, ctx, 'setup.view');
  return scope.db.knowledgeItem.findMany({
    where: { organizationId: scope.organizationId },
    orderBy: [{ published: 'desc' }, { sortOrder: 'asc' }],
  });
}

export async function saveKnowledgeItem(
  scope: TenantScope,
  ctx: ActorContext,
  id: string | null,
  input: unknown,
) {
  authorizeIn(scope, ctx, 'setup.manage');
  const data = parse(knowledgeSchema, input);
  if (data.published && data.keywords.length === 0) {
    throw new AppError('VALIDATION', 'Check the highlighted fields.', {
      keywords: 'Add a few words customers use, so Relay can find this answer.',
    });
  }
  const { db, organizationId } = scope;
  let itemId = id;
  if (id) {
    const { count } = await db.knowledgeItem.updateMany({ where: { id, organizationId }, data });
    if (count === 0) throw new AppError('NOT_FOUND', 'Answer not found.');
  } else {
    const last = await db.knowledgeItem.aggregate({ where: { organizationId }, _max: { sortOrder: true } });
    itemId = (
      await db.knowledgeItem.create({
        data: { ...data, organizationId, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      })
    ).id;
  }
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: id ? 'settings.knowledge_updated' : 'settings.knowledge_created',
    entityType: 'KnowledgeItem',
    entityId: itemId,
    metadata: { published: data.published, keywords: data.keywords.length },
  });
  return { id: itemId! };
}

export async function deleteKnowledgeItem(scope: TenantScope, ctx: ActorContext, id: string) {
  authorizeIn(scope, ctx, 'setup.manage');
  const { count } = await scope.db.knowledgeItem.deleteMany({
    where: { id, organizationId: scope.organizationId },
  });
  if (count === 0) throw new AppError('NOT_FOUND', 'Answer not found.');
  await recordAudit(scope, {
    actor: actorOf(ctx),
    action: 'settings.knowledge_deleted',
    entityType: 'KnowledgeItem',
    entityId: id,
  });
}
