// Prevents SDK production code from silently bypassing an installed host transport. The allowed
// population is structural: a direct web primitive is legal only while lexically enclosed by a
// `createWeb*Backend` implementation. There is no file/site allowlist, so moving the same call into an
// ordinary helper makes it a violation even when that helper happens to be called by a web backend.
//
// The file population is derived from tracked and untracked package source on every run. Tests,
// declaration files, and the `tool-*` family are excluded by role rather than by path roster: tests are
// independent transport oracles, declarations execute nothing, and tooling is deliberately outside the
// SDK/host seam. The report names every exclusion class and every allowed primitive site so a clean zero
// cannot hide a smaller scan.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import ts from 'typescript';

import { formatGateProvenance, readGateTreeState } from './gate-provenance';

export type TransportPrimitive = 'EventSource' | 'fetch' | 'Image' | 'Request' | 'WebSocket' | 'XMLHttpRequest';

export type TransportSourceExclusionReason = 'declaration-source' | 'test-source' | 'tooling-package';

export interface TransportSource {
  path: string;
  text: string;
}

export interface TransportSourceExclusion {
  path: string;
  reason: TransportSourceExclusionReason;
}

export interface TransportPrimitiveSite {
  column: number;
  enclosingWebBackend: string | null;
  line: number;
  path: string;
  primitive: TransportPrimitive;
}

export interface TransportBypassReport {
  allowed: readonly TransportPrimitiveSite[];
  excluded: readonly TransportSourceExclusion[];
  scannedFiles: number;
  violations: readonly TransportPrimitiveSite[];
}

const CONSTRUCTOR_PRIMITIVES = new Set<TransportPrimitive>([
  'EventSource',
  'Image',
  'Request',
  'WebSocket',
  'XMLHttpRequest',
]);
const GLOBAL_OBJECTS = new Set(['global', 'globalThis', 'self', 'window']);
const WEB_BACKEND_NAME = /^createWeb[A-Za-z0-9]*Backend$/;
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const TEST_SOURCE = /(?:^|\/)(?:__tests__|tests?)(?:\/|$)|\.(?:spec|test)\.(?:[cm]?[jt]s|[jt]sx)$/;

export function checkTransportBypasses(inputs: readonly TransportSource[]): TransportBypassReport {
  const allowed: TransportPrimitiveSite[] = [];
  const excluded: TransportSourceExclusion[] = [];
  const violations: TransportPrimitiveSite[] = [];
  let scannedFiles = 0;

  for (const input of [...inputs].sort((a, b) => a.path.localeCompare(b.path))) {
    const exclusion = exclusionReason(input.path);
    if (exclusion !== null) {
      excluded.push({ path: input.path, reason: exclusion });
      continue;
    }
    scannedFiles++;
    const source = ts.createSourceFile(input.path, input.text, ts.ScriptTarget.Latest, true, scriptKind(input.path));
    visit(source, (node) => {
      const primitive = primitiveAt(node);
      if (primitive === null) return;
      const backend = enclosingWebBackendName(node);
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      const site: TransportPrimitiveSite = {
        column: position.character + 1,
        enclosingWebBackend: backend,
        line: position.line + 1,
        path: input.path,
        primitive,
      };
      if (backend === null) violations.push(site);
      else allowed.push(site);
    });
  }

  return {
    allowed: allowed.sort(compareSites),
    excluded: excluded.sort((a, b) => a.path.localeCompare(b.path)),
    scannedFiles,
    violations: violations.sort(compareSites),
  };
}

export function formatTransportBypassReport(report: Readonly<TransportBypassReport>): string {
  const passed = report.violations.length === 0;
  const exclusionCounts = countExclusions(report.excluded);
  const lines = [
    formatGateProvenance(
      {
        command: 'npm run check:transport-bypasses (scripts/check-transport-bypasses.ts)',
        counting:
          'one unit = one production source file scanned; a violation is one call site of a listed primitive not lexically enclosed by a createWeb*Backend function',
        scope:
          'tracked and untracked packages/*/src source, derived on every run; declaration source, test source and the tool-* family excluded by role, never by path roster',
      },
      readGateTreeState(process.cwd()),
    ),
    `${passed ? pc.green('OK') : pc.yellow('!')} ${pc.bold('Direct web transports stay inside createWeb*Backend implementations')} ${pc.dim(`(${report.scannedFiles} production files scanned, ${report.allowed.length} backend site${report.allowed.length === 1 ? '' : 's'} allowed, ${report.excluded.length} source file${report.excluded.length === 1 ? '' : 's'} excluded)`)}`,
    `  Predicate: ${pc.dim('fetch(), new XMLHttpRequest(), new Request(), new WebSocket(), new Image(), new EventSource()')}`,
    '  Derived exclusions:',
    `  - declaration-source: ${exclusionCounts.get('declaration-source') ?? 0}`,
    `  - test-source: ${exclusionCounts.get('test-source') ?? 0}`,
    `  - tooling-package: ${exclusionCounts.get('tooling-package') ?? 0}`,
    '  Allowed web-backend sites:',
  ];
  if (report.allowed.length === 0) lines.push('  - none');
  for (const site of report.allowed) {
    lines.push(
      `  - ${site.path}:${site.line}:${site.column} ${site.primitive} — ${site.enclosingWebBackend as string}`,
    );
  }
  if (!passed) {
    lines.push('', `  ${report.violations.length} transport bypass${report.violations.length === 1 ? '' : 'es'}:`);
    for (const site of report.violations) {
      lines.push(`  - ${site.path}:${site.line}:${site.column} ${site.primitive}`);
    }
    lines.push(
      '',
      '  Route transport through its backend, or keep the primitive lexically inside the createWeb*Backend implementation that owns it.',
    );
  }
  return lines.join('\n');
}

export function readPackageTransportSources(root: string): TransportSource[] {
  const listing = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z', '--', 'packages'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const sources: TransportSource[] = [];
  for (const path of new Set(listing.split('\0'))) {
    if (path === '' || !path.includes('/src/') || !SOURCE_EXTENSION.test(path)) continue;
    const absolutePath = join(root, path);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
    sources.push({ path, text: readFileSync(absolutePath, 'utf8') });
  }
  return sources.sort((a, b) => a.path.localeCompare(b.path));
}

function primitiveAt(node: ts.Node): TransportPrimitive | null {
  if (ts.isCallExpression(node)) {
    return globalPrimitiveName(node.expression, 'fetch');
  }
  if (!ts.isNewExpression(node)) return null;
  const primitive = globalPrimitiveName(node.expression, null);
  return primitive !== null && CONSTRUCTOR_PRIMITIVES.has(primitive) ? primitive : null;
}

function globalPrimitiveName(node: ts.Expression, expected: TransportPrimitive | null): TransportPrimitive | null {
  node = unwrapExpression(node);
  if (ts.isIdentifier(node)) {
    const primitive = node.text as TransportPrimitive;
    if (expected !== null && primitive !== expected) return null;
    if (expected === null && !CONSTRUCTOR_PRIMITIVES.has(primitive)) return null;
    return isShadowed(node, primitive) ? null : primitive;
  }
  if (
    (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) ||
    !ts.isIdentifier(node.expression)
  ) {
    return null;
  }
  if (isShadowed(node.expression, node.expression.text) || !GLOBAL_OBJECTS.has(node.expression.text)) return null;
  const property = ts.isPropertyAccessExpression(node)
    ? node.name.text
    : ts.isStringLiteralLike(node.argumentExpression)
      ? node.argumentExpression.text
      : null;
  if (property === null) return null;
  const primitive = property as TransportPrimitive;
  if (expected !== null) return primitive === expected ? primitive : null;
  return CONSTRUCTOR_PRIMITIVES.has(primitive) ? primitive : null;
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function isShadowed(node: ts.Node, name: string): boolean {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (isFunctionLike(current)) {
      if (current.parameters.some((parameter) => bindingNames(parameter.name).includes(name))) return true;
      if ((ts.isFunctionExpression(current) || ts.isFunctionDeclaration(current)) && current.name?.text === name) {
        return true;
      }
    }
    if (
      (ts.isSourceFile(current) || ts.isBlock(current) || ts.isModuleBlock(current)) &&
      directScopeBindings(current).has(name)
    ) {
      return true;
    }
    if (ts.isCatchClause(current) && current.variableDeclaration !== undefined) {
      if (bindingNames(current.variableDeclaration.name).includes(name)) return true;
    }
    if (
      ts.isForStatement(current) &&
      current.initializer !== undefined &&
      ts.isVariableDeclarationList(current.initializer) &&
      declarationListBindings(current.initializer).has(name)
    ) {
      return true;
    }
    if (
      (ts.isForInStatement(current) || ts.isForOfStatement(current)) &&
      ts.isVariableDeclarationList(current.initializer) &&
      declarationListBindings(current.initializer).has(name)
    ) {
      return true;
    }
  }
  return false;
}

function directScopeBindings(scope: ts.SourceFile | ts.Block | ts.ModuleBlock): Set<string> {
  const names = new Set<string>();
  for (const statement of scope.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause === undefined || clause.isTypeOnly) continue;
      if (clause.name !== undefined) names.add(clause.name.text);
      const bindings = clause.namedBindings;
      if (bindings === undefined) continue;
      if (ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
      else for (const element of bindings.elements) if (!element.isTypeOnly) names.add(element.name.text);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const name of declarationListBindings(statement.declarationList)) names.add(name);
      continue;
    }
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      names.add(statement.name.text);
    }
  }
  return names;
}

function declarationListBindings(list: ts.VariableDeclarationList): Set<string> {
  const names = new Set<string>();
  for (const declaration of list.declarations) {
    for (const name of bindingNames(declaration.name)) names.add(name);
  }
  return names;
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : bindingNames(element.name)));
}

function enclosingWebBackendName(node: ts.Node): string | null {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (!isFunctionLike(current)) continue;
    const name = functionName(current);
    if (name !== null && WEB_BACKEND_NAME.test(name)) return name;
  }
  return null;
}

function functionName(node: ts.FunctionLikeDeclaration): string | null {
  if (
    (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) &&
    node.name !== undefined &&
    ts.isIdentifier(node.name)
  ) {
    return node.name.text;
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return null;
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isArrowFunction(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function exclusionReason(path: string): TransportSourceExclusionReason | null {
  if (/\.d\.[cm]?ts$/.test(path)) return 'declaration-source';
  if (TEST_SOURCE.test(path)) return 'test-source';
  const packageDirectory = path.split('/')[1] ?? '';
  return packageDirectory.startsWith('tool-') ? 'tooling-package' : null;
}

function scriptKind(path: string): ts.ScriptKind {
  if (/\.[cm]?tsx$|\.jsx$/.test(path)) return ts.ScriptKind.TSX;
  if (/\.[cm]?js$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function compareSites(a: Readonly<TransportPrimitiveSite>, b: Readonly<TransportPrimitiveSite>): number {
  return (
    a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column || a.primitive.localeCompare(b.primitive)
  );
}

function countExclusions(
  exclusions: readonly TransportSourceExclusion[],
): ReadonlyMap<TransportSourceExclusionReason, number> {
  const counts = new Map<TransportSourceExclusionReason, number>();
  for (const exclusion of exclusions) counts.set(exclusion.reason, (counts.get(exclusion.reason) ?? 0) + 1);
  return counts;
}

function visit(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, (child) => visit(child, visitor));
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const report = checkTransportBypasses(readPackageTransportSources(root));
  console.log(formatTransportBypassReport(report));
  if (report.violations.length > 0) process.exitCode = 1;
}
