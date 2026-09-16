import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CodeRef } from '@/content/learn/types';

/**
 * Code excerpts for /learn, read from the real source files at render time — so the guide can
 * never drift from the code it explains. A test checks that every reference still resolves.
 *
 * Two ways to point at code:
 *  - `region`: a block between `// #region learn:<name>` and `// #endregion learn:<name>`;
 *  - `start` / `end`: the first line containing `start`, through the next line containing `end`
 *    (used for SQL migrations, which must not be edited after they have been applied).
 */
export type { CodeRef };

export interface Excerpt {
  file: string;
  language: 'ts' | 'sql';
  /** 1-based line number in the file of the first line shown. */
  startLine: number;
  lines: string[];
}

const ROOT = process.cwd();

export function resolveRef(ref: CodeRef, source: string): { startLine: number; lines: string[] } {
  const all = source.split(/\r?\n/);
  let from: number;
  let to: number;

  if (ref.region) {
    from = all.findIndex((line) => line.includes(`#region learn:${ref.region}`)) + 1;
    to = all.findIndex((line) => line.includes(`#endregion learn:${ref.region}`));
    if (from === 0 || to === -1 || to < from)
      throw new Error(`Region "${ref.region}" not found in ${ref.file}`);
  } else if (ref.start && ref.end) {
    from = all.findIndex((line) => line.includes(ref.start!));
    if (from === -1) throw new Error(`"${ref.start}" not found in ${ref.file}`);
    const endOffset = all.slice(from).findIndex((line) => line.includes(ref.end!));
    if (endOffset === -1) throw new Error(`"${ref.end}" not found after "${ref.start}" in ${ref.file}`);
    to = from + endOffset + 1;
  } else {
    throw new Error(`Code reference to ${ref.file} needs a region or start/end`);
  }

  const lines = all.slice(from, to);
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  return { startLine: from + 1, lines: lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)) };
}

export async function loadExcerpt(ref: CodeRef): Promise<Excerpt> {
  const absolute = path.resolve(ROOT, ref.file);
  // Only files inside the project, and only source-like files, can ever be read.
  if (!absolute.startsWith(ROOT + path.sep) || !/\.(ts|tsx|mjs|sql|prisma)$/.test(absolute)) {
    throw new Error(`Refusing to read ${ref.file}`);
  }
  const source = await fs.readFile(absolute, 'utf8');
  return {
    file: ref.file,
    language: ref.file.endsWith('.sql') ? 'sql' : 'ts',
    ...resolveRef(ref, source),
  };
}
