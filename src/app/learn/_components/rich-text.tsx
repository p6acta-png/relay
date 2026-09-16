import Link from 'next/link';
import { Fragment } from 'react';
import { getSubsystem } from '@/content/learn/subsystems';

/**
 * Renders content strings: `backticks` become inline code and [[slug]] becomes a link to that
 * subsystem page. Everything else is plain text (React escapes it).
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\[\[[a-z-]+\]\])/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code
              key={index}
              className="rounded-[3px] bg-sunken px-1 py-px font-mono text-[0.84em] break-words text-ink"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        const link = /^\[\[([a-z-]+)\]\]$/.exec(part);
        if (link) {
          const subsystem = getSubsystem(link[1]!);
          return (
            <Link
              key={index}
              href={`/learn/subsystems/${link[1]}`}
              className="text-pine-700 underline decoration-pine-600/40 underline-offset-2 hover:decoration-pine-700"
            >
              {subsystem?.title ?? link[1]}
            </Link>
          );
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

export function Paragraphs({ items, className }: { items: string[]; className?: string }) {
  return (
    <div className={className ?? 'space-y-4'}>
      {items.map((text) => (
        <p key={text.slice(0, 40)}>
          <RichText text={text} />
        </p>
      ))}
    </div>
  );
}
