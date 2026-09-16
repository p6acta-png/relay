'use server';

import { redirect } from 'next/navigation';
import { AppError } from '@/lib/errors';
import { authenticate, registerUser } from '@/modules/auth/accounts';
import { createSession, invalidateSession, setActiveOrganization } from '@/modules/auth/sessions';
import { enforceChallenge } from '@/modules/protection/challenge';
import { enforceRateLimit, RATE_LIMITS, rateLimitSubject } from '@/modules/protection/rate-limit';
import { listMembershipsForUser } from '@/modules/tenancy/organizations';
import { field, runAction, type ActionResult } from '@/server/actions';
import { clientIp } from '@/server/request';
import { clearSessionCookie, getCurrentSession, setSessionCookie } from '@/server/session';

// #region learn:safe-next
/** Only allow redirects to our own pages — never to another site (open-redirect protection). */
function safeNext(value: string): string | null {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return /^\/(app|invite|onboarding)(\/|\?|$)/.test(value) ? value : null;
}
// #endregion learn:safe-next

// #region learn:login-action
export async function loginAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    'login',
    async () => {
      const email = field(form, 'email');
      await enforceRateLimit(RATE_LIMITS.loginByIp, rateLimitSubject(await clientIp()));
      await enforceRateLimit(RATE_LIMITS.loginByEmail, rateLimitSubject(email.trim() || 'blank'));

      const user = await authenticate({ email, password: field(form, 'password') });
      const memberships = await listMembershipsForUser(user.id);

      // A brand-new random session on every login (prevents session fixation).
      const { token, expiresAt } = await createSession(user.id, memberships[0]?.organization.id ?? null);
      await setSessionCookie(token, expiresAt);

      redirect(safeNext(field(form, 'next')) ?? (memberships.length > 0 ? '/app' : '/onboarding'));
    },
    { form },
  );
}
// #endregion learn:login-action

export async function signupAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    'signup',
    async () => {
      enforceChallenge({ honeypot: field(form, 'website'), formToken: field(form, 'formToken') });
      await enforceRateLimit(RATE_LIMITS.signupByIp, rateLimitSubject(await clientIp()));

      const user = await registerUser({
        name: field(form, 'name'),
        email: field(form, 'email'),
        password: field(form, 'password'),
      });
      const { token, expiresAt } = await createSession(user.id);
      await setSessionCookie(token, expiresAt);
      redirect(safeNext(field(form, 'next')) ?? '/onboarding');
    },
    { form },
  );
}

export async function logoutAction(): Promise<void> {
  const session = await getCurrentSession();
  if (session) await invalidateSession(session.id);
  await clearSessionCookie();
  redirect('/login');
}

export async function switchOrganizationAction(form: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  const organizationId = field(form, 'organizationId');
  const memberships = await listMembershipsForUser(session.user.id);
  // The user can only switch to a business they actually belong to.
  if (!memberships.some((m) => m.organization.id === organizationId)) {
    throw new AppError('FORBIDDEN', 'You are not a member of that business.');
  }
  await setActiveOrganization(session.id, organizationId);
  redirect('/app');
}
