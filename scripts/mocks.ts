// Enforces the test-mock hygiene the root vitest config declares. That config runs the whole unit
// suite with `isolate: false` — one shared module registry per worker, for a ~15x speedup — and the
// property that makes it safe is that every file scopes its own mocks. Two rules carry that:
//
//   hoisted-mock  A top-level `vi.mock()` is hoisted above the file's imports. Under the SHARED
//                 registry it registers for the whole worker, not this file, so it leaks into every
//                 later file importing that module — forbidden there. It is fine in the isolated tier,
//                 where the registry is per-file. The rule is about the registry, not the API.
//   untiered-mock A file that mocks modules but is not in the isolated tier, so it is running under the
//                 shared registry where its mocks can leak.
//   stale-tier    A `mocks-modules` entry that no longer mocks anything, so it is paying for
//                 isolation it does not need — demote it.
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

import { REGISTRY_ISOLATED_TESTS } from './registryIsolatedTests';
import { SCAN_SKIP_DIRECTORIES } from './scanSkipDirectories';

type Rule = 'hoisted-mock' | 'orphan-unmock' | 'stale-tier' | 'untiered-mock';

const RULE_MESSAGE: Record<Rule, string> = {
  'stale-tier':
    'declared mocks-modules in scripts/registryIsolatedTests.ts but mocks nothing — demote it, or state the real reason',
  'untiered-mock': 'mocks a module but is not in vitest.tiers.ts — its mocks leak under the shared registry',
  'hoisted-mock':
    'top-level vi.mock() — hoists above imports and leaks across files under isolate:false; use vi.doMock() in beforeAll plus a dynamic import',
  'orphan-unmock': 'vi.doUnmock() names a specifier this file never mocked — it unmocks nothing',
};

// The shared generated-output set, plus the three this scan skips for its own reasons: agent and editor
// state, and sibling checkouts whose test files are not this tree's to judge.
const IGNORED_DIRS = new Set([...SCAN_SKIP_DIRECTORIES, '.claude', '.quimby', 'worktrees', 'incoming']);

// Genuinely-intentional escapes, named with a reason, never silently.
const ALLOW: { rule: Rule; match: (rel: string) => boolean; why: string }[] = [
  {
    match: (rel) => rel === 'packages/tool-capture/src/captureServer.test.ts',
    rule: 'hoisted-mock',
    why:
      'This file runs in the tool-capture project (isolate:true, environment:node), not the shared ' +
      'jsdom project — the vi.mock is contained by the project routing, not by REGISTRY_ISOLATED_TESTS.',
  },
  {
    match: (rel) => rel === 'packages/tool-capture/src/captureServer.test.ts',
    rule: 'untiered-mock',
    why:
      'Isolated by the tool-capture project (isolate:true), not by REGISTRY_ISOLATED_TESTS. The mock ' +
      'targets node:child_process, a native ESM module with non-configurable exports that vi.spyOn ' +
      'cannot replace.',
  },
  {
    match: (rel) => rel === 'scripts/handRolledHermeticity.test.ts',
    rule: 'untiered-mock',
    why:
      'This file does not mock anything — it writes SAMPLE SOURCE containing `vi.mock(` into temp files ' +
      'and asserts what the hand-rolled-hermeticity predicate makes of them. The detector matches the ' +
      'token wherever it appears, so a test ABOUT mocking reads as a test THAT mocks, which is the same ' +
      'token-versus-call-site confusion that predicate exists to remove. Obfuscating the fixtures would ' +
      'silence this at the cost of the test no longer exercising a realistic call site.',
  },
];

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const jsonMode = args.includes('--json');
const root = process.cwd();

interface Violation {
  path: string;
  line: number;
  rule: Rule;
}

// Keyed by reason, because the two reasons are checked to different depths. `mocks-modules` is
// verified in both directions; `process-global-registry` is accepted on its declared reason, since
// there is no honest pattern for "asserts process state". THE WEAKER CHECK IS DELIBERATE — its
// enforcement is review, not a regex — so do not close the gap by inventing a detector.
const tierReason = new Map(REGISTRY_ISOLATED_TESTS.map((t) => [t.path, t.reason]));
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

  const hoisted = Array.from(text.matchAll(HOISTED));
  const doMocks = Array.from(text.matchAll(DO_MOCK));
  const reason = tierReason.get(rel);
  const isolated = reason !== undefined;
  const mocksModules = hoisted.length > 0 || doMocks.length > 0;

  // Hoisted mocks are a violation only where the registry is shared.
  if (!isolated) for (const m of hoisted) record('hoisted-mock', m.index);
  // Both directions of the tier boundary, so membership is checked rather than remembered.
  if (mocksModules && !isolated) record('untiered-mock', (hoisted[0] ?? doMocks[0])!.index);
  if (reason === 'mocks-modules' && !mocksModules) record('stale-tier', 0);

  const mocked = new Set(doMocks.map((m) => m[1]));
  for (const m of hoisted) mocked.add(m[1]);
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
    `${pc.green('OK')} ${pc.bold('Test mocks are tier-correct and self-consistent')} ${pc.dim(`(${allowed} named escape${allowed === 1 ? '' : 's'} allow-listed)`)}`,
  );
  printHermeticityPointer();
  process.exit(0);
}

console.log(
  `${pc.yellow('!')} ${pc.bold(`${violations.length} mock-hygiene violation${violations.length === 1 ? '' : 's'} — these leak across files under isolate:false`)}\n`,
);
for (const v of violations) {
  console.log(`  ${pc.yellow('!')} ${pc.white(`${v.path}:${v.line}`)} ${pc.dim(RULE_MESSAGE[v.rule])}`);
}
console.log(
  `\n${pc.dim('If an escape is genuinely intentional and contained, add it to ALLOW in scripts/mocks.ts with a reason. Tier membership lives in scripts/registryIsolatedTests.ts; the rules are in vitest.config.ts.')}`,
);
printHermeticityPointer();
process.exit(checkMode ? 1 : 0);

function printHermeticityPointer(): void {
  console.log(
    pc.dim('  For the report-only inventory of tests rebuilding module graphs by hand, run npm run hermeticity.'),
  );
}

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
