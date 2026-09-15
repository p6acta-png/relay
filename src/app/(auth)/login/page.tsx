import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/content/demo';
import { env } from '@/lib/env';
import { getCurrentSession } from '@/server/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, session] = await Promise.all([searchParams, getCurrentSession()]);
  if (session && !next?.startsWith('/invite')) redirect('/app');

  return (
    <div>
      <h1 className="text-2xl font-semibold">Log in</h1>
      <p className="mt-1.5 text-sm text-ink-2">
        New to Relay?{' '}
        <Link
          href="/signup"
          className="font-medium text-pine-700 underline underline-offset-2 hover:text-pine-800"
        >
          Create an account
        </Link>
      </p>

      <LoginForm next={typeof next === 'string' ? next : ''} />

      {env.DEMO_MODE && (
        <section
          aria-labelledby="demo-accounts"
          className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-rule-strong p-4"
        >
          <h2 id="demo-accounts" className="eyebrow">
            Demo accounts · password <span className="font-medium text-ink normal-case">{DEMO_PASSWORD}</span>
          </h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email} className="flex flex-col">
                <span className="font-mono text-[0.8125rem] text-ink">{account.email}</span>
                <span className="text-xs text-ink-3">
                  {account.business} · {account.note}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
