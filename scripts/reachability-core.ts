import type { Node, VariableDeclarator } from 'oxc-parser';

import { collectFastEntryPointInventory } from './fast-export-inventory';
import { getParsedOxcSource } from './oxc-source';

export type EffectBackend = 'canvas' | 'gl' | 'wgpu';
export type ReachabilityRule = 'missing-registration' | 'missing-runner' | 'registration-mapping';

export interface ReachabilityViolation {
  packageName: string;
  symbol: string;
  rule: ReachabilityRule;
  detail: string;
}

export interface ReachabilityLaneEntry {
  packageName: string;
  symbol: string;
  dot: boolean;
  contract: boolean;
}

interface EffectAuditOptions {
  backend: EffectBackend;
  sourceFiles: readonly string[];
}

interface LaneOptions {
  packageName: string;
  publicEntry: string;
  contractEntry: string;
  symbols: ReadonlySet<string>;
}

interface NamedDeclaration {
  name: string;
  node: Node;
}

const PREFIX: Record<EffectBackend, string> = { canvas: 'Canvas', gl: 'Gl', wgpu: 'Wgpu' };

// Capability is deliberately source-derived and exactly inverse: every shipped built-in runner has one
// per-kind registration wrapper, and every wrapper fronts its matching runner. Lane placement is not a
// hard invariant here; it is curated and reviewed through the separate tracked baseline.
export function auditEffectBackend(options: EffectAuditOptions): ReachabilityViolation[] {
  const packageName = `effects-${options.backend}`;
  const prefix = PREFIX[options.backend];
  const violations: ReachabilityViolation[] = [];
  const runnerKinds = new Set<string>();
  const registerKinds = new Set<string>();
  const generic = `register${prefix}RenderEffect`;
  const runnerPattern = new RegExp(`^default${prefix}(.+Effect)Runner$`);
  const registerPattern = new RegExp(`^register${prefix}(.+Effect)$`);

  for (const declaration of declarationsIn(options.sourceFiles)) {
    const { name } = declaration;
    const runnerMatch = runnerPattern.exec(name);
    if (runnerMatch !== null) {
      const kind = runnerMatch[1];
      if (kind !== undefined) runnerKinds.add(kind);
      continue;
    }

    const registerMatch = registerPattern.exec(name);
    if (registerMatch === null || name === generic) continue;
    const kind = registerMatch[1];
    if (kind === undefined) continue;
    const runner = `default${prefix}${kind}Runner`;
    registerKinds.add(kind);
    if (!registrationMaps(declaration.node, generic, kind, runner)) {
      violations.push({
        packageName,
        symbol: name,
        rule: 'registration-mapping',
        detail: `must call ${generic}(state, '${kind}', ${runner})`,
      });
    }
  }
  for (const kind of runnerKinds) {
    if (registerKinds.has(kind)) continue;
    violations.push({
      packageName,
      symbol: `default${prefix}${kind}Runner`,
      rule: 'missing-registration',
      detail: `real built-in runner requires register${prefix}${kind}; delete the runner if it is not real`,
    });
  }
  for (const kind of registerKinds) {
    if (runnerKinds.has(kind)) continue;
    violations.push({
      packageName,
      symbol: `register${prefix}${kind}`,
      rule: 'missing-runner',
      detail: `capability claim requires default${prefix}${kind}Runner`,
    });
  }
  return violations;
}

export function effectReachabilitySymbols(backend: EffectBackend, sourceFiles: readonly string[]): Set<string> {
  const prefix = PREFIX[backend];
  const generic = `register${prefix}RenderEffect`;
  const runnerPattern = new RegExp(`^default${prefix}.+EffectRunner$`);
  const registerPattern = new RegExp(`^register${prefix}.+Effect$`);
  const symbols = new Set<string>([generic]);
  for (const { name } of declarationsIn(sourceFiles)) {
    if (runnerPattern.test(name) || registerPattern.test(name)) symbols.add(name);
  }
  return symbols;
}

export function defaultCompositionSymbols(sourceFiles: readonly string[]): Set<string> {
  const symbols = new Set<string>();
  for (const { name } of declarationsIn(sourceFiles)) {
    if (/^default[A-Z].*(?:Renderer|Runner)$/.test(name) && !name.endsWith('EffectRunner')) symbols.add(name);
  }
  return symbols;
}

export function collectReachabilityLanes(options: LaneOptions): ReachabilityLaneEntry[] {
  const dotValues = collectFastEntryPointInventory(options.publicEntry).valueNames;
  const contractValues = collectFastEntryPointInventory(options.contractEntry).valueNames;
  return [...options.symbols].sort().map((symbol) => ({
    packageName: options.packageName,
    symbol,
    dot: dotValues.has(symbol),
    contract: contractValues.has(symbol),
  }));
}

function declarationsIn(sourceFiles: readonly string[]): NamedDeclaration[] {
  const declarations: NamedDeclaration[] = [];
  for (const sourceFile of sourceFiles) {
    for (const statement of getParsedOxcSource(sourceFile).program.body) {
      const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
      if (declaration === null) continue;
      if (declaration.type === 'FunctionDeclaration' || declaration.type === 'TSDeclareFunction') {
        if (declaration.id !== null) declarations.push({ name: declaration.id.name, node: declaration });
      } else if (declaration.type === 'VariableDeclaration') {
        for (const variable of declaration.declarations) addVariableDeclaration(declarations, variable);
      }
    }
  }
  return declarations;
}

function addVariableDeclaration(declarations: NamedDeclaration[], variable: VariableDeclarator): void {
  if (variable.id.type === 'Identifier') declarations.push({ name: variable.id.name, node: variable });
}

function registrationMaps(declaration: Node, generic: string, kind: string, runner: string): boolean {
  let mapped = false;
  visit(declaration, (node) => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return;
    const kindArgument = node.arguments[1];
    const runnerArgument = node.arguments[2];
    if (
      node.callee.name === generic &&
      kindArgument?.type === 'Literal' &&
      kindArgument.value === kind &&
      runnerArgument?.type === 'Identifier' &&
      runnerArgument.name === runner
    ) {
      mapped = true;
    }
  });
  return mapped;
}

function visit(node: Node, callback: (node: Node) => void): void {
  callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || value === null || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child !== null && typeof child === 'object' && 'type' in child) visit(child as Node, callback);
      }
    } else if ('type' in value) {
      visit(value as Node, callback);
    }
  }
}
