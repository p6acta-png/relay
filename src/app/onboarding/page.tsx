import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RelayWordmark } from '@/components/brand/logo';
import { listMembershipsForUser } from '@/modules/tenancy/organizations';
import { getCurrentSession } from '@/server/session';
import { OnboardingForm } from './onboarding-form';

export const metadata: Metadata = { title: 'Set up your business' };

export default async function OnboardingPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login?next=/onboarding');
  const memberships = await listMembershipsForUser(session.user.id);

  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between border-b border-rule px-5 sm:px-8">
        <RelayWordmark />
        {memberships.length > 0 && (
          <Link href="/app" className="text-sm text-ink-2 hover:text-ink hover:underline">
            Back to dashboard
          </Link>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <p className="eyebrow">Step 2 of 2 · Your business</p>
        <h1 className="mt-2 text-[1.75rem] leading-tight font-semibold">
          Set up {memberships.length ? 'another' : 'your'} business
        </h1>
        <p className="mt-2 max-w-xl text-[0.9375rem] text-ink-2">
          Three things are enough to take the first booking: where people find you, when you’re open, and one
          service. You can add staff, more services and FAQs afterwards.
        </p>
        <OnboardingForm ownerName={session.user.name} />
      </main>
    </div>
  );
}
