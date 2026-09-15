'use server';

import { redirect } from 'next/navigation';
import { AppError } from '@/lib/errors';
import { registerUser } from '@/modules/auth/accounts';
import { createSession, setActiveOrganization } from '@/modules/auth/sessions';
import { enforceChallenge } from '@/modules/protection/challenge';
import { enforceRateLimit, RATE_LIMITS, rateLimitSubject } from '@/modules/protection/rate-limit';
import { acceptInvite, findInvite } from '@/modules/tenancy/team';
import { field, runAction, type ActionResult } from '@/server/actions';
import { clientIp } from '@/server/request';
import { getCurrentSession, setSessionCookie } from '@/server/session';

/** Signed-in user whose email matches the invitation. */
export async function acceptInviteAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction('invite.accept', async () => {
    const session = await getCurrentSession();
    if (!session) throw new AppError('UNAUTHENTICATED', 'Log in to accept this invitation.');
    const { organization } = await acceptInvite(field(form, 'token'), session.user);
    await setActiveOrganization(session.id, organization.id);
    redirect('/app/today');
  });
}

/** New person: create the account for the invited email, join the business, log in. */
export async function joinWithNewAccountAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(
    'invite.join-new-account',
    async () => {
      enforceChallenge({ honeypot: field(form, 'website'), formToken: field(form, 'formToken') });
      await enforceRateLimit(RATE_LIMITS.signupByIp, rateLimitSubject(await clientIp()));

      const token = field(form, 'token');
      const invite = await findInvite(token);
      if (!invite || invite.status !== 'valid') {
        throw new AppError('NOT_FOUND', 'This invitation is no longer valid. Ask for a new one.');
      }
      // The email comes from the invitation, never from the form.
      const user = await registerUser({
        name: field(form, 'name'),
        email: invite.email,
        password: field(form, 'password'),
      });
      const { organization } = await acceptInvite(token, user);
      const session = await createSession(user.id, organization.id);
      await setSessionCookie(session.token, session.expiresAt);
      redirect('/app/today');
    },
    { form },
  );
}
