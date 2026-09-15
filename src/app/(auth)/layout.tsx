import Link from 'next/link';
import { RelayWordmark } from '@/components/brand/logo';

const TRACE = [
  { time: '09:14', step: 'Message', detail: '“Can I get my bike serviced Tuesday afternoon?”' },
  { time: '09:14', step: 'Understood', detail: 'Booking · Standard service · Tue afternoon' },
  { time: '09:14', step: 'Checked', detail: '3 free slots with 2 mechanics' },
  { time: '09:15', step: 'Booked', detail: 'Tue 22 Sep, 14:00 · Jonas Haugen' },
  { time: '09:15', step: 'Recorded', detail: 'booking.created → audit log' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden flex-col justify-between border-r border-rule px-12 py-10 lg:flex">
        <Link href="/" className="w-fit">
          <RelayWordmark />
        </Link>

        <div className="max-w-lg">
          <p className="eyebrow">For small appointment-based businesses</p>
          <p className="mt-4 font-serif text-[2.5rem] leading-[1.08] tracking-tight text-ink">
            Customer messages in. <em className="text-pine-700">Bookings, leads and tasks</em> out.
          </p>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink-2">
            Relay answers the questions you get every day, books people into free slots, and hands anything
            unusual to someone on your team — with a record of what it did and why.
          </p>

          <figure className="mt-10 rounded-[var(--radius-lg)] border border-rule bg-surface">
            <figcaption className="eyebrow flex items-center justify-between border-b border-rule px-4 py-2.5">
              <span>What happened to one message</span>
              <span className="text-pine-600">Audit trail</span>
            </figcaption>
            <ol className="divide-y divide-rule/70 font-mono text-[0.75rem]">
              {TRACE.map((row) => (
                <li key={row.step} className="grid grid-cols-[3.25rem_5.5rem_1fr] gap-2 px-4 py-2">
                  <span className="text-ink-3">{row.time}</span>
                  <span className={row.step === 'Booked' ? 'text-signal-700' : 'text-ink-2'}>{row.step}</span>
                  <span className="truncate text-ink">{row.detail}</span>
                </li>
              ))}
            </ol>
          </figure>
        </div>

        <p className="text-xs text-ink-3">
          Made for small teams. Runs locally in demo mode — no paid services.
        </p>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="mb-10 w-fit lg:hidden">
          <RelayWordmark />
        </Link>
        <div className="mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center">{children}</div>
      </main>
    </div>
  );
}
