'use client';

/** Last-resort error screen when even the root layout fails. Plain HTML, no dependencies. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          background: '#f4f1ea',
          color: '#1b1d1a',
          padding: '4rem 1.25rem',
        }}
      >
        <main style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22 }}>Relay is having trouble</h1>
          <p style={{ fontSize: 14, color: '#464a43' }}>Please try again in a moment.</p>
          {error.digest && (
            <p style={{ fontSize: 12, fontFamily: 'monospace', color: '#666a61' }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              background: '#1f4b3f',
              color: 'white',
              border: 0,
              borderRadius: 5,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
