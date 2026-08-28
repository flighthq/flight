import type { Node } from 'oxc-parser';

import { formatGateProvenance, readGateTreeState } from './gate-provenance';
import { getParsedOxcSource } from './oxc-source';

// Un-awaited promises inside a teardown `try`.
//
// ★ THE DEFECT THIS FINDS is a guard that cannot fire. `try { p(); } catch { … }` around a call that
// returns a promise catches only a SYNCHRONOUS throw: by the time the promise rejects, the try block
// has long exited, so the rejection escapes as an unhandled rejection and teardown reports success it
// never had. The code reads as guarded, which is why review misses it — the catch is right there.
//
// ★ WHAT IS AND IS NOT DECIDABLE HERE. "Returns a promise" is NOT a syntactic property: `electron`,
// `navigator.wakeLock` and the Tauri menu module are ambient, and their return types live outside the
// file. So this scan does not claim to identify promises. It identifies the SHAPE that makes a
// rejection uncatchable — a call whose result is discarded, inside a try, not awaited and not chained
// to a handler — and reports it as a CANDIDATE. Whether each candidate returns a promise is settled by
// reading the API, and the audit records that judgement per row. A scan that guessed would be a
// detector with no stated population; this one states its population exactly.
//
// Deciding NOT to flag is the other half: an `await`ed call is guarded by the enclosing try, and a call
// chained to `.catch(…)` carries its own handler. Both are correct and both are excluded, so the
// findings are the residue rather than a list of every call in a teardown.

export interface TeardownRejectionCandidate {
  // The teardown function the candidate sits in, as written (`destroy`, `destroyMenuBackend`, …).
  teardown: string;
  callee: string;
  column: number;
  line: number;
  path: string;
}

export interface TeardownRejectionReport {
  candidates: readonly TeardownRejectionCandidate[];
  // Teardown bodies scanned, whether or not they contained a try.
  teardownsScanned: number;
  scannedFiles: number;
}

// The names that make a function a teardown path. `destroy`/`dispose` are the members themselves;
// `destroy*` covers both the package-level `destroy*Backend` paths those members are reached through and
// per-object teardowns like `destroySource`, where a swallowed rejection is just as invisible.
//
// ★ THE `release*` ARM IS DELIBERATELY NARROW. `release` is an ordinary operation verb in this SDK — the
// reserved pool/cache bracket — so matching every `release*` swept in plain API methods:
// `releaseSingleInstanceLock` is an `AppBackend` operation, present in all four hosts, and counting it
// inflated the teardown denominator with functions that tear nothing down. Only the backend-release
// helpers (`releaseMediaSessionBackends`, `releaseAccessibilityBackends`) are teardown paths.
export function isTeardownFunctionName(name: string): boolean {
  if (name === 'destroy' || name === 'dispose') return true;
  if (/^release[A-Z][A-Za-z0-9]*Backends?$/.test(name)) return true;
  return /^destroy[A-Z][A-Za-z0-9]*$/.test(name);
}

export function createEmptyTeardownRejectionReport(): TeardownRejectionReport {
  return { candidates: [], scannedFiles: 0, teardownsScanned: 0 };
}

// Scans one file and returns every candidate in it.
export function scanTeardownRejections(filePath: string): {
  candidates: TeardownRejectionCandidate[];
  teardowns: number;
} {
  const { program, text } = getParsedOxcSource(filePath);
  const candidates: TeardownRejectionCandidate[] = [];
  let teardowns = 0;

  // Walks a teardown body looking for try statements, then collects the uncatchable shapes inside them.
  //
  // ★ A DISCARDED RESULT IS NOT THE ONLY UNCATCHABLE SHAPE, and scoping to it under-reports. The
  // motivating live case assigns the promise and returns it — `const result = popup(…); return result;`
  // inside a try — where the guard is just as unable to catch the rejection. So every call in the try is
  // a candidate unless it is awaited or carries its own handler, regardless of what happens to its value.
  function collectFromTeardown(body: Node, teardown: string): void {
    walk(body, (node) => {
      if (node.type !== 'TryStatement') return;
      const block = node.block as unknown as Node;
      const handled = collectHandledCalls(block);
      walk(block, (inner) => {
        if (inner.type !== 'CallExpression') return;
        const start = (inner as unknown as { start: number }).start;
        if (handled.has(start)) return;
        const { column, line } = positionOf(text, start);
        candidates.push({
          callee: calleeText(text, inner as unknown as { type: string }),
          column,
          line,
          path: filePath,
          teardown,
        });
      });
    });
  }

  walk(program as unknown as Node, (node) => {
    const teardown = teardownOf(node);
    if (teardown === null) return;
    teardowns++;
    collectFromTeardown(teardown.body, teardown.name);
  });

  return { candidates, teardowns };
}

export function createTeardownRejectionReport(filePaths: readonly string[]): TeardownRejectionReport {
  const candidates: TeardownRejectionCandidate[] = [];
  let teardownsScanned = 0;
  for (const filePath of filePaths) {
    const result = scanTeardownRejections(filePath);
    candidates.push(...result.candidates);
    teardownsScanned += result.teardowns;
  }
  return { candidates, scannedFiles: filePaths.length, teardownsScanned };
}

export function formatTeardownRejectionReport(report: Readonly<TeardownRejectionReport>): string {
  const lines = [
    formatGateProvenance(
      {
        command: 'npx vitest run scripts/teardown-rejection.test.ts (scripts/teardown-rejection-core.ts)',
        counting:
          'one unit = one call expression lexically inside a try block inside a destroy/dispose/destroy*/release* body, neither awaited nor part of a chain ending in .catch/.then(_, _) — counted whatever happens to its value, since assigning or returning the promise leaves the guard equally unable to catch; a candidate is NOT a claim that the callee returns a promise, which is not syntactically decidable and is settled by reading the API',
        scope:
          'every non-test .ts under packages/*/src, walked from the parsed AST; awaited calls and calls carrying their own rejection handler are excluded by construction, not by roster',
      },
      readGateTreeState(process.cwd()),
    ),
    `${report.candidates.length} uncatchable-rejection candidate${report.candidates.length === 1 ? '' : 's'} across ${report.teardownsScanned} teardown bodies in ${report.scannedFiles} files`,
  ];
  for (const candidate of report.candidates) {
    lines.push(
      `  ${candidate.path}:${candidate.line}:${candidate.column} ${candidate.teardown}() → ${candidate.callee}`,
    );
  }
  return lines.join('\n');
}

// Start offsets of every call in this block whose rejection IS already handled — awaited, or terminating
// a chain that ends in `.catch(…)` / `.then(onOk, onErr)`. The whole receiver chain counts as handled,
// so `wakeLock.request().catch(…)` clears the inner `request()` too rather than reporting it.
function collectHandledCalls(block: Readonly<Node>): Set<number> {
  const handled = new Set<number>();
  walk(block, (node) => {
    if (node.type === 'AwaitExpression') {
      const argument = (node as unknown as { argument?: { type?: string; start?: number } }).argument;
      if (argument?.type === 'CallExpression' && argument.start !== undefined) handled.add(argument.start);
      return;
    }
    if (node.type !== 'CallExpression') return;
    if (!handlesRejection(node as unknown as { type: string })) return;
    // Mark this call and every call it is chained onto.
    let current: unknown = node;
    while (current !== null && typeof current === 'object') {
      const record = current as { type?: string; start?: number; callee?: unknown };
      if (record.type === 'CallExpression' && record.start !== undefined) handled.add(record.start);
      const callee = record.callee as { type?: string; object?: unknown } | undefined;
      if (callee === undefined) break;
      current = callee.type === 'MemberExpression' ? callee.object : undefined;
      if (current === undefined) break;
    }
  });
  return handled;
}

// True when this call is itself a rejection handler: `.catch(…)`, or `.then(onOk, onErr)`.
function handlesRejection(expression: Readonly<{ type: string }>): boolean {
  const callee = (expression as unknown as { callee?: { type?: string; property?: { name?: string } } }).callee;
  if (callee === undefined || callee.type !== 'MemberExpression') return false;
  const property = callee.property?.name;
  if (property === 'catch') return true;
  if (property !== 'then') return false;
  // `then` guards a rejection only with a second argument; `then(onFulfilled)` leaves it unhandled.
  return ((expression as unknown as { arguments?: unknown[] }).arguments?.length ?? 0) >= 2;
}

function calleeText(text: string, expression: Readonly<{ type: string }>): string {
  const callee = (expression as unknown as { callee?: { start: number; end: number } }).callee;
  if (callee === undefined) return '<unknown>';
  return text.slice(callee.start, callee.end).replace(/\s+/g, ' ');
}

function positionOf(text: string, offset: number): { column: number; line: number } {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index++) {
    if (text[index] === '\n') {
      line++;
      lineStart = index + 1;
    }
  }
  return { column: offset - lineStart + 1, line };
}

// The name and body of a teardown function, or null when this node is not one.
//
// The body is deliberately read per node kind rather than assumed: oxc puts a standalone function's
// body on the node, but an object-literal method's body on `value`, and reading only the former
// silently scanned nothing for every backend in the repo — they are all object literals.
function teardownOf(node: Readonly<Node>): { body: Node; name: string } | null {
  const candidate = node as unknown as {
    type: string;
    id?: { name?: string };
    key?: { name?: string };
    body?: Node;
    value?: { body?: Node };
  };
  if (candidate.type === 'FunctionDeclaration') {
    const name = candidate.id?.name;
    if (name === undefined || !isTeardownFunctionName(name) || candidate.body === undefined) return null;
    return { body: candidate.body, name };
  }
  // `destroy() { … }` in an object literal, `destroy: () => { … }`, and a class method alike.
  if (candidate.type === 'ObjectProperty' || candidate.type === 'Property' || candidate.type === 'MethodDefinition') {
    const name = candidate.key?.name;
    const body = candidate.value?.body;
    if (name === undefined || !isTeardownFunctionName(name) || body === undefined) return null;
    return { body, name };
  }
  return null;
}

// Depth-first walk over every child node, without needing a per-type visitor table.
function walk(node: Readonly<Node>, visit: (node: Node) => void): void {
  const stack: unknown[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    const record = current as Record<string, unknown>;
    if (typeof record.type === 'string') visit(current as Node);
    for (const key in record) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = record[key];
      if (value !== null && typeof value === 'object') stack.push(value);
    }
  }
}
