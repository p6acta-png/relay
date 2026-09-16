import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRef } from '@/modules/learn/excerpts';
import { NODES, SCENARIOS } from './architecture';
import { CONCEPTS } from './concepts';
import { QUESTIONS, SIMULATIONS, STUDY_ORDER } from './interview';
import { SUBSYSTEMS } from './subsystems';
import type { CodeRef } from './types';
import { WALKTHROUGHS } from './walkthroughs';

/**
 * /learn teaches the real codebase, so it must not drift from it. These tests fail when a file
 * moves, a code region disappears, a test is renamed or a cross-link breaks.
 */
const ROOT = process.cwd();
const exists = (file: string) => fs.existsSync(path.join(ROOT, file));
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const subsystemSlugs = new Set(SUBSYSTEMS.map((s) => s.slug));

const allText = [
  ...SUBSYSTEMS.flatMap((s) => [
    s.summary,
    ...s.beginner,
    ...s.professional,
    ...s.interview,
    ...s.followUp.answer,
    ...s.failures.flatMap((f) => [f.what, f.handling]),
  ]),
  ...CONCEPTS.flatMap((c) => [c.beginner, c.developer]),
  ...WALKTHROUGHS.flatMap((w) => w.steps.flatMap((step) => [step.beginner, step.developer])),
];

const codeRefs: CodeRef[] = [
  ...SUBSYSTEMS.flatMap((s) => s.snippets.map((snippet) => snippet.ref)),
  ...WALKTHROUGHS.flatMap((w) => w.steps.flatMap((step) => (step.ref ? [step.ref] : []))),
];

describe('learn content', () => {
  it('covers every required element for each subsystem', () => {
    for (const s of SUBSYSTEMS) {
      const missing = Object.entries({
        beginner: s.beginner.length,
        professional: s.professional.length,
        why: s.why.length,
        files: s.files.length,
        failures: s.failures.length,
        interview: s.interview.length,
        followUpQuestion: s.followUp.question.length,
        followUpAnswer: s.followUp.answer.length,
      })
        .filter(([, n]) => n === 0)
        .map(([key]) => key);
      expect(missing, s.slug).toEqual([]);
    }
  });

  it('has unique slugs and working cross-links', () => {
    expect(subsystemSlugs.size).toBe(SUBSYSTEMS.length);
    const links = [
      ...SUBSYSTEMS.flatMap((s) => s.related),
      ...CONCEPTS.flatMap((c) => c.seeAlso),
      ...WALKTHROUGHS.flatMap((w) => w.related),
      ...QUESTIONS.flatMap((q) => q.review),
      ...NODES.map((n) => n.subsystem),
      ...allText.flatMap((text) => [...text.matchAll(/\[\[([a-z-]+)\]\]/g)].map((m) => m[1]!)),
    ];
    expect(links.filter((slug) => !subsystemSlugs.has(slug))).toEqual([]);

    const nodeIds = new Set(NODES.map((n) => n.id));
    expect(
      SCENARIOS.flatMap((s) => s.steps.map((step) => step.node)).filter((id) => !nodeIds.has(id)),
    ).toEqual([]);
    const walkthroughs = new Set(WALKTHROUGHS.map((w) => w.slug));
    expect(
      SCENARIOS.flatMap((s) => (s.walkthrough && !walkthroughs.has(s.walkthrough) ? [s.walkthrough] : [])),
    ).toEqual([]);
  });

  it('only points at files that exist', () => {
    const files = [
      ...SUBSYSTEMS.flatMap((s) => [...s.files.map((f) => f.path), ...s.tests.map((t) => t.file)]),
      ...codeRefs.map((ref) => ref.file),
      ...STUDY_ORDER.map((entry) => entry.file),
      ...SIMULATIONS.flatMap((sim) => sim.where),
      ...NODES.flatMap((n) => n.files),
    ];
    expect([...new Set(files)].filter((file) => !exists(file))).toEqual([]);
  });

  it('shows code excerpts that still exist', () => {
    for (const ref of codeRefs) {
      const excerpt = resolveRef(ref, read(ref.file));
      expect(excerpt.lines.length, `${ref.file} ${ref.region ?? ref.start}`).toBeGreaterThan(2);
    }
  });

  it('names tests that exist', () => {
    const missing = SUBSYSTEMS.flatMap((s) => s.tests).filter(
      (test) => !exists(test.file) || !read(test.file).includes(`it('${test.name}'`),
    );
    expect(missing).toEqual([]);
  });

  it('uses every learn region marked in the source', () => {
    const used = new Set(codeRefs.flatMap((ref) => (ref.region ? [`${ref.file}#${ref.region}`] : [])));
    const marked: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== 'generated') walk(relative);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          for (const match of read(relative).matchAll(/#region learn:([\w-]+)/g))
            marked.push(`${relative}#${match[1]}`);
        }
      }
    };
    walk('src');
    expect(marked.filter((marker) => !used.has(marker))).toEqual([]);
  });
});
