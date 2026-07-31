// Enforces the test-mock hygiene the root vitest config declares. That config runs the whole unit
// suite with `isolate: false` — one shared module registry per worker, for a ~15x speedup — and the
// property that makes it safe is that every file scopes its own mocks. Two rules carry that:
//
//   hoisted-mock  A top-level `vi.mock()` is hoisted above the file's imports and registered for the
//                 whole worker, not this file, so it leaks into every later file that imports the same
//                 module. The sanctioned form is `vi.doMock()` inside `beforeAll` plus a dynamic
//                 import of the subject.
//   orphan-unmock A `vi.doUnmock('x')` whose specifier no other call in the file ever mocked. It
//                 unmocks nothing, which is worse than absent: it reads as cleanup that is happening.
//
// Both were written down long before anything enforced them, and both drifted anyway: 21 files carried
// an orphan unmock and 14 a hoisted mock, across three agents and two days of debugging. This is one
// fast static scan; the alternative was people reading test files by hand, which demonstrably did not
// happen. Same allowlist-with-a-reason shape as scripts/portable.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import pc from 'picocolors';

type Rule = 'hoisted-mock' | 'orphan-unmock';

const RULE_MESSAGE: Record<Rule, string> = {
  'hoisted-mock':
    'top-level vi.mock() — hoists above imports and leaks across files under isolate:false; use vi.doMock() in beforeAll plus a dynamic import',
  'orphan-unmock': 'vi.doUnmock() names a specifier this file never mocked — it unmocks nothing',
};

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
  '.cache',
  '.git',
  '.idea',
  '.vscode',
  '.claude',
  '.quimby',
  'worktrees',
  'incoming',
]);

// Genuinely-intentional escapes, named with a reason, never silently.
const ALLOW: { rule: Rule; match: (rel: string) => boolean; why: string }[] = [];

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const jsonMode = args.includes('--json');
const root = process.cwd();

interface Violation {
  path: string;
  line: number;
  rule: Rule;
}

const violations: Violation[] = [];
let allowed = 0;

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

// Matched textually rather than through the AST: the rules are about a call's *position* (top level
// versus inside a hook), which a line-anchored match captures directly, and a test file that fails to
// parse should not silently pass the check.
const HOISTED = /^vi\.mock\(\s*'([^']+)'/gm;
const DO_MOCK = /vi\.doMock\(\s*'([^']+)'/g;
const DO_UNMOCK = /vi\.doUnmock\(\s*'([^']+)'/g;

const testFiles: string[] = [];
walk(root, testFiles);

for (const path of testFiles) {
  const rel = relative(root, path).replaceAll('\\', '/');
  const text = readFileSync(path, 'utf-8');

  const record = (rule: Rule, index: number): void => {
    if (ALLOW.some((a) => a.rule === rule && a.match(rel))) {
      allowed++;
      return;
    }
    violations.push({ path: rel, line: lineOf(text, index), rule });
  };

  for (const m of text.matchAll(HOISTED)) record('hoisted-mock', m.index);

  const mocked = new Set(Array.from(text.matchAll(DO_MOCK), (m) => m[1]));
  for (const m of text.matchAll(HOISTED)) mocked.add(m[1]);
  for (const m of text.matchAll(DO_UNMOCK)) {
    if (!mocked.has(m[1])) record('orphan-unmock', m.index);
  }
}

violations.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);

if (jsonMode) {
  console.log(JSON.stringify({ passed: violations.length === 0, allowed, violations }, null, 2));
  process.exit(violations.length > 0 && checkMode ? 1 : 0);
}

if (violations.length === 0) {
  console.log(
    `${pc.green('OK')} ${pc.bold('Test mocks are per-file and self-consistent')} ${pc.dim(`(${allowed} named escape${allowed === 1 ? '' : 's'} allow-listed)`)}`,
  );
  process.exit(0);
}

console.log(
  `${pc.yellow('!')} ${pc.bold(`${violations.length} mock-hygiene violation${violations.length === 1 ? '' : 's'} — these leak across files under isolate:false`)}\n`,
);
for (const v of violations) {
  console.log(`  ${pc.yellow('!')} ${pc.white(`${v.path}:${v.line}`)} ${pc.dim(RULE_MESSAGE[v.rule])}`);
}
console.log(
  `\n${pc.dim('If an escape is genuinely intentional and contained, add it to ALLOW in scripts/mocks.ts with a reason. See the mock rules in vitest.config.ts.')}`,
);
process.exit(checkMode ? 1 : 0);

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(path, out);
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx'))) out.push(path);
  }
}
