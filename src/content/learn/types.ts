/**
 * The shape of the teaching content in /learn.
 *
 * Text fields are plain strings. Inside them, `backticks` mark code, and [[slug]] links to another
 * subsystem page. Code is never pasted into content: `CodeRef`s point at the real files, and the
 * page reads the excerpt at render time (see src/modules/learn/excerpts.ts).
 */

export interface CodeRef {
  file: string;
  /** Block between `// #region learn:<name>` and `// #endregion learn:<name>`. */
  region?: string;
  /** First line containing `start` through the next line containing `end`. */
  start?: string;
  end?: string;
}

export interface Snippet {
  title: string;
  ref: CodeRef;
  /** What to notice when reading it. */
  note: string;
}

export type SubsystemGroup = 'The core flow' | 'Foundations' | 'Running the business' | 'Quality';

export interface Subsystem {
  slug: string;
  title: string;
  group: SubsystemGroup;
  /** One sentence for cards and the architecture explorer. */
  summary: string;
  beginner: string[];
  professional: string[];
  /** Why this approach — each entry is one decision with the alternative that was rejected. */
  why: { decision: string; because: string; instead: string }[];
  files: { path: string; role: string }[];
  snippets: Snippet[];
  failures: { what: string; handling: string }[];
  /** What to say in an interview: a short answer in the first person. */
  interview: string[];
  followUp: { question: string; answer: string[] };
  /** Tests that prove the claims on the page. */
  tests: { file: string; name: string }[];
  related: string[];
}

export interface Concept {
  slug: string;
  term: string;
  beginner: string;
  developer: string;
  seeAlso: string[];
}

export interface WalkthroughStep {
  title: string;
  beginner: string;
  developer: string;
  ref?: CodeRef;
}

export interface Walkthrough {
  slug: string;
  title: string;
  summary: string;
  /** How to reproduce it in the running app. */
  tryIt: string[];
  steps: WalkthroughStep[];
  related: string[];
}
