import { readdirSync, readFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

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
  readonly kind: P5HostBypassKind | 'p3-transport';
  readonly line: number;
}

export interface P5HostBypassReport {
  readonly excluded: readonly P5HostBypassSite[];
  readonly p5: readonly P5HostBypassSite[];
  readonly scannedFiles: number;
}

export type P5HostBypassBudget = Readonly<Record<P5HostBypassKind, number>>;

// Category upper bounds, not source membership. The runtime scan below prints the derived population;
// a repaired site may lower a number without editing this file, while a new site makes the gate red.
export const P5_HOST_BYPASS_BUDGET: P5HostBypassBudget = {
  'direct-dom': 18,
  'input-ingress': 26,
  'scratch-surface': 18,
  'webgpu-acquisition': 6,
};

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

export function p5HostBypassBudgetFailures(report: Readonly<P5HostBypassReport>, budget: P5HostBypassBudget): string[] {
  const counts = countP5HostBypasses(report);
  return (Object.keys(counts) as P5HostBypassKind[])
    .filter((kind) => counts[kind] > budget[kind])
    .map((kind) => `${kind}: found ${counts[kind]}, budget ${budget[kind]}`);
}

export function formatP5HostBypassReport(report: Readonly<P5HostBypassReport>): string {
  const counts = countP5HostBypasses(report);
  const lines = [
    'P5 host-bypass census',
    `SCANNED ${report.scannedFiles} packages/*/src/**/*.ts files (runtime directory walk; no file roster)`,
    'DETECTS direct document/window/navigator access, DOM input listener attachment, Canvas/ImageData/ImageBitmap scratch construction, and WebGPU adapter/device/context acquisition',
    'EXCLUDES tests/helpers, host-* implementations, tool-* sources, explicit *Web* adapters, *-dom/*-canvas technology adapters, application P4 window attachment, and P3 fetch/socket/EventSource/WebSocket/XHR/Request/Image transport syntax',
    `P5 ${Object.entries(counts)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(' ')}`,
  ];
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
  const failures = p5HostBypassBudgetFailures(report, P5_HOST_BYPASS_BUDGET);
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
): { readonly kind: P5HostBypassKind | 'p3-transport' } | null {
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
      return { kind: 'input-ingress' };
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
