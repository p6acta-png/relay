import { describe, expect, it } from 'vitest';
import { highlight } from './highlight';

const kinds = (line: string, language: 'ts' | 'sql' = 'ts') =>
  highlight([line], language)[0]!
    .filter((t) => t.text.trim())
    .map((t) => [t.kind, t.text.trim()]);

describe('highlight', () => {
  it('marks keywords, strings, numbers, calls and comments in TypeScript', () => {
    expect(kinds(`const limit = 30; // per window`)).toEqual([
      ['keyword', 'const'],
      ['plain', 'limit ='],
      ['number', '30'],
      ['plain', ';'],
      ['comment', '// per window'],
    ]);
    expect(kinds(`await enforceRateLimit('login')`)).toEqual([
      ['keyword', 'await'],
      ['fn', 'enforceRateLimit'],
      ['plain', '('],
      ['string', "'login'"],
      ['plain', ')'],
    ]);
  });

  it('carries block comments across lines', () => {
    const lines = highlight(['/**', ' * Why this exists', ' */', 'export {}'], 'ts');
    expect(lines.slice(0, 3).every((tokens) => tokens.every((t) => t.kind === 'comment'))).toBe(true);
    expect(lines[3]![0]).toEqual({ kind: 'keyword', text: 'export' });
  });

  it('keeps every character of the source', () => {
    const source = `if (a < b && c) return "x<y>";`;
    expect(
      highlight([source], 'ts')[0]!
        .map((t) => t.text)
        .join(''),
    ).toBe(source);
  });

  it('highlights SQL case-insensitively', () => {
    expect(kinds(`alter TABLE "Booking" -- isolation`, 'sql')).toEqual([
      ['keyword', 'alter'],
      ['keyword', 'TABLE'],
      ['string', '"Booking"'],
      ['comment', '-- isolation'],
    ]);
  });
});
