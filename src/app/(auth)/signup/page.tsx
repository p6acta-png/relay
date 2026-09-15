import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getChallengeProvider } from '@/modules/protection/challenge';
import { getCurrentSession } from '@/server/session';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignupPage() {
  if (await getCurrentSession()) redirect('/app');
  const { formToken } = getChallengeProvider().issue();

  return (
    <div>
      <p className="eyebrow">Step 1 of 2 · Your account</p>
      <h1 className="mt-2 text-2xl font-semibold">Create your Relay account</h1>
      <p className="mt-1.5 text-sm text-ink-2">
        Next you’ll set up your business. Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-pine-700 underline underline-offset-2 hover:text-pine-800"
        >
          Log in
        </Link>
      </p>
      <SignupForm formToken={formToken} />
    </div>
  );
}
