import { readdirSync, readFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import { formatGateProvenance, readGateTreeState } from './gate-provenance';

export type P5HostBypassKind = 'direct-dom' | 'input-ingress' | 'scratch-surface' | 'webgpu-acquisition';

export type P5HostBypassExclusion =
  | 'explicit-web-adapter'
  | 'host-implementation'
  | 'p3-transport'
  | 'p4-window-attachment'
  | 'technology-specific-renderer'
  | 'test-support'
  | 'tooling';

export interface P5HostBypassSite {
  readonly column: number;
  readonly expression: string;
  readonly exclusion: P5HostBypassExclusion | null;
  readonly file: string;
  readonly functionName: string | null;
  readonly inputEventName: string | null;
  readonly inputListenerOperation: 'registration' | 'removal' | null;
  readonly kind: P5HostBypassKind | 'p3-transport';
  readonly line: number;
}

export interface P5InputIngressListenerOperations {
  readonly registrationNames: readonly string[];
  readonly removalNames: readonly string[];
}

export interface P5HostBypassReport {
  readonly excluded: readonly P5HostBypassSite[];
  readonly p5: readonly P5HostBypassSite[];
  readonly scannedFiles: number;
}

// The empty report, owned beside the type it builds. See `createEmptyBackendLifecycleReport` for why
// every report type carries one: a fixture that needs a valid report rather than a particular one
// starts here, so a new field is supplied once instead of at each construction site.
export function createEmptyP5HostBypassReport(): P5HostBypassReport {
  return { excluded: [], p5: [], scannedFiles: 0 };
}

export type P5HostBypassBudget = Readonly<Record<P5HostBypassKind, number>>;

export interface P5HostBypassBudgetEvidence {
  readonly budget: P5HostBypassBudget;
  readonly reason: string;
  readonly total: number;
}

// IMMUTABLE PREFIX. These accepted checkpoints pin every category, total and reason. History
// validation compares against this full prefix, so even a coherent category-and-total rewrite fails.
const P5_HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX = [
  {
    budget: { 'direct-dom': 18, 'input-ingress': 26, 'scratch-surface': 18, 'webgpu-acquisition': 6 },
    reason: 'initial runtime-derived P5 host-bypass census',
    total: 68,
  },
  {
    budget: { 'direct-dom': 18, 'input-ingress': 26, 'scratch-surface': 18, 'webgpu-acquisition': 0 },
    reason: 'WebGPU acquisition routed through the structural host backend',
    total: 62,
  },
  {
    budget: { 'direct-dom': 18, 'input-ingress': 0, 'scratch-surface': 18, 'webgpu-acquisition': 0 },
    reason: 'input listeners routed through the process-wide ingress backend',
    total: 36,
  },
  {
    budget: { 'direct-dom': 15, 'input-ingress': 0, 'scratch-surface': 18, 'webgpu-acquisition': 0 },
    reason: 'geolocation availability routed through the selected backend',
    total: 33,
  },
  {
    budget: { 'direct-dom': 15, 'input-ingress': 0, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
    reason: 'Bitmap materialization routed through the selected image backend',
    total: 31,
  },
  {
    budget: { 'direct-dom': 14, 'input-ingress': 0, 'scratch-surface': 16, 'webgpu-acquisition': 0 },
    reason: 'Shortcut platform identity routed through the selected platform backend',
    total: 30,
  },
] as const satisfies readonly P5HostBypassBudgetEvidence[];

// APPEND ONLY. Each entry is an evidenced repair state, not a current number to edit in place. Future
// repairs append a lower state with its category breakdown and reason without editing the accepted
// prefix above.
export const P5_HOST_BYPASS_BUDGET_HISTORY = [
  ...P5_HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX,
] as const satisfies readonly P5HostBypassBudgetEvidence[];

// Category upper bounds, not source membership. The current budget is derived from the last evidenced
// history entry so there is no second lone number an ordinary bypass addition can edit to become green.
export const P5_HOST_BYPASS_BUDGET: P5HostBypassBudget =
  P5_HOST_BYPASS_BUDGET_HISTORY[P5_HOST_BYPASS_BUDGET_HISTORY.length - 1].budget;

const P3_CONSTRUCTORS = new Set(['EventSource', 'Image', 'Request', 'WebSocket', 'XMLHttpRequest']);
const INPUT_EVENT_NAMES = new Set([
  'beforeinput',
  'compositionend',
  'compositionstart',
  'compositionupdate',
  'contextmenu',
  'gamepadconnected',
  'gamepaddisconnected',
  'keydown',
  'keyup',
  'mousemove',
  'pointercancel',
  'pointerdown',
  'pointermove',
  'pointerup',
  'touchcancel',
  'touchend',
  'touchmove',
  'touchstart',
  'wheel',
]);

/**
 * Derives the production TypeScript population from the workspace on every run. There is deliberately
 * no source-file allowlist: adding a package or file makes it part of the next scan automatically.
 */
export function scanP5HostBypasses(root: string): P5HostBypassReport {
  const packagesDirectory = join(root, 'packages');
  const files = collectProductionSourceFiles(packagesDirectory);
  const sites = files.flatMap((file) =>
    scanP5HostBypassSource(relative(root, file).split(sep).join('/'), readFileSync(file, 'utf8')),
  );
  return createP5HostBypassReport(files.length, sites);
}

export function scanP5HostBypassSource(file: string, source: string): P5HostBypassSite[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const webAdapterFunctions = collectWebAdapterFunctionNames(parsed);
  const sites: P5HostBypassSite[] = [];

  const visit = (node: ts.Node): void => {
    const finding = classifyNode(node, parsed);
    if (finding !== null) {
      const start = node.getStart(parsed);
      const position = parsed.getLineAndCharacterOfPosition(start);
      const functionNames = enclosingFunctionNames(node);
      const functionName = functionNames[0] ?? null;
      const structuralExclusion = classifyStructuralExclusion(file, functionNames, webAdapterFunctions);
      sites.push({
        column: position.character + 1,
        expression: node.getText(parsed),
        exclusion: finding.kind === 'p3-transport' ? 'p3-transport' : structuralExclusion,
        file,
        functionName,
        inputEventName: finding.inputEventName ?? null,
        inputListenerOperation: finding.inputListenerOperation ?? null,
        kind: finding.kind,
        line: position.line + 1,
      });

      // A finding represents the whole browser primitive. Do not also report its callee's nested
      // `navigator.gpu` / `document.createElement` property access as a second site.
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        for (const argument of node.arguments ?? []) ts.forEachChild(argument, visit);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return sites;
}

export function createP5HostBypassReport(scannedFiles: number, sites: readonly P5HostBypassSite[]): P5HostBypassReport {
  const sorted = [...sites].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.kind.localeCompare(b.kind),
  );
  return {
    excluded: sorted.filter((site) => site.exclusion !== null),
    p5: sorted.filter((site) => site.exclusion === null),
    scannedFiles,
  };
}

export function countP5HostBypasses(report: Readonly<P5HostBypassReport>): Record<P5HostBypassKind, number> {
  const counts: Record<P5HostBypassKind, number> = {
    'direct-dom': 0,
    'input-ingress': 0,
    'scratch-surface': 0,
    'webgpu-acquisition': 0,
  };
  for (const site of report.p5) counts[site.kind as P5HostBypassKind]++;
  return counts;
}

export function deriveP5InputIngressListenerOperations(
  report: Readonly<P5HostBypassReport>,
): P5InputIngressListenerOperations {
  const sites = [...report.p5, ...report.excluded].filter(
    (site) => site.kind === 'input-ingress' && site.file.startsWith('packages/input/'),
  );
  return {
    registrationNames: sites
      .filter((site) => site.inputListenerOperation === 'registration')
      .map((site) => site.inputEventName!)
      .sort(),
    removalNames: sites
      .filter((site) => site.inputListenerOperation === 'removal')
      .map((site) => site.inputEventName!)
      .sort(),
  };
}

export function p5InputIngressPairingFailures(operations: Readonly<P5InputIngressListenerOperations>): string[] {
  if (
    operations.registrationNames.length === operations.removalNames.length &&
    operations.registrationNames.every((name, index) => name === operations.removalNames[index])
  ) {
    return [];
  }
  return [
    `input-ingress listener names differ: registered [${operations.registrationNames.join(', ')}], removed [${operations.removalNames.join(', ')}]`,
  ];
}

export function p5HostBypassBudgetFailures(report: Readonly<P5HostBypassReport>, budget: P5HostBypassBudget): string[] {
  const counts = countP5HostBypasses(report);
  return (Object.keys(counts) as P5HostBypassKind[])
    .filter((kind) => counts[kind] > budget[kind])
    .map((kind) => `${kind}: found ${counts[kind]}, budget ${budget[kind]}`);
}

export function p5HostBypassBudgetHistoryFailures(history: readonly P5HostBypassBudgetEvidence[]): string[] {
  if (history.length === 0) return ['P5 budget history is empty'];
  const failures: string[] = [];
  for (let index = 0; index < P5_HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX.length; index++) {
    const accepted = P5_HOST_BYPASS_ACCEPTED_BUDGET_HISTORY_PREFIX[index];
    const entry = history[index];
    if (entry === undefined || !p5HostBypassBudgetEvidenceMatches(entry, accepted)) {
      failures.push(
        `P5 budget history[${index}] rewrites immutable accepted checkpoint total ${accepted.total} (categories and reason are pinned)`,
      );
    }
  }
  for (let index = 0; index < history.length; index++) {
    const entry = history[index];
    const categoryTotal = totalP5HostBypassBudget(entry.budget);
    if (categoryTotal !== entry.total) {
      failures.push(
        `P5 budget history[${index}] category sum ${categoryTotal} does not match evidenced total ${entry.total}`,
      );
    }
    const prior = history[index - 1];
    if (prior !== undefined && entry.total >= prior.total) {
      failures.push(`P5 budget history[${index}] total ${entry.total} is not below prior total ${prior.total}`);
    }
  }
  return failures;
}

function p5HostBypassBudgetEvidenceMatches(
  entry: Readonly<P5HostBypassBudgetEvidence>,
  accepted: Readonly<P5HostBypassBudgetEvidence>,
): boolean {
  return (
    entry.total === accepted.total &&
    entry.reason === accepted.reason &&
    entry.budget['direct-dom'] === accepted.budget['direct-dom'] &&
    entry.budget['input-ingress'] === accepted.budget['input-ingress'] &&
    entry.budget['scratch-surface'] === accepted.budget['scratch-surface'] &&
    entry.budget['webgpu-acquisition'] === accepted.budget['webgpu-acquisition']
  );
}

export function totalP5HostBypassBudget(budget: P5HostBypassBudget): number {
  return Object.values(budget).reduce((sum, count) => sum + count, 0);
}

export function formatP5HostBypassReport(report: Readonly<P5HostBypassReport>): string {
  const counts = countP5HostBypasses(report);
  const lines = [
    formatGateProvenance(
      {
        command: 'npm run check:p5-host-bypass (scripts/p5-host-bypass.ts)',
        counting:
          'one unit = one packages/*/src/**/*.ts file scanned; a site is one direct host-API expression, tallied per detected kind',
        scope:
          'runtime directory walk of packages/*/src/**/*.ts with no file roster; tests and helpers, host-* implementations, tool-* sources, explicit *Web* adapters, *-dom and *-canvas technology adapters, P4 window attachment and P3 transport syntax all excluded',
      },
      readGateTreeState(process.cwd()),
    ),
    'P5 host-bypass census',
    `SCANNED ${report.scannedFiles} packages/*/src/**/*.ts files (runtime directory walk; no file roster)`,
    'DETECTS direct document/window/navigator access, DOM input listener attachment, Canvas/ImageData/ImageBitmap scratch construction, and WebGPU adapter/device/context acquisition',
    'EXCLUDES tests/helpers, host-* implementations, tool-* sources, explicit *Web* adapters, *-dom/*-canvas technology adapters, application P4 window attachment, and P3 fetch/socket/EventSource/WebSocket/XHR/Request/Image transport syntax',
    `P5 outstanding=${report.p5.length} ${Object.entries(counts)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(' ')}`,
    'P5 budget history (append-only)',
  ];
  for (let index = 0; index < P5_HOST_BYPASS_BUDGET_HISTORY.length; index++) {
    const entry = P5_HOST_BYPASS_BUDGET_HISTORY[index];
    const prior = P5_HOST_BYPASS_BUDGET_HISTORY[index - 1];
    const delta = prior === undefined ? '' : ` (-${prior.total - entry.total} fixed)`;
    lines.push(
      `  ${entry.total}${delta} ${Object.entries(entry.budget)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(' ')} — ${entry.reason}`,
    );
  }
  for (const site of report.p5)
    lines.push(`  ${site.kind} ${site.file}:${site.line}:${site.column} ${site.expression}`);

  const excludedCounts = new Map<P5HostBypassExclusion, number>();
  for (const site of report.excluded) {
    const exclusion = site.exclusion as P5HostBypassExclusion;
    excludedCounts.set(exclusion, (excludedCounts.get(exclusion) ?? 0) + 1);
  }
  lines.push(
    `EXCLUDED ${[...excludedCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, count]) => `${reason}=${count}`)
      .join(' ')}`,
  );
  lines.push(
    'P3 PARTITION owner=builder3 primitives=fetch,XMLHttpRequest,Request,Image,WebSocket,EventSource (reported here; enforced only by the independent P3 transport gate)',
  );
  for (const site of report.excluded.filter((candidate) => candidate.exclusion === 'p3-transport')) {
    lines.push(`  P3 ${site.file}:${site.line}:${site.column} ${site.expression}`);
  }
  return lines.join('\n');
}

if (isMainModule(import.meta.url, process.argv[1])) {
  const report = scanP5HostBypasses(process.cwd());
  process.stdout.write(`${formatP5HostBypassReport(report)}\n`);
  const failures = [
    ...p5HostBypassBudgetHistoryFailures(P5_HOST_BYPASS_BUDGET_HISTORY),
    ...p5HostBypassBudgetFailures(report, P5_HOST_BYPASS_BUDGET),
  ];
  if (failures.length > 0) {
    process.stderr.write(`P5 host-bypass ratchet exceeded:\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
    process.exitCode = 1;
  }
}

function collectProductionSourceFiles(packagesDirectory: string): string[] {
  const files: string[] = [];
  for (const packageEntry of readdirSync(packagesDirectory, { withFileTypes: true })) {
    if (!packageEntry.isDirectory()) continue;
    if (packageEntry.name.startsWith('tool-')) continue;
    const sourceDirectory = join(packagesDirectory, packageEntry.name, 'src');
    collectTypeScriptFiles(sourceDirectory, files);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function collectTypeScriptFiles(directory: string, files: string[]): void {
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTypeScriptFiles(path, files);
      continue;
    }
    if (
      !entry.isFile() ||
      !entry.name.endsWith('.ts') ||
      entry.name.endsWith('.d.ts') ||
      /\.(?:test|spec)\.ts$/.test(entry.name) ||
      entry.name.endsWith('TestHelper.ts')
    ) {
      continue;
    }
    files.push(path);
  }
}

function classifyNode(
  node: ts.Node,
  source: ts.SourceFile,
): {
  readonly inputEventName?: string;
  readonly inputListenerOperation?: 'registration' | 'removal';
  readonly kind: P5HostBypassKind | 'p3-transport';
} | null {
  if (ts.isNewExpression(node)) {
    const constructorName = expressionName(node.expression);
    if (constructorName === 'ImageData' || constructorName === 'OffscreenCanvas') return { kind: 'scratch-surface' };
    if (constructorName !== null && P3_CONSTRUCTORS.has(constructorName)) return { kind: 'p3-transport' };
    return null;
  }

  if (ts.isCallExpression(node)) {
    const calledName = expressionName(node.expression);
    if (calledName === 'fetch') return { kind: 'p3-transport' };
    if (calledName === 'createImageBitmap') return { kind: 'scratch-surface' };
    if (calledName === 'createElement' && firstStringArgument(node) === 'canvas') return { kind: 'scratch-surface' };
    if (calledName === 'createElement' || calledName === 'createTextNode') return { kind: 'direct-dom' };
    if (calledName === 'requestAdapter' || calledName === 'requestDevice') return { kind: 'webgpu-acquisition' };
    if (calledName === 'getContext' && firstStringArgument(node) === 'webgpu') return { kind: 'webgpu-acquisition' };
    if (
      (calledName === 'addEventListener' || calledName === 'removeEventListener') &&
      INPUT_EVENT_NAMES.has(firstStringArgument(node) ?? '')
    ) {
      return {
        inputEventName: firstStringArgument(node)!,
        inputListenerOperation: calledName === 'addEventListener' ? 'registration' : 'removal',
        kind: 'input-ingress',
      };
    }
    if (isRootedInBrowserGlobal(node.expression)) {
      return expressionContainsName(node.expression, 'gpu') ? { kind: 'webgpu-acquisition' } : { kind: 'direct-dom' };
    }
    return null;
  }

  if (
    ts.isPropertyAccessExpression(node) &&
    !isInsideRecognizedCallOrConstruction(node, source) &&
    isRootedInBrowserGlobal(node)
  ) {
    return expressionContainsName(node, 'gpu') ? { kind: 'webgpu-acquisition' } : { kind: 'direct-dom' };
  }
  return null;
}

function classifyStructuralExclusion(
  file: string,
  functionNames: readonly string[],
  webAdapterFunctions: ReadonlySet<string>,
): P5HostBypassExclusion | null {
  const parts = file.split('/');
  const packageName = parts[0] === 'packages' ? (parts[1] ?? '') : '';
  const fileName = basename(file);
  if (/\.(?:test|spec)\.ts$/.test(fileName) || fileName.endsWith('TestHelper.ts')) return 'test-support';
  if (packageName.startsWith('host-')) return 'host-implementation';
  if (packageName.startsWith('tool-')) return 'tooling';
  if (packageName === 'application') return 'p4-window-attachment';
  if (packageName.endsWith('-dom') || packageName.endsWith('-canvas')) return 'technology-specific-renderer';
  if (
    functionNames.some((name) => webAdapterFunctions.has(name)) ||
    /^(?:register|web)[A-Z0-9_]*Web[A-Z0-9_]/.test(fileName.replace(/\.ts$/, ''))
  ) {
    return 'explicit-web-adapter';
  }
  return null;
}

function enclosingFunctionNames(node: ts.Node): string[] {
  const names: string[] = [];
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    if (ts.isFunctionDeclaration(current) && current.name !== undefined) names.push(current.name.text);
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      names.push(current.parent.name.text);
    }
    if (ts.isMethodDeclaration(current) && current.name !== undefined) names.push(current.name.getText());
    current = current.parent;
  }
  return names;
}

function expressionName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function firstStringArgument(call: ts.CallExpression): string | null {
  const first = call.arguments[0];
  return first !== undefined && ts.isStringLiteralLike(first) ? first.text : null;
}

function isRootedInBrowserGlobal(expression: ts.Expression): boolean {
  let current = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) current = current.expression;
  if (!ts.isIdentifier(current)) return false;
  if (current.text === 'document' || current.text === 'navigator' || current.text === 'window') {
    return !isLocallyDeclared(current, current.text);
  }
  return current.text === 'globalThis' && expressionContainsName(expression, 'document', 'navigator', 'window');
}

function isLocallyDeclared(identifier: ts.Identifier, name: string): boolean {
  let current: ts.Node | undefined = identifier.parent;
  while (current !== undefined) {
    if (
      ts.isFunctionLike(current) &&
      current.parameters.some((parameter) => bindingContainsName(parameter.name, name))
    ) {
      return true;
    }
    if (ts.isCatchClause(current) && current.variableDeclaration !== undefined) {
      if (bindingContainsName(current.variableDeclaration.name, name)) return true;
    }
    if ((ts.isBlock(current) || ts.isSourceFile(current)) && blockDirectlyDeclaresName(current, name)) return true;
    current = current.parent;
  }
  return false;
}

function blockDirectlyDeclaresName(scope: ts.Block | ts.SourceFile, name: string): boolean {
  for (const statement of scope.statements) {
    if (ts.isVariableStatement(statement)) {
      if (statement.declarationList.declarations.some((declaration) => bindingContainsName(declaration.name, name))) {
        return true;
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return true;
    if (ts.isClassDeclaration(statement) && statement.name?.text === name) return true;
    if (ts.isImportDeclaration(statement) && statement.importClause !== undefined) {
      const clause = statement.importClause;
      if (clause.name?.text === name) return true;
      const bindings = clause.namedBindings;
      if (bindings !== undefined) {
        if (ts.isNamespaceImport(bindings) && bindings.name.text === name) return true;
        if (ts.isNamedImports(bindings) && bindings.elements.some((element) => element.name.text === name)) return true;
      }
    }
  }
  return false;
}

function bindingContainsName(binding: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(binding)) return binding.text === name;
  return binding.elements.some(
    (element) => !ts.isOmittedExpression(element) && bindingContainsName(element.name, name),
  );
}

function collectWebAdapterFunctionNames(source: ts.SourceFile): ReadonlySet<string> {
  const callees = new Map<string, Set<string>>();
  const roots = new Set<string>();

  const visit = (node: ts.Node): void => {
    const name = namedFunctionName(node);
    if (name !== null) {
      if (isExplicitWebAdapterName(name)) roots.add(name);
      const called = new Set<string>();
      const collectCalls = (child: ts.Node): void => {
        if (ts.isCallExpression(child)) {
          const calledName = expressionName(child.expression);
          if (calledName !== null) called.add(calledName);
        }
        ts.forEachChild(child, collectCalls);
      };
      ts.forEachChild(node, collectCalls);
      callees.set(name, called);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  const reachable = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of [...reachable]) {
      for (const called of callees.get(name) ?? []) {
        if (!callees.has(called) || reachable.has(called)) continue;
        reachable.add(called);
        grew = true;
      }
    }
  }
  return reachable;
}

function namedFunctionName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) return node.name.text;
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  return null;
}

function isExplicitWebAdapterName(name: string): boolean {
  return /Web[A-Z0-9_]/.test(name);
}

function expressionContainsName(expression: ts.Expression, ...names: string[]): boolean {
  const wanted = new Set(names);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && wanted.has(node.text)) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function isInsideRecognizedCallOrConstruction(node: ts.PropertyAccessExpression, source: ts.SourceFile): boolean {
  const parent = node.parent;
  if (ts.isCallExpression(parent) && parent.expression === node) return classifyNode(parent, source) !== null;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) return true;
  if (ts.isElementAccessExpression(parent)) {
    if (parent.expression === node) return true;
  }
  return false;
}

function isMainModule(moduleUrl: string, entry: string | undefined): boolean {
  return entry !== undefined && moduleUrl === pathToFileURL(resolve(entry)).href;
}
