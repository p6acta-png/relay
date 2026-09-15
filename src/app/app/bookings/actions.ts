'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withTenant } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { formatInZone } from '@/lib/time';
import { runAutomations } from '@/modules/automations/engine';
import type { DomainEvent } from '@/modules/events';
import { findSlotsForService } from '@/modules/scheduling/availability';
import {
  cancelBooking,
  createBooking,
  decideBooking,
  rescheduleBooking,
} from '@/modules/scheduling/bookings';
import { authorize } from '@/modules/tenancy/context';
import { field, runAction, type ActionResult } from '@/server/actions';
import { requireMember } from '@/server/context';

export interface SlotChoice {
  startsAt: string;
  time: string;
  staff: { id: string; name: string }[];
}

const slotQuerySchema = z.object({
  serviceId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  excludeBookingId: z.uuid().optional(),
});

/** Free times for one service on one day, for the staff booking and reschedule forms. */
export async function findSlotsAction(
  query: z.input<typeof slotQuerySchema>,
): Promise<{ ok: true; slots: SlotChoice[] } | { ok: false; message: string }> {
  const ctx = await requireMember();
  const parsed = slotQuerySchema.safeParse(query);
  if (!parsed.success) return { ok: false, message: 'Choose a service and a date.' };
  try {
    authorize(ctx, parsed.data.excludeBookingId ? 'bookings.reschedule' : 'bookings.create');
    return await withTenant(ctx.organizationId, async (scope) => {
      const { slots, timeZone } = await findSlotsForService(scope, {
        serviceId: parsed.data.serviceId,
        from: parsed.data.date,
        to: parsed.data.date,
        excludeBookingId: parsed.data.excludeBookingId,
      });
      const staff = await scope.db.staffMember.findMany({
        where: { organizationId: scope.organizationId },
        select: { id: true, displayName: true },
      });
      const names = new Map(staff.map((s) => [s.id, s.displayName]));
      return {
        ok: true as const,
        slots: slots.map((slot) => ({
          startsAt: slot.startsAt.toISOString(),
          time: formatInZone(slot.startsAt, timeZone, 'HH:mm'),
          staff: slot.alternatives.map((id) => ({ id, name: names.get(id) ?? 'Staff' })),
        })),
      };
    });
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function createBookingAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    'bookings.create',
    async () => {
      const ctx = await requireMember('bookings.create');
      const { result, events } = await withTenant(ctx.organizationId, (scope) =>
        createBooking(scope, ctx, {
          serviceId: field(form, 'serviceId'),
          startsAt: field(form, 'startsAt'),
          staffMemberId: field(form, 'staffMemberId') || undefined,
          customer: { name: field(form, 'name'), email: field(form, 'email'), phone: field(form, 'phone') },
          notes: field(form, 'notes') || undefined,
          origin: 'DASHBOARD',
        }),
      );
      await runAutomations(events);
      revalidatePath('/app', 'layout');
      redirect(`/app/bookings/${result.booking.id}?created=1`);
    },
    { form },
  );
}

async function afterChange(bookingId: string, events: DomainEvent[]) {
  await runAutomations(events);
  revalidatePath(`/app/bookings/${bookingId}`);
  revalidatePath('/app', 'layout');
}

export async function decideBookingAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction('bookings.decide', async () => {
    const ctx = await requireMember('bookings.decide');
    const bookingId = field(form, 'bookingId');
    const decision = field(form, 'decision') === 'APPROVE' ? 'APPROVE' : 'DECLINE';
    const { events } = await withTenant(ctx.organizationId, (scope) =>
      decideBooking(scope, ctx, { bookingId, decision, reason: field(form, 'reason') }),
    );
    await afterChange(bookingId, events);
    return {
      ok: true,
      message: decision === 'APPROVE' ? 'Approved. The customer will be notified.' : 'Declined.',
    };
  });
}

export async function cancelBookingAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction('bookings.cancel', async () => {
    const ctx = await requireMember('bookings.cancel');
    const bookingId = field(form, 'bookingId');
    const { events } = await withTenant(ctx.organizationId, (scope) =>
      cancelBooking(scope, ctx, { bookingId, reason: field(form, 'reason') }),
    );
    await afterChange(bookingId, events);
    return { ok: true, message: 'Booking cancelled. The time is free again.' };
  });
}

export async function rescheduleBookingAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction('bookings.reschedule', async () => {
    const ctx = await requireMember('bookings.reschedule');
    const bookingId = field(form, 'bookingId');
    const startsAt = new Date(field(form, 'startsAt'));
    if (Number.isNaN(startsAt.getTime())) throw new AppError('VALIDATION', 'Choose a new time.');
    await withTenant(ctx.organizationId, (scope) =>
      rescheduleBooking(scope, ctx, {
        bookingId,
        startsAt,
        staffMemberId: field(form, 'staffMemberId') || undefined,
      }),
    );
    await afterChange(bookingId, []);
    return { ok: true, message: 'Booking moved.' };
  });
}
