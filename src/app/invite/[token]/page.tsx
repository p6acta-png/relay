import type { Metadata } from 'next';
import Link from 'next/link';
import { RelayWordmark } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';
import { prisma } from '@/lib/db';
import { getChallengeProvider } from '@/modules/protection/challenge';
import { ROLE_LABELS } from '@/modules/tenancy/permissions';
import { findInvite } from '@/modules/tenancy/team';
import { getCurrentSession } from '@/server/session';
import { AcceptInviteForm, JoinInviteForm } from './invite-forms';

export const metadata: Metadata = { title: 'Join a team', robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, session] = await Promise.all([findInvite(token), getCurrentSession()]);

  let body: React.ReactNode;
  if (!invite || invite.status !== 'valid') {
    const reason =
      invite?.status === 'accepted'
        ? 'This invitation has already been used.'
        : invite?.status === 'expired'
          ? 'This invitation has expired.'
          : 'This invitation link is not valid.';
    body = (
      <>
        <h1 className="text-2xl font-semibold">{reason}</h1>
        <p className="mt-2 text-sm text-ink-2">Ask the person who invited you to send a new link.</p>
        <ButtonLink href="/login" variant="secondary" className="mt-6">
          Go to login
        </ButtonLink>
      </>
    );
  } else {
    const heading = (
      <>
        <p className="eyebrow">Invitation</p>
        <h1 className="mt-2 text-2xl font-semibold">Join {invite.organization.name}</h1>
        <p className="mt-2 text-sm text-ink-2">
          You’ve been invited as{' '}
          <strong className="font-medium text-ink">{ROLE_LABELS[invite.role].toLowerCase()}</strong> using{' '}
          <span className="font-mono text-[0.8125rem] text-ink">{invite.email}</span>.
        </p>
      </>
    );

    if (session) {
      body =
        session.user.email === invite.email ? (
          <>
            {heading}
            <AcceptInviteForm token={token} />
          </>
        ) : (
          <>
            {heading}
            <p className="mt-6 rounded-[var(--radius-md)] border border-rule bg-surface p-4 text-sm text-ink-2">
              You’re logged in as <span className="font-mono text-ink">{session.user.email}</span>. Log out
              and open this link again with the invited account.
            </p>
          </>
        );
    } else {
      const hasAccount = (await prisma.user.count({ where: { email: invite.email } })) > 0;
      body = hasAccount ? (
        <>
          {heading}
          <ButtonLink href={`/login?next=/invite/${token}`} className="mt-6" size="lg">
            Log in to accept
          </ButtonLink>
        </>
      ) : (
        <>
          {heading}
          <JoinInviteForm token={token} formToken={getChallengeProvider().issue().formToken} />
        </>
      );
    }
  }

  return (
    <div className="min-h-dvh px-5 py-8">
      <Link href="/" className="inline-block">
        <RelayWordmark />
      </Link>
      <main className="mx-auto mt-16 max-w-md">{body}</main>
    </div>
  );
}
