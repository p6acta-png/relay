import 'server-only';
import { z } from 'zod';
import { enterTenant, postgresErrorCode, PG_UNIQUE_VIOLATION, prisma, transaction } from '@/lib/db';
import { AppError, fieldErrorsFrom } from '@/lib/errors';
import { timeToMinutes } from '@/lib/time';
import { recordAudit } from '@/modules/audit/audit';
import { emailSchema } from '@/modules/auth/schemas';
import type { SessionUser } from '@/modules/auth/sessions';
import { defaultAutomations } from '@/modules/automations/defaults';
import type { OpeningHours } from '@/modules/catalog/opening-hours';

const RESERVED_SLUGS = new Set([
  'app',
  'api',
  'admin',
  'learn',
  'login',
  'signup',
  'relay',
  'www',
  'demo',
  'static',
]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'Use 3–40 lowercase letters, numbers and dashes.')
  .refine((slug) => !RESERVED_SLUGS.has(slug), 'This address is reserved. Choose another.');

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, e.g. 08:00.');

export const onboardingSchema = z
  .object({
    businessName: z.string().trim().min(2, 'Enter your business name.').max(80),
    slug: slugSchema,
    city: z.string().trim().max(60).optional().default(''),
    contactEmail: z
      .union([z.literal(''), emailSchema])
      .optional()
      .default(''),
    weekdayOpens: time,
    weekdayCloses: time,
    saturdayOpen: z.enum(['yes', 'no']).default('no'),
    saturdayOpens: time.optional().or(z.literal('')),
    saturdayCloses: time.optional().or(z.literal('')),
    serviceName: z.string().trim().min(2, 'Name your first service.').max(80),
    serviceDurationMinutes: z.coerce
      .number()
      .int()
      .min(15, 'At least 15 minutes.')
      .max(480, 'At most 8 hours.'),
    servicePriceNok: z.coerce.number().min(0).max(1_000_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (timeToMinutes(value.weekdayCloses) <= timeToMinutes(value.weekdayOpens)) {
      ctx.addIssue({
        code: 'custom',
        path: ['weekdayCloses'],
        message: 'Closing time must be after opening time.',
      });
    }
    if (value.saturdayOpen === 'yes') {
      if (!value.saturdayOpens || !value.saturdayCloses) {
        ctx.addIssue({ code: 'custom', path: ['saturdayOpens'], message: 'Enter Saturday hours.' });
      } else if (timeToMinutes(value.saturdayCloses) <= timeToMinutes(value.saturdayOpens)) {
        ctx.addIssue({
          code: 'custom',
          path: ['saturdayCloses'],
          message: 'Closing time must be after opening time.',
        });
      }
    }
  });

export type OnboardingInput = z.input<typeof onboardingSchema>;

/**
 * Creates a business with its owner, a bookable staff profile for the owner, opening hours and
 * a first service — so the chat can take bookings the moment setup is finished.
 * Everything happens in one transaction: either the whole business exists, or none of it does.
 */
export async function createOrganizationForOwner(user: SessionUser, input: OnboardingInput) {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues));
  }
  const data = parsed.data;

  const openingHours: OpeningHours = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    opens: timeToMinutes(data.weekdayOpens),
    closes: timeToMinutes(data.weekdayCloses),
  }));
  if (data.saturdayOpen === 'yes' && data.saturdayOpens && data.saturdayCloses) {
    openingHours.push({
      weekday: 6,
      opens: timeToMinutes(data.saturdayOpens),
      closes: timeToMinutes(data.saturdayCloses),
    });
  }

  try {
    return await transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: data.businessName,
          slug: data.slug,
          city: data.city || null,
          contactEmail: data.contactEmail || null,
          openingHours,
        },
      });
      const membership = await tx.membership.create({
        data: { organizationId: organization.id, userId: user.id, role: 'OWNER' },
      });

      const scope = await enterTenant(tx, organization.id);
      const staff = await scope.db.staffMember.create({
        data: { organizationId: organization.id, displayName: user.name, membershipId: membership.id },
      });
      await scope.db.workingHours.createMany({
        data: openingHours.map((range) => ({
          organizationId: organization.id,
          staffMemberId: staff.id,
          weekday: range.weekday,
          startMinute: range.opens,
          endMinute: range.closes,
        })),
      });
      const service = await scope.db.service.create({
        data: {
          organizationId: organization.id,
          name: data.serviceName,
          durationMinutes: data.serviceDurationMinutes,
          priceMinor: data.servicePriceNok === undefined ? null : Math.round(data.servicePriceNok * 100),
        },
      });
      await scope.db.staffService.create({
        data: { organizationId: organization.id, staffMemberId: staff.id, serviceId: service.id },
      });
      await scope.db.automation.createMany({
        data: defaultAutomations().map((definition) => ({
          organizationId: organization.id,
          name: definition.name,
          description: definition.description || null,
          trigger: definition.trigger,
          conditions: definition.conditions,
          actions: definition.actions,
          enabled: definition.enabled,
          createdByMembershipId: membership.id,
        })),
      });
      await recordAudit(scope, {
        actor: { type: 'USER', id: user.id, label: user.name },
        action: 'organization.created',
        entityType: 'Organization',
        entityId: organization.id,
        metadata: { slug: organization.slug },
      });
      return { organization, membership };
    });
  } catch (error) {
    if (postgresErrorCode(error) === PG_UNIQUE_VIOLATION) {
      throw new AppError('CONFLICT', 'That web address is already taken.', {
        slug: 'That address is already taken.',
      });
    }
    throw error;
  }
}

export async function listMembershipsForUser(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      organization: { select: { id: true, name: true, slug: true, timezone: true } },
    },
  });
}

/** Public business profile for the customer-facing site. Only fields safe to show publicly. */
export async function getPublicOrganization(slug: string) {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return null;
  return prisma.organization.findUnique({
    where: { slug: parsed.data },
    select: {
      id: true,
      slug: true,
      name: true,
      tagline: true,
      description: true,
      timezone: true,
      currency: true,
      contactEmail: true,
      contactPhone: true,
      addressLine: true,
      city: true,
      openingHours: true,
      cancellationWindowHours: true,
      handoffReplyHours: true,
      isDemo: true,
    },
  });
}

export type PublicOrganization = NonNullable<Awaited<ReturnType<typeof getPublicOrganization>>>;
