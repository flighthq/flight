import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSync } from 'oxc-parser';
import pc from 'picocolors';

import { SCAN_SKIP_DIRECTORIES } from './scanSkipDirectories';
import { filterPaths, getSelectors } from './select';

// Portable-subset gate. Flight is authored to lower to a **C++-family compiled target** (and Rust/Haxe;
// the Python binding rides the resulting C ABI). See [portability](../agents/portability.md) for why the
// substrate is the TS AST + thin per-target backends, not Haxe. This check is the *contract* of that
// substrate: it fails when shipped source drifts out of the lowerable subset by using a **dynamic escape**
// with no compiled-target equivalent.
//
// It is deliberately NOT a C99 subset — closures, `async`/`await`, generics, `Map`/`Set`, and classes all
// lower to C++/Rust/Haxe and are used pervasively on purpose; banning them would forbid the foundation.
// (The await handling is settled in `flight-hx`; not gated here.) What it bans is the small set of
// genuinely non-lowerable runtime-dynamic constructs — measured, in shipped source, to be near-zero
// already, so this ratifies existing conformance and blocks regression.
//
// AST-based (via oxc-parser) so comments/strings and property names never false-positive: `page.$eval(...)`
// is a member call, not `eval`; `Object.prototype.hasOwnProperty.call(...)` is a *read*, not a prototype
// *assignment*. Genuinely-intentional escapes are named in ALLOW below with a reason, never silently
// skipped. Tooling (`tool-*`), tests, and test-helper mocks are out of the ported set and skipped.

type Rule = 'eval' | 'function-constructor' | 'proxy' | 'reflect' | 'with' | 'prototype-assign' | 'structured-clone';

const RULE_MESSAGE: Record<Rule, string> = {
  eval: '`eval()` — dynamic code execution has no compiled-target equivalent',
  'function-constructor': '`new Function()` — dynamic code construction does not lower',
  proxy: '`new Proxy()` — runtime interception has no compiled-target equivalent',
  reflect: '`Reflect.*` — runtime reflection does not lower; use a static call',
  with: '`with` statement — dynamic scope does not lower',
  'prototype-assign': 'assignment to a `*.prototype` member — monkey-patching does not lower; extend statically',
  'structured-clone': '`structuredClone()` — no compiled-target builtin; use an explicit deep-clone or a seam',
};

// Named exceptions: an escape that is genuinely intentional and contained. Each carries its reason so the
// exemption is a documented decision, not a fuzzy name-skip.
const ALLOW: { rule: Rule; match: (rel: string) => boolean; why: string }[] = [
  {
    rule: 'proxy',
    match: (rel) => rel === 'packages/entity/src/guards.ts',
    why: 'opt-in, separately-importable dev-diagnostic guard layer (not on any core path); a compiled port implements guards per-target or omits them',
  },
  {
    rule: 'structured-clone',
    match: (rel) => rel.startsWith('packages/snapshot/src/'),
    why: 'the deep-clone/freeze primitive; lowers to an explicit per-target deep-clone (or a seam), contained to one package',
  },
];

// The shared generated-output set, plus the four this scan skips for its own reasons: agent and editor
// state, and sibling checkouts whose sources are not this tree's to judge. This walk is rooted at
// `packages/`, so the shared entries are defensive rather than load-bearing here — it shares the set so
// the list cannot drift into a fifth spelling, which is the whole reason the set was extracted.
const IGNORED_DIRS = new Set([...SCAN_SKIP_DIRECTORIES, '.claude', '.quimby', 'worktrees', 'incoming']);

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const checkMode = process.argv.includes('--check');
const jsonMode = process.argv.includes('--json');

interface Violation {
  path: string;
  line: number;
  rule: Rule;
}

const violations: Violation[] = [];
let allowed = 0;

for (const path of getSourceFiles()) {
  const rel = relative(root, path).replaceAll('\\', '/');
  const text = readFileSync(path, 'utf-8');
  if (!mightContainEscape(text)) continue;
  const { program } = parseSync(path, text, {
    sourceType: 'module',
    lang: path.endsWith('.tsx') ? 'tsx' : 'ts',
  });
  if (!program) continue;

  visit(program, (node) => {
    const rule = violationOf(node);
    if (rule === null) return;
    if (ALLOW.some((a) => a.rule === rule && a.match(rel))) {
      allowed++;
      return;
    }
    violations.push({ path: rel, line: lineOf(text, node.start as number), rule });
  });
}

violations.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);

if (jsonMode) {
  console.log(JSON.stringify({ passed: violations.length === 0, allowed, violations }, null, 2));
  process.exit(violations.length > 0 && checkMode ? 1 : 0);
}

if (violations.length === 0) {
  console.log(
    `${pc.green('OK')} ${pc.bold('Source is within the portable (C++-lowerable) subset')} ${pc.dim(`(${allowed} named escape${allowed === 1 ? '' : 's'} allow-listed)`)}`,
  );
  process.exit(0);
}

console.log(
  `${pc.yellow('!')} ${pc.bold(`${violations.length} portable-subset escape${violations.length === 1 ? '' : 's'} — not lowerable to a compiled target`)}\n`,
);
for (const v of violations) {
  console.log(`  ${pc.yellow('!')} ${pc.white(`${v.path}:${v.line}`)} ${pc.dim(RULE_MESSAGE[v.rule])}`);
}
console.log(
  `\n${pc.dim('If an escape is genuinely intentional and contained, add it to ALLOW in scripts/portable.ts with a reason. See agents/portability.md.')}`,
);
process.exit(checkMode ? 1 : 0);

// Parsing is retained as the authority, but most source files cannot possibly contain one of the
// seven named escapes. This conservative token screen avoids materializing thousands of irrelevant
// ASTs while comments and strings in the smaller candidate set remain false-positive safe.
function mightContainEscape(text: string): boolean {
  return /\b(?:eval|Function|Proxy|Reflect|structuredClone|with)\b|\.prototype\b/.test(text);
}

// The lowerable-subset escapes, by AST node. Unwraps TS cast/paren wrappers so `(x.prototype as T).y = …`
// and `(eval as F)(…)` are still caught.
function violationOf(node: AstNode): Rule | null {
  switch (node.type) {
    case 'CallExpression': {
      const callee = unwrap(node.callee);
      if (callee?.type === 'Identifier') {
        if (callee.name === 'eval') return 'eval';
        if (callee.name === 'structuredClone') return 'structured-clone';
      }
      return null;
    }
    case 'NewExpression': {
      const callee = unwrap(node.callee);
      if (callee?.type === 'Identifier') {
        if (callee.name === 'Proxy') return 'proxy';
        if (callee.name === 'Function') return 'function-constructor';
      }
      return null;
    }
    case 'MemberExpression': {
      const object = unwrap(node.object);
      return object?.type === 'Identifier' && object.name === 'Reflect' ? 'reflect' : null;
    }
    case 'WithStatement':
      return 'with';
    case 'AssignmentExpression':
      return isPrototypeAssign(node.left) ? 'prototype-assign' : null;
    default:
      return null;
  }
}

// True when the assignment target writes a `*.prototype` member (monkey-patching) — the left-hand member
// chain contains a `.prototype` step under the written property. A plain `a.b = 1` (object is an
// Identifier) is not; a `.prototype.hasOwnProperty.call(…)` read is a CallExpression, never seen here.
function isPrototypeAssign(left: AstNode | undefined): boolean {
  const target = unwrap(left);
  if (target?.type !== 'MemberExpression') return false;
  let current = unwrap(target.object);
  while (current?.type === 'MemberExpression') {
    if (!current.computed && current.property?.type === 'Identifier' && current.property.name === 'prototype') {
      return true;
    }
    current = unwrap(current.object);
  }
  return false;
}

function unwrap(node: AstNode | undefined): AstNode | undefined {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'ParenthesizedExpression')
  ) {
    current = current.expression;
  }
  return current;
}

// Recursively visits every AST node, calling `cb` on each. Skips the numeric span fields.
function visit(node: unknown, cb: (node: AstNode) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) visit(child, cb);
    return;
  }
  const typed = node as AstNode;
  if (typeof typed.type === 'string') cb(typed);
  for (const key in typed) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    visit((typed as Record<string, unknown>)[key], cb);
  }
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

// Shipped-and-ported source only: `packages/*/src`, excluding tests, tooling (`tool-*`), and test-helper
// mocks — none of which are lowered to a compiled target. Then apply the shared selector so lint-staged
// and `npm run check <pkg>` scope identically to every other quality script.
function getSourceFiles(): string[] {
  const files: string[] = [];
  walk(join(root, 'packages'), files);
  const scoped = files.filter((path) => {
    const rel = relative(root, path).replaceAll('\\', '/');
    if (!/^packages\/[^/]+\/src\//.test(rel)) return false;
    if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) return false;
    if (rel.startsWith('packages/tool-')) return false;
    if (/testhelper\.ts$/i.test(rel)) return false;
    return true;
  });
  return filterPaths(scoped, getSelectors()).sort();
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
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) out.push(path);
  }
}

// The ESTree fields this script reads, typed; every other field stays `unknown` via the index signature
// (the generic `visit` walk reads them without caring about their shape).
interface AstNode {
  type: string;
  callee?: AstNode;
  object?: AstNode;
  left?: AstNode;
  property?: AstNode;
  expression?: AstNode;
  computed?: boolean;
  name?: string;
  start?: number;
  [key: string]: unknown;
}
