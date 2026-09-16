import type { CodeRef } from '@/content/learn/types';
import { loadExcerpt } from '@/modules/learn/excerpts';
import { highlight, type TokenKind } from '@/modules/learn/highlight';
import { cx } from '@/lib/cx';

const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: 'text-[#e9e4d8]',
  comment: 'text-[#a4a698] italic',
  string: 'text-[#a8d5bb]',
  keyword: 'text-[#f2ae84]',
  number: 'text-[#e8c886]',
  type: 'text-[#bccae6]',
  fn: 'text-[#f4f1ea] font-medium',
};

/** A real excerpt of the source, read at render time, with the file path and line numbers. */
export async function CodeExcerpt({ codeRef, title }: { codeRef: CodeRef; title?: string }) {
  const excerpt = await loadExcerpt(codeRef);
  const lines = highlight(excerpt.lines, excerpt.language);
  const endLine = excerpt.startLine + excerpt.lines.length - 1;
  const gutter = String(endLine).length;

  return (
    <figure className="overflow-hidden rounded-[var(--radius-lg)] border border-ink/80 bg-[#1b1d1a]">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-white/10 px-4 py-2.5">
        <span className="text-[0.8125rem] font-medium text-[#f4f1ea]">{title ?? 'Source'}</span>
        <span className="font-mono text-[0.6875rem] text-[#b7b9ad]">
          {excerpt.file}:{excerpt.startLine}–{endLine}
        </span>
      </figcaption>
      <div
        className={cx('overflow-auto', lines.length > 34 && 'max-h-[34rem]')}
        tabIndex={0}
        role="region"
        aria-label={`Code from ${excerpt.file}, lines ${excerpt.startLine} to ${endLine}`}
      >
        <pre className="min-w-fit py-3 font-mono text-[0.78rem] leading-[1.6]">
          <code>
            {lines.map((tokens, index) => (
              <span key={index} className="flex px-4 hover:bg-white/[0.03]">
                <span
                  aria-hidden
                  className="mr-4 inline-block shrink-0 text-right text-[#8e9085] select-none"
                  style={{ width: `${gutter}ch` }}
                >
                  {excerpt.startLine + index}
                </span>
                <span className="whitespace-pre">
                  {tokens.length === 0
                    ? ' '
                    : tokens.map((token, i) => (
                        <span key={i} className={TOKEN_CLASS[token.kind]}>
                          {token.text}
                        </span>
                      ))}
                </span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </figure>
  );
}
