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
  uncataloguedBucket: UncataloguedRegistrarBucket | null;
  door: string | null;
  kind: string | null;
  implementation: string | null;
}

export type UncataloguedRegistrarBucket =
  | 'kind-identifier'
  | 'kind-member-or-computed'
  | 'implementation-expression'
  | 'callee-expression'
  | 'loop-or-array'
  | 'not-kind-registration';

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
        uncataloguedBucket: classifyUncataloguedRegistrar(declaration.node),
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
        uncataloguedBucket: null,
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

// The classification describes why the existing literal-kind/identifier-implementation recorder did
// not recover a row; it does not claim the registrar itself is underivable. Buckets are exclusive. A
// loop/array is the outermost shape, then a non-bare callee mirrors the walk's first rejection. For a
// bare register* call, implementation shape precedes kind shape because constant folding alone cannot
// recover an inline implementation. Anything with no fixed kind-registration call stays outside the
// miss denominator as not-kind-registration.
function classifyUncataloguedRegistrar(declaration: Node): UncataloguedRegistrarBucket {
  const evidence = collectUncataloguedEvidence(declaration);
  if (evidence.loopOrArray) return 'loop-or-array';
  if (evidence.calleeExpression) return 'callee-expression';
  if (evidence.implementationExpression) return 'implementation-expression';
  if (evidence.kindMemberOrComputed) return 'kind-member-or-computed';
  if (evidence.kindIdentifier) return 'kind-identifier';
  return 'not-kind-registration';
}

interface UncataloguedEvidence {
  calleeExpression: boolean;
  implementationExpression: boolean;
  kindIdentifier: boolean;
  kindMemberOrComputed: boolean;
  loopOrArray: boolean;
}

function collectUncataloguedEvidence(declaration: Node): UncataloguedEvidence {
  const evidence: UncataloguedEvidence = {
    calleeExpression: false,
    implementationExpression: false,
    kindIdentifier: false,
    kindMemberOrComputed: false,
    loopOrArray: false,
  };
  visitWithAncestors(declaration, [], (node, ancestors) => {
    if (node.type !== 'CallExpression' || !isRegistrationCall(node.callee)) return;
    if (ancestors.some(isLoop) || node.arguments.some((argument) => argument.type === 'ArrayExpression')) {
      evidence.loopOrArray = true;
      return;
    }
    if (node.callee.type !== 'Identifier') {
      evidence.calleeExpression = true;
      return;
    }
    const pair = registrationPairArguments(node.arguments);
    if (pair === null) return;
    if (pair.implementation.type !== 'Identifier') evidence.implementationExpression = true;
    if (pair.kind.type === 'Identifier') evidence.kindIdentifier = true;
    else if (pair.kind.type === 'MemberExpression') evidence.kindMemberOrComputed = true;
  });
  return evidence;
}

function isRegistrationCall(callee: Node): boolean {
  if (callee.type === 'Identifier') return /^register[A-Z]/.test(callee.name);
  if (callee.type !== 'MemberExpression') return false;
  if (callee.computed) return callee.property.type === 'Literal' && callee.property.value === 'register';
  return (
    callee.property.name === 'register' || callee.property.name === 'set' || /^register[A-Z]/.test(callee.property.name)
  );
}

function registrationPairArguments(args: readonly Node[]): { kind: Node; implementation: Node } | null {
  const kind = args.length >= 3 ? args[1] : args.length === 2 ? args[0] : undefined;
  const implementation = args.length >= 3 ? args[2] : args.length === 2 ? args[1] : undefined;
  if (kind === undefined || implementation === undefined) return null;
  if (args.length === 2 && kind.type === 'Identifier' && !kind.name.endsWith('Kind')) {
    if (implementation.type === 'Identifier') return null;
  }
  if (
    args.length === 2 &&
    kind.type === 'MemberExpression' &&
    !kind.computed &&
    /registry$/i.test(kind.property.name)
  ) {
    return null;
  }
  return { kind, implementation };
}

function isLoop(node: Node): boolean {
  return (
    node.type === 'DoWhileStatement' ||
    node.type === 'ForInStatement' ||
    node.type === 'ForOfStatement' ||
    node.type === 'ForStatement' ||
    node.type === 'WhileStatement'
  );
}

function visitWithAncestors(
  node: Node,
  ancestors: readonly Node[],
  callback: (node: Node, ancestors: readonly Node[]) => void,
): void {
  callback(node, ancestors);
  const nextAncestors = [...ancestors, node];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || value === null || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child !== null && typeof child === 'object' && 'type' in child)
          visitWithAncestors(child as Node, nextAncestors, callback);
      }
    } else if ('type' in value) {
      visitWithAncestors(value as Node, nextAncestors, callback);
    }
  }
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
