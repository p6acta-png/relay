'use client';

import { Button } from '@/components/ui/button';

/** Shown when a page throws unexpectedly. No stack traces — just a reference for the logs. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto mt-24 max-w-md px-5 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-3 text-2xl font-semibold">This page didn’t load</h1>
      <p className="mt-2 text-sm text-ink-2">
        It’s our fault, not yours. Try again — if it keeps happening, the reference below helps us find it in
        the logs.
      </p>
      {error.digest && <p className="mt-3 font-mono text-xs text-ink-3">Reference: {error.digest}</p>}
      <Button onClick={reset} className="mt-6">
        Try again
      </Button>
    </main>
  );
}
