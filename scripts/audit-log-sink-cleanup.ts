import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

type CleanupClassification =
  | 'direct-cleanup'
  | 'finally-cleanup'
  | 'lifecycle-owned'
  | 'missing-cleanup'
  | 'test-hook-cleanup';

interface LogSinkRegistration {
  argument: string;
  classification: CleanupClassification;
  line: number;
  path: string;
}

interface RegistrationGroup {
  classification: CleanupClassification;
  lines: number[];
  path: string;
}

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');
const outputPath = resolve(root, 'agents/log-sink-cleanup-audit.md');

const cleanupDescriptions: Readonly<Record<CleanupClassification, string>> = {
  'direct-cleanup':
    'Guaranteed on the straight-line path: the registration is immediately removed, cleared, or replaced before assertions can abort the owner.',
  'finally-cleanup': 'Guaranteed on success and failure: a local `finally` removes the same sink registration.',
  'lifecycle-owned':
    'Owned by an explicit API lifetime: `disableDebug` removes the sink installed by `enableDebug`. It remains reachable for the intended debug session.',
  'missing-cleanup':
    'Missing an exception-safe shorter-lifetime teardown. The sink and anything its closure captures remain reachable and can receive later log entries.',
  'test-hook-cleanup':
    'Guaranteed after every test, including failures, by an `afterEach` hook that removes or clears registered sinks.',
};

function main(): void {
  const registrations = findRegistrations();
  const report = formatReport(registrations);
  const write = process.argv.includes('--write');
  const check = process.argv.includes('--check');

  if (write) writeFileSync(outputPath, report);
  if (!write) process.stdout.write(report);

  if (check) {
    const committed = readFileSync(outputPath, 'utf8');
    if (committed !== report) {
      console.error('The committed log-sink cleanup audit is stale. Run:');
      console.error('  npx tsx scripts/audit-log-sink-cleanup.ts --write');
      process.exitCode = 1;
    }
  }

  const unexpectedMissing = registrations.filter(
    (registration) => registration.classification === 'missing-cleanup' && !isPageLifetimeRegistration(registration),
  );
  const pageLifetime = registrations.filter(isPageLifetimeRegistration);
  if (pageLifetime.length !== 1) {
    console.error(`Expected exactly one page-lifetime size-fixture registration, found ${pageLifetime.length}.`);
    process.exitCode = 1;
  }
  if (unexpectedMissing.length > 0) {
    console.error(`${unexpectedMissing.length} addLogSink registration(s) have no guaranteed cleanup.`);
    process.exitCode = 1;
  }
}

function findRegistrations(): LogSinkRegistration[] {
  const registrations: LogSinkRegistration[] = [];
  for (const path of listTrackedCode()) {
    const text = readFileSync(resolve(root, path), 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, scriptKind(path));
    const fileHasCleanupHook = hasTestCleanupHook(source);

    visit(source, (node) => {
      if (!isNamedCall(node, 'addLogSink')) return;
      const argument = node.arguments[0]?.getText(source) ?? '<missing argument>';
      const registration: LogSinkRegistration = {
        argument,
        classification: classifyRegistration(path, source, node, argument, fileHasCleanupHook),
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        path,
      };
      registrations.push(registration);
    });
  }
  return registrations.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

function classifyRegistration(
  path: string,
  source: ts.SourceFile,
  call: ts.CallExpression,
  argument: string,
  fileHasCleanupHook: boolean,
): CleanupClassification {
  if (path === 'packages/debug/src/debug.ts' && argument === 'sink') return 'lifecycle-owned';
  if (isPageLifetimeRegistration({ argument, classification: 'missing-cleanup', line: 0, path })) {
    return 'missing-cleanup';
  }
  if (fileHasCleanupHook) return 'test-hook-cleanup';

  const owner = findEnclosingFunction(call);
  if (owner !== null && hasFinallyCleanup(owner, source, argument)) return 'finally-cleanup';
  if (owner !== null && hasDirectCleanup(owner, source, call, argument)) return 'direct-cleanup';
  return 'missing-cleanup';
}

function findEnclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | null {
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
    if (isFunctionLikeDeclaration(parent)) return parent;
  }
  return null;
}

function hasFinallyCleanup(owner: ts.FunctionLikeDeclaration, source: ts.SourceFile, argument: string): boolean {
  let found = false;
  visitOwned(owner, owner, (node) => {
    if (found) return;
    if (ts.isTryStatement(node) && node.finallyBlock !== undefined) {
      found = containsMatchingRemove(node.finallyBlock, source, argument);
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'finally'
    ) {
      found = containsMatchingRemove(node, source, argument);
    }
  });
  return found;
}

function hasDirectCleanup(
  owner: ts.FunctionLikeDeclaration,
  source: ts.SourceFile,
  registration: ts.CallExpression,
  argument: string,
): boolean {
  let found = false;
  visitOwned(owner, owner, (node) => {
    if (found || !ts.isCallExpression(node) || node.getStart(source) <= registration.getStart(source)) return;
    const name = ts.isIdentifier(node.expression) ? node.expression.text : null;
    if (name === 'clearLogSinks' || name === 'setLogSink') {
      found = true;
      return;
    }
    if (name === 'removeLogSink' && node.arguments[0]?.getText(source) === argument) found = true;
  });
  return found;
}

function hasTestCleanupHook(source: ts.SourceFile): boolean {
  return source.statements.some((statement) => {
    if (!ts.isExpressionStatement(statement) || !isNamedCall(statement.expression, 'afterEach')) return false;
    return (
      containsNamedCall(statement.expression, 'clearLogSinks') ||
      containsNamedCall(statement.expression, 'removeLogSink')
    );
  });
}

function containsMatchingRemove(node: ts.Node, source: ts.SourceFile, argument: string): boolean {
  let found = false;
  visit(node, (candidate) => {
    if (!found && isNamedCall(candidate, 'removeLogSink') && candidate.arguments[0]?.getText(source) === argument) {
      found = true;
    }
  });
  return found;
}

function containsNamedCall(node: ts.Node, name: string): boolean {
  let found = false;
  visit(node, (candidate) => {
    if (!found && isNamedCall(candidate, name)) found = true;
  });
  return found;
}

function isNamedCall(node: ts.Node, name: string): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;
}

function isFunctionLikeDeclaration(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function isPageLifetimeRegistration(registration: Readonly<LogSinkRegistration>): boolean {
  return (
    registration.path === 'tools/size/fixtures/log-console/src/render.canvas.ts' &&
    registration.argument === 'createConsoleLogSink()'
  );
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  node.forEachChild((child) => visit(child, callback));
}

function visitOwned(node: ts.Node, owner: ts.FunctionLikeDeclaration, callback: (node: ts.Node) => void): void {
  callback(node);
  node.forEachChild((child) => {
    if (child !== owner && isFunctionLikeDeclaration(child)) return;
    visitOwned(child, owner, callback);
  });
}

function listTrackedCode(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((path) => /\.(?:[cm]?[jt]sx?)$/.test(path))
    .sort();
}

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function formatReport(registrations: readonly LogSinkRegistration[]): string {
  const counts = new Map<CleanupClassification, number>();
  for (const registration of registrations) {
    counts.set(registration.classification, (counts.get(registration.classification) ?? 0) + 1);
  }
  const groups = groupRegistrations(registrations);
  const missing = counts.get('missing-cleanup') ?? 0;
  const lines = [
    '# `addLogSink` cleanup audit',
    '',
    'Generated from every tracked JavaScript and TypeScript file by:',
    '',
    '```sh',
    'npx tsx scripts/audit-log-sink-cleanup.ts --write',
    'npx tsx scripts/audit-log-sink-cleanup.ts --check',
    '```',
    '',
    `The current tree contains **${registrations.length} registrations across ${new Set(registrations.map((entry) => entry.path)).size} files**: ` +
      `${counts.get('finally-cleanup') ?? 0} locally bracketed by \`finally\`, ` +
      `${counts.get('test-hook-cleanup') ?? 0} cleared by failure-safe test hooks, ` +
      `${counts.get('direct-cleanup') ?? 0} immediately removed/replaced, ` +
      `${counts.get('lifecycle-owned') ?? 0} owned by an explicit API lifetime, and ${missing} without a shorter-lifetime cleanup.`,
    '',
    'The check fails for every new unbracketed registration. The one named exception is the size fixture:',
    'its console sink deliberately lives for the document lifetime and becomes unreachable at page teardown.',
    '',
    '## Consequences',
    '',
    '| Classification | Consequence |',
    '| --- | --- |',
    ...cleanupClassifications().map(
      (classification) => `| \`${classification}\` | ${cleanupDescriptions[classification]} |`,
    ),
    '',
    'The `lifecycle-owned` debug registration has one unresolved exception path: `enableDebug` installs',
    'the sink before running subsystem `enableGuards` callbacks, but sets its enabled flag only after all',
    'callbacks return. If one callback throws, `disableDebug` is a no-op and cannot close the partially',
    'opened lifetime. Rolling back already-enabled subsystem guards is a lifetime-policy decision, so this',
    'audit records and escalates it rather than choosing teardown semantics locally.',
    '',
    '## Every registration',
    '',
    '| File | Lines | Count | Classification | Consequence |',
    '| --- | --- | ---: | --- | --- |',
  ];

  for (const group of groups) {
    lines.push(
      `| \`${group.path}\` | ${group.lines.join(', ')} | ${group.lines.length} | \`${group.classification}\` | ${cleanupDescriptions[group.classification]} |`,
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function groupRegistrations(registrations: readonly LogSinkRegistration[]): RegistrationGroup[] {
  const byKey = new Map<string, RegistrationGroup>();
  for (const registration of registrations) {
    const key = `${registration.path}\u0000${registration.classification}`;
    const group = byKey.get(key) ?? {
      classification: registration.classification,
      lines: [],
      path: registration.path,
    };
    group.lines.push(registration.line);
    byKey.set(key, group);
  }
  return [...byKey.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.classification.localeCompare(b.classification),
  );
}

function cleanupClassifications(): CleanupClassification[] {
  return ['finally-cleanup', 'test-hook-cleanup', 'direct-cleanup', 'lifecycle-owned', 'missing-cleanup'];
}

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
