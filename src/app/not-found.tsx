import Link from 'next/link';
import { RelayWordmark } from '@/components/brand/logo';

export default function NotFound() {
  return (
    <div className="min-h-dvh px-5 py-8">
      <Link href="/" className="inline-block">
        <RelayWordmark />
      </Link>
      <main className="mx-auto mt-24 max-w-md text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 text-2xl font-semibold">We couldn’t find that page</h1>
        <p className="mt-2 text-sm text-ink-2">
          The link may be old, or the page may belong to a different business.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-pine-700 underline underline-offset-2"
        >
          Go to the start page
        </Link>
      </main>
    </div>
  );
}
