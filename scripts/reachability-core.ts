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

export interface RegistrarOwnershipEntry {
  packageName: string;
  registrar: string;
  status: 'catalogued' | 'UNCATALOGUED';
  door: string | null;
  kind: string | null;
  implementation: string | null;
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

interface RegistrarOwnershipOptions {
  packageName: string;
  sourceFiles: readonly string[];
}

interface NamedDeclaration {
  exported: boolean;
  name: string;
  node: Node;
}

interface RegistrationMapping {
  door: string;
  kind: string;
  implementation: string;
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
    const mapped = registrationMappings(declaration.node).some(
      (mapping) => mapping.door === generic && mapping.kind === kind && mapping.implementation === runner,
    );
    if (!mapped) {
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

// This is an ownership inventory, not a name-derived guess: it records only the literal kind and
// implementation identifier a registrar body actually passes through a register* door. Every exported
// registrar that does not contain such a readable call remains present as an explicit UNCATALOGUED row.
export function collectRegistrarOwnership(options: RegistrarOwnershipOptions): RegistrarOwnershipEntry[] {
  const entries: RegistrarOwnershipEntry[] = [];
  for (const declaration of declarationsIn(options.sourceFiles)) {
    if (!declaration.exported || !/^register[A-Z]/.test(declaration.name)) continue;
    const mappings = registrationMappings(declaration.node);
    if (mappings.length === 0) {
      entries.push({
        packageName: options.packageName,
        registrar: declaration.name,
        status: 'UNCATALOGUED',
        door: null,
        kind: null,
        implementation: null,
      });
      continue;
    }
    for (const mapping of mappings) {
      entries.push({
        packageName: options.packageName,
        registrar: declaration.name,
        status: 'catalogued',
        ...mapping,
      });
    }
  }
  return entries.sort(compareRegistrarOwnership);
}

function declarationsIn(sourceFiles: readonly string[]): NamedDeclaration[] {
  const declarations: NamedDeclaration[] = [];
  for (const sourceFile of sourceFiles) {
    for (const statement of getParsedOxcSource(sourceFile).program.body) {
      const exported = statement.type === 'ExportNamedDeclaration';
      const declaration = exported ? statement.declaration : statement;
      if (declaration === null) continue;
      if (declaration.type === 'FunctionDeclaration' || declaration.type === 'TSDeclareFunction') {
        if (declaration.id !== null) declarations.push({ exported, name: declaration.id.name, node: declaration });
      } else if (declaration.type === 'VariableDeclaration') {
        for (const variable of declaration.declarations) addVariableDeclaration(declarations, variable, exported);
      }
    }
  }
  return declarations;
}

function addVariableDeclaration(
  declarations: NamedDeclaration[],
  variable: VariableDeclarator,
  exported: boolean,
): void {
  if (variable.id.type === 'Identifier') declarations.push({ exported, name: variable.id.name, node: variable });
}

function registrationMappings(declaration: Node): RegistrationMapping[] {
  const mappings = new Map<string, RegistrationMapping>();
  visit(declaration, (node) => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return;
    const kindArgument = node.arguments[1];
    const implementationArgument = node.arguments[2];
    if (
      /^register[A-Z]/.test(node.callee.name) &&
      kindArgument?.type === 'Literal' &&
      typeof kindArgument.value === 'string' &&
      implementationArgument?.type === 'Identifier'
    ) {
      const mapping = {
        door: node.callee.name,
        kind: kindArgument.value,
        implementation: implementationArgument.name,
      };
      mappings.set(`${mapping.door}\0${mapping.kind}\0${mapping.implementation}`, mapping);
    }
  });
  return [...mappings.values()].sort(compareRegistrationMapping);
}

function compareRegistrarOwnership(a: RegistrarOwnershipEntry, b: RegistrarOwnershipEntry): number {
  return (
    a.packageName.localeCompare(b.packageName) ||
    a.registrar.localeCompare(b.registrar) ||
    compareNullable(a.door, b.door) ||
    compareNullable(a.kind, b.kind) ||
    compareNullable(a.implementation, b.implementation)
  );
}

function compareRegistrationMapping(a: RegistrationMapping, b: RegistrationMapping): number {
  return (
    a.door.localeCompare(b.door) || a.kind.localeCompare(b.kind) || a.implementation.localeCompare(b.implementation)
  );
}

function compareNullable(a: string | null, b: string | null): number {
  if (a === null) return b === null ? 0 : -1;
  if (b === null) return 1;
  return a.localeCompare(b);
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
