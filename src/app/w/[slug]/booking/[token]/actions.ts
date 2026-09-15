'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { runAutomations } from '@/modules/automations/engine';
import type { DomainEvent } from '@/modules/events';
import { enforceRateLimit, RATE_LIMITS, rateLimitSubject } from '@/modules/protection/rate-limit';
import { cancelBooking, findBookingByManageToken } from '@/modules/scheduling/bookings';
import { getPublicOrganization } from '@/modules/tenancy/organizations';
import { field, runAction, type ActionResult } from '@/server/actions';
import { clientIp } from '@/server/request';

/**
 * Customer self-service cancellation. The token in the link is the only proof of ownership,
 * so the customer context is built from the booking that token belongs to — never from the form.
 */
export async function cancelOwnBookingAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction('booking.customer-cancel', async () => {
    await enforceRateLimit(RATE_LIMITS.manageBookingByIp, rateLimitSubject(await clientIp()));
    const slug = field(form, 'slug');
    const token = field(form, 'token');
    const organization = await getPublicOrganization(slug);
    if (!organization) throw new AppError('NOT_FOUND', 'Booking not found.');

    const events: DomainEvent[] = await withTenant(organization.id, async (scope) => {
      const booking = await findBookingByManageToken(scope, token);
      if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.');
      const outcome = await cancelBooking(
        scope,
        { kind: 'customer', organizationId: organization.id, customerId: booking.customerId },
        { bookingId: booking.id, reason: field(form, 'reason').slice(0, 300) || undefined },
      );
      return outcome.events;
    });
    await runAutomations(events);
    revalidatePath(`/w/${slug}/booking/${token}`);
    return { ok: true, message: 'Your booking is cancelled. You’ll find the confirmation in your email.' };
  });
}
