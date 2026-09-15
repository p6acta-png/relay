'use server';

import { redirect } from 'next/navigation';
import { AppError } from '@/lib/errors';
import { setActiveOrganization } from '@/modules/auth/sessions';
import { createOrganizationForOwner } from '@/modules/tenancy/organizations';
import { field, runAction, type ActionResult } from '@/server/actions';
import { getCurrentSession } from '@/server/session';

export async function createBusinessAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    'onboarding.create-business',
    async () => {
      const session = await getCurrentSession();
      if (!session) throw new AppError('UNAUTHENTICATED', 'Your session has ended. Please log in again.');

      const { organization } = await createOrganizationForOwner(session.user, {
        businessName: field(form, 'businessName'),
        slug: field(form, 'slug'),
        city: field(form, 'city'),
        contactEmail: field(form, 'contactEmail'),
        weekdayOpens: field(form, 'weekdayOpens'),
        weekdayCloses: field(form, 'weekdayCloses'),
        saturdayOpen: field(form, 'saturdayOpen') === 'yes' ? 'yes' : 'no',
        saturdayOpens: field(form, 'saturdayOpens'),
        saturdayCloses: field(form, 'saturdayCloses'),
        serviceName: field(form, 'serviceName'),
        serviceDurationMinutes: field(form, 'serviceDurationMinutes'),
        servicePriceNok: field(form, 'servicePriceNok') || undefined,
      });
      await setActiveOrganization(session.id, organization.id);
      redirect('/app/today?welcome=1');
    },
    { form },
  );
}
