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
  const hasValidHelper = hasValidAssertSyncVoidDeclaration(program as unknown as Node, text);

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
      const handled = collectHandledCalls(block, hasValidHelper);
      walk(block, (inner) => {
        if (inner.type !== 'CallExpression') return;
        const start = (inner as unknown as { start: number }).start;
        if (handled.has(inner)) return;
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
          'one unit = one call expression lexically inside a try block inside a destroy/dispose/destroy*/release* body, neither awaited, nor part of a chain ending in .catch/.then(_, _), nor in lexical tail position of a Promise-link (.then/.catch/.finally) callback whose rejection a strictly-later link handles — counted whatever else happens to its value, since assigning or returning the promise out of the try leaves the guard equally unable to catch; a candidate is NOT a claim that the callee returns a promise, which is not syntactically decidable and is settled by reading the API',
        scope:
          'every non-test .ts under packages/*/src, walked from the parsed AST; awaited calls, calls carrying their own rejection handler, and tail-position calls adopted by whitelisted Promise links into a chain handled strictly later are excluded by construction, not by roster; callbacks on other member calls, callbacks passed by reference, chains split across statements, and combinator forms such as Promise.all stay flagged because adoption is only read from lexical Promise-link semantics',
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
  lines.push(
    `${report.candidates.length} candidate${report.candidates.length === 1 ? '' : 's'} asserted empty across all packages; calls wrapped in a validated assertSyncVoid are excluded by structural sync-void proof, not by name or site`,
  );
  return lines.join('\n');
}

// Every call in this block whose rejection IS already handled — awaited, terminating
// a chain that ends in `.catch(…)` / `.then(onOk, onErr)`, or wrapped in a validated `assertSyncVoid`.
// The whole receiver chain counts as handled, so `wakeLock.request().catch(…)` clears the inner
// `request()` too rather than reporting it.
function collectHandledCalls(block: Readonly<Node>, hasValidHelper: boolean): Set<Node> {
  // Node identity is deliberate. Nested calls such as `factory()()` share a start offset, so an offset-only
  // key lets handling the outer call silently hide the inner one. Parsed node objects are unique, while the
  // receiver walk below still explicitly preserves the policy that `request().catch(…)` handles request.
  const handled = new Set<Node>();
  const awaited = new Set<Node>();
  walk(block, (node) => {
    if (node.type !== 'AwaitExpression') return;
    const argument = (node as unknown as { argument?: Node }).argument;
    if (argument?.type === 'CallExpression') awaited.add(argument);
  });
  walk(block, (node) => {
    if (node.type !== 'CallExpression') return;
    collectAdoptedCalls(node, awaited, handled);
  });
  walk(block, (node) => {
    if (node.type === 'AwaitExpression') {
      const argument = (node as unknown as { argument?: Node }).argument;
      if (argument?.type === 'CallExpression') handled.add(argument);
      return;
    }
    if (node.type !== 'CallExpression') return;
    if (hasValidHelper && isAssertSyncVoidCall(node)) {
      handled.add(node);
      const args = (node as unknown as { arguments?: unknown[] }).arguments;
      if (args !== undefined && args.length === 1) {
        const inner = args[0] as Node | undefined;
        if (inner?.type === 'CallExpression') handled.add(inner);
      }
      return;
    }
    if (!handlesRejection(node as unknown as { type: string })) return;
    // Mark this call and every call it is chained onto.
    let current: unknown = node;
    while (current !== null && typeof current === 'object') {
      const record = current as { type?: string; start?: number; callee?: unknown };
      if (record.type === 'CallExpression') handled.add(current as Node);
      const callee = record.callee as { type?: string; object?: unknown } | undefined;
      if (callee === undefined) break;
      current = callee.type === 'MemberExpression' ? callee.object : undefined;
      if (current === undefined) break;
    }
  });
  return handled;
}

// ★ PROMISE ADOPTION. A callback that RETURNS a promise has that promise adopted by the one its Promise
// link produces, so the rejection surfaces further down the same chain: in
// `p.then((m) => m.close()).catch(…)` the trailing `.catch` really does cover `m.close()`, and flagging it
// reports a defect that cannot happen. Verified against Node's `unhandledRejection` hook rather than
// reasoned about, because two of the rules below are the opposite of what they look like.
//
// Handled requires BOTH halves, and each is load-bearing on its own:
//
//   1. the call is in lexical TAIL position of the callback — `(m) => m.close()` or an explicit `return`.
//      `(m) => { m.close(); }` discards the promise and stays uncatchable.
//   2. a link STRICTLY AFTER that callback's own link handles rejection, or the whole chain is awaited.
//      `p.then((m) => m.close())` with nothing downstream is still an escaping rejection.
//
// Two traps, both confirmed by execution. `.then(onOk, onErr)` does NOT cover a rejection returned from its
// own `onOk` — the sibling handler guards the RECEIVER, so the search must start strictly after the link,
// never at it. And `.finally` adopts but never handles, so it must not end the search.
//
// Only whitelisted Promise links adopt callback results. An arbitrary member method such as `.map(…)` or
// `.tap(…)` may return something with a `.catch` member without adopting the callback's returned promise.
// Only the tail call itself is marked, never its receiver chain: in `(m) => foo().bar()` a rejection from
// `foo()` has no handler attached to it at all, and marking the chain would hide exactly the defect this
// gate exists to find.
function collectAdoptedCalls(node: Readonly<Node>, awaited: ReadonlySet<Node>, handled: Set<Node>): void {
  const links = chainLinks(node);
  const outermost = links[0];
  const chainAwaited = outermost !== undefined && awaited.has(outermost);
  for (let index = 0; index < links.length; index++) {
    const downstreamHandles = links.slice(0, index).some((link) => handlesRejection(link));
    if (!downstreamHandles && !chainAwaited) continue;
    for (const argument of promiseLinkCallbacks(links[index])) {
      for (const call of tailPositionCalls(argument)) handled.add(call);
    }
  }
}

// Callback positions whose returned values native Promise links adopt into their result promise.
// Property names outside this closed list remain candidates because syntax cannot prove their semantics.
function promiseLinkCallbacks(expression: Readonly<Node>): unknown[] {
  const call = expression as unknown as {
    arguments?: unknown[];
    callee?: { type?: string; property?: { name?: string } };
  };
  if (call.callee?.type !== 'MemberExpression') return [];
  const args = call.arguments ?? [];
  switch (call.callee.property?.name) {
    case 'then':
      return args.slice(0, 2);
    case 'catch':
    case 'finally':
      return args.slice(0, 1);
    default:
      return [];
  }
}

// The call links of one member chain, outermost first: `a().b().c()` → [c, b, a]. Anything that is not a
// call (a bare identifier receiver) ends the chain.
function chainLinks(node: Readonly<Node>): Node[] {
  const links: Node[] = [];
  let current: unknown = node;
  while (current !== null && typeof current === 'object') {
    const record = current as { type?: string; callee?: unknown };
    if (record.type !== 'CallExpression') break;
    links.push(current as Node);
    const callee = record.callee as { type?: string; object?: unknown } | undefined;
    if (callee?.type !== 'MemberExpression') break;
    current = callee.object;
  }
  return links;
}

// Calls a function argument would RETURN, and so hand to the enclosing Promise link.
function tailPositionCalls(argument: unknown): Node[] {
  const fn = argument as { type?: string; body?: unknown } | null;
  if (fn === null || (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression')) return [];
  const found: Node[] = [];
  const body = fn.body as { type?: string } | undefined;
  if (body?.type === 'BlockStatement') {
    for (const returned of returnedExpressions(body)) collectTailCalls(returned, found);
  } else {
    collectTailCalls(fn.body, found);
  }
  return found;
}

// Every `return` argument lexically inside this body, WITHOUT descending into a nested function — a
// returned arrow is a function, not a promise, and nothing inside it has run.
function returnedExpressions(body: Readonly<{ type?: string }>): unknown[] {
  const found: unknown[] = [];
  const stack: unknown[] = [body];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    const record = current as Record<string, unknown>;
    const type = record.type;
    if (type === 'ArrowFunctionExpression' || type === 'FunctionExpression' || type === 'FunctionDeclaration') {
      continue;
    }
    if (type === 'ReturnStatement') {
      if (record.argument !== null && record.argument !== undefined) found.push(record.argument);
      continue;
    }
    for (const key in record) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = record[key];
      if (value !== null && typeof value === 'object') stack.push(value);
    }
  }
  return found;
}

// Descends only through forms that pass a value through unchanged, so the promise really is the one the
// callback returns. `void x`, array and object literals are all deliberately absent: each produces a NEW
// value, the promise is dropped, and its rejection escapes — all three verified by execution.
function collectTailCalls(expression: unknown, found: Node[]): void {
  const node = expression as Node | null;
  if (node === null || typeof node !== 'object') return;
  const record = node as unknown as Record<string, unknown>;
  switch (node.type) {
    case 'CallExpression':
      found.push(node);
      return;
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSNonNullExpression':
    case 'TSSatisfiesExpression':
    case 'AwaitExpression':
      collectTailCalls(record.expression ?? record.argument, found);
      return;
    case 'ConditionalExpression':
      collectTailCalls(record.consequent, found);
      collectTailCalls(record.alternate, found);
      return;
    case 'LogicalExpression':
      collectTailCalls(record.right, found);
      return;
    case 'SequenceExpression': {
      const expressions = record.expressions as unknown[] | undefined;
      if (expressions !== undefined && expressions.length > 0) collectTailCalls(expressions.at(-1), found);
      return;
    }
    default:
      return;
  }
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

function isAssertSyncVoidCall(node: Readonly<Node>): boolean {
  const call = node as unknown as { callee?: { type?: string; name?: string } };
  return call.callee?.type === 'Identifier' && call.callee.name === 'assertSyncVoid';
}

// Validates the FULL AST shape of a local `assertSyncVoid` declaration: generic `IsAny` guard,
// conditional parameter type rejecting Promise/any/unknown, return void, AND single `void value` body.
// An arbitrary same-name function with a different signature or body is NOT recognized.
export function hasValidAssertSyncVoidDeclaration(program: Readonly<Node>, _text: string): boolean {
  const body = asAstNode(program).body as unknown[] | undefined;
  const canonicalIsAnyCount = body?.filter((node) => isCanonicalIsAnyDeclaration(node as Node)).length ?? 0;
  const canonicalHelperCount = body?.filter((node) => isCanonicalAssertSyncVoidDeclaration(node as Node)).length ?? 0;
  let assertSyncVoidBindings = 0;
  let assertSyncVoidWrites = 0;
  let isAnyBindings = 0;
  walk(program, (node) => {
    assertSyncVoidBindings += countValueBindingsNamed(node, 'assertSyncVoid');
    assertSyncVoidWrites += countValueWritesNamed(node, 'assertSyncVoid');
    isAnyBindings += countTypeBindingsNamed(node, 'IsAny');
  });
  return (
    canonicalIsAnyCount === 1 &&
    canonicalHelperCount === 1 &&
    assertSyncVoidBindings === 1 &&
    assertSyncVoidWrites === 0 &&
    isAnyBindings === 1
  );
}

function isCanonicalAssertSyncVoidDeclaration(node: Readonly<Node>): boolean {
  const fn = asAstNode(node);
  if (fn.type !== 'FunctionDeclaration' || identifierName(fn.id) !== 'assertSyncVoid') return false;
  if (fn.async === true || fn.generator === true) return false;
  if (!hasSingleTypeParameter(fn.typeParameters, 'T')) return false;

  const params = fn.params as unknown[] | undefined;
  if (params?.length !== 1) return false;
  const param = asAstNode(params[0]);
  if (param.type !== 'Identifier' || param.name !== 'value') return false;
  const parameterType = unwrapTypeAnnotation(param.typeAnnotation);
  if (parameterType.type !== 'TSIntersectionType') return false;
  const intersections = parameterType.types as unknown[] | undefined;
  if (intersections?.length !== 2 || !isTypeReference(intersections[0], 'T')) return false;
  const guard = unwrapParenthesizedType(intersections[1]);
  if (guard.type !== 'TSConditionalType') return false;
  if (!isTypeReference(guard.checkType, 'IsAny', 'T')) return false;
  if (!isBooleanLiteralType(guard.extendsType, true) || nodeType(guard.trueType) !== 'TSNeverKeyword') return false;
  const voidGuard = asAstNode(guard.falseType);
  if (voidGuard.type !== 'TSConditionalType' || !isTypeReference(voidGuard.checkType, 'T')) return false;
  if (nodeType(voidGuard.extendsType) !== 'TSVoidKeyword') return false;
  if (nodeType(voidGuard.trueType) !== 'TSUnknownKeyword' || nodeType(voidGuard.falseType) !== 'TSNeverKeyword') {
    return false;
  }

  if (unwrapTypeAnnotation(fn.returnType).type !== 'TSVoidKeyword') return false;
  const body = asAstNode(fn.body);
  const statements = body.body as unknown[] | undefined;
  if (body.type !== 'BlockStatement' || statements?.length !== 1) return false;
  const statement = asAstNode(statements[0]);
  const expression = asAstNode(statement.expression);
  return (
    statement.type === 'ExpressionStatement' &&
    expression.type === 'UnaryExpression' &&
    expression.operator === 'void' &&
    identifierName(expression.argument) === 'value'
  );
}

function isCanonicalIsAnyDeclaration(node: Readonly<Node>): boolean {
  const alias = asAstNode(node);
  if (alias.type !== 'TSTypeAliasDeclaration' || identifierName(alias.id) !== 'IsAny') return false;
  if (!hasSingleTypeParameter(alias.typeParameters, 'T')) return false;
  const conditional = asAstNode(alias.typeAnnotation);
  if (conditional.type !== 'TSConditionalType' || !isNumberLiteralType(conditional.checkType, 0)) return false;
  const intersection = asAstNode(conditional.extendsType);
  const types = intersection.types as unknown[] | undefined;
  return (
    intersection.type === 'TSIntersectionType' &&
    types?.length === 2 &&
    isNumberLiteralType(types[0], 1) &&
    isTypeReference(types[1], 'T') &&
    isBooleanLiteralType(conditional.trueType, true) &&
    isBooleanLiteralType(conditional.falseType, false)
  );
}

interface AstNode {
  [key: string]: unknown;
  type?: string;
}

function asAstNode(value: unknown): AstNode {
  return value !== null && typeof value === 'object' ? (value as AstNode) : {};
}

function bindingPatternContainsName(value: unknown, name: string): boolean {
  const pattern = asAstNode(value);
  if (pattern.type === 'Identifier') return pattern.name === name;
  if (pattern.type === 'AssignmentPattern') return bindingPatternContainsName(pattern.left, name);
  if (pattern.type === 'RestElement') return bindingPatternContainsName(pattern.argument, name);
  if (pattern.type === 'ArrayPattern') {
    return ((pattern.elements as unknown[] | undefined) ?? []).some((element) =>
      bindingPatternContainsName(element, name),
    );
  }
  if (pattern.type === 'ObjectPattern') {
    return ((pattern.properties as unknown[] | undefined) ?? []).some((property) => {
      const item = asAstNode(property);
      return bindingPatternContainsName(item.value ?? item.argument, name);
    });
  }
  return false;
}

function countTypeBindingsNamed(node: Readonly<Node>, name: string): number {
  const candidate = asAstNode(node);
  if (
    candidate.type === 'TSTypeAliasDeclaration' ||
    candidate.type === 'TSInterfaceDeclaration' ||
    candidate.type === 'TSEnumDeclaration'
  ) {
    return identifierName(candidate.id) === name ? 1 : 0;
  }
  return 0;
}

function countValueWritesNamed(node: Readonly<Node>, name: string): number {
  const candidate = asAstNode(node);
  if (candidate.type === 'AssignmentExpression' && bindingPatternContainsName(candidate.left, name)) return 1;
  if (candidate.type === 'UpdateExpression' && bindingPatternContainsName(candidate.argument, name)) return 1;
  return 0;
}

function countValueBindingsNamed(node: Readonly<Node>, name: string): number {
  const candidate = asAstNode(node);
  let count = 0;
  if (
    candidate.type === 'FunctionDeclaration' ||
    candidate.type === 'FunctionExpression' ||
    candidate.type === 'ClassDeclaration' ||
    candidate.type === 'ClassExpression'
  ) {
    if (identifierName(candidate.id) === name) count += 1;
  } else if (candidate.type === 'VariableDeclarator') {
    if (bindingPatternContainsName(candidate.id, name)) count += 1;
  } else if (
    candidate.type === 'ImportSpecifier' ||
    candidate.type === 'ImportDefaultSpecifier' ||
    candidate.type === 'ImportNamespaceSpecifier'
  ) {
    if (identifierName(candidate.local) === name) count += 1;
  } else if (candidate.type === 'CatchClause' && bindingPatternContainsName(candidate.param, name)) {
    count += 1;
  }

  if (
    candidate.type === 'FunctionDeclaration' ||
    candidate.type === 'FunctionExpression' ||
    candidate.type === 'ArrowFunctionExpression'
  ) {
    for (const param of (candidate.params as unknown[] | undefined) ?? []) {
      if (bindingPatternContainsName(param, name)) count += 1;
    }
  }
  return count;
}

function hasSingleTypeParameter(value: unknown, name: string): boolean {
  const declaration = asAstNode(value);
  const params = declaration?.params as unknown[] | undefined;
  return (
    declaration?.type === 'TSTypeParameterDeclaration' &&
    params?.length === 1 &&
    identifierName(asAstNode(params[0]).name) === name
  );
}

function identifierName(value: unknown): string | undefined {
  const identifier = asAstNode(value);
  return identifier?.type === 'Identifier' ? (identifier.name as string | undefined) : undefined;
}

function isBooleanLiteralType(value: unknown, expected: boolean): boolean {
  const literalType = asAstNode(value);
  const literal = asAstNode(literalType.literal);
  return literalType?.type === 'TSLiteralType' && literal?.type === 'Literal' && literal.value === expected;
}

function isNumberLiteralType(value: unknown, expected: number): boolean {
  const literalType = asAstNode(value);
  const literal = asAstNode(literalType.literal);
  return literalType?.type === 'TSLiteralType' && literal?.type === 'Literal' && literal.value === expected;
}

function isTypeReference(value: unknown, name: string, typeArgument?: string): boolean {
  const reference = asAstNode(value);
  if (reference?.type !== 'TSTypeReference' || identifierName(reference.typeName) !== name) return false;
  const rawArguments = reference.typeArguments;
  const argumentsNode = asAstNode(rawArguments);
  const params = argumentsNode?.params as unknown[] | undefined;
  return typeArgument === undefined
    ? rawArguments === null || rawArguments === undefined
    : argumentsNode?.type === 'TSTypeParameterInstantiation' &&
        params?.length === 1 &&
        isTypeReference(params[0], typeArgument);
}

function nodeType(value: unknown): string | undefined {
  return asAstNode(value).type;
}

function unwrapParenthesizedType(value: unknown): AstNode {
  const type = asAstNode(value);
  return type.type === 'TSParenthesizedType' ? asAstNode(type.typeAnnotation) : type;
}

function unwrapTypeAnnotation(value: unknown): AstNode {
  const type = asAstNode(value);
  return type.type === 'TSTypeAnnotation' ? asAstNode(type.typeAnnotation) : type;
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
