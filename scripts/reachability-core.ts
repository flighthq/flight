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
  status: 'catalogued' | 'mechanism' | 'UNCATALOGUED';
  mechanismShape: RegistrarMechanismShape | null;
  uncataloguedBucket: UncataloguedRegistrarBucket | null;
  door: string | null;
  kind: string | null;
  implementation: string | null;
}

export type RegistrarMechanismShape = 'caller-supplied-batch' | 'caller-supplied-kind';

export type UncataloguedRegistrarBucket =
  | 'kind-identifier'
  | 'kind-member-or-computed'
  | 'implementation-call-result'
  | 'implementation-inline'
  | 'callee-expression'
  | 'hidden-loop-or-array'
  | 'not-kind-registration';

export interface RegistrarKindConstants {
  identifiers: ReadonlyMap<string, string>;
  members: ReadonlyMap<string, string>;
}

export interface RegistrarRuntimeDeclaration {
  packageName: string;
  parameters: readonly RegistrarRuntimeParameter[];
  registrar: string;
  sourceFile: string;
}

export interface RegistrarRuntimeParameter {
  defaulted: boolean;
  name: string;
  typeNames: readonly string[];
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
  constants?: RegistrarKindConstants;
  packageName: string;
  sourceFiles: readonly string[];
}

interface NamedDeclaration {
  exported: boolean;
  importAliases: ReadonlyMap<string, string>;
  name: string;
  node: Node;
  sourceFile: string;
}

interface RegistrationMapping {
  door: string;
  kind: string;
  implementation: string;
}

const PREFIX: Record<EffectBackend, string> = { canvas: 'Canvas', gl: 'Gl', wgpu: 'Wgpu' };
const EMPTY_KIND_CONSTANTS: RegistrarKindConstants = { identifiers: new Map(), members: new Map() };

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

// This is an ownership inventory, not a name-derived guess: it records only a string-valued kind and
// implementation identifier a registrar body actually passes through a register* door. Caller-supplied
// registrars remain visible as mechanisms, while every other unreadable registrar remains UNCATALOGUED.
export function collectRegistrarOwnership(options: RegistrarOwnershipOptions): RegistrarOwnershipEntry[] {
  const entries: RegistrarOwnershipEntry[] = [];
  for (const declaration of declarationsIn(options.sourceFiles)) {
    if (!declaration.exported || !/^register[A-Z]/.test(declaration.name)) continue;
    const mappings = registrationMappings(
      declaration.node,
      options.constants ?? EMPTY_KIND_CONSTANTS,
      declaration.importAliases,
    );
    if (mappings.length === 0) {
      const mechanismShape = registrarMechanismShape(declaration.node);
      if (mechanismShape !== null) {
        entries.push({
          packageName: options.packageName,
          registrar: declaration.name,
          status: 'mechanism',
          mechanismShape,
          uncataloguedBucket: null,
          door: null,
          kind: null,
          implementation: null,
        });
        continue;
      }
      entries.push({
        packageName: options.packageName,
        registrar: declaration.name,
        status: 'UNCATALOGUED',
        mechanismShape: null,
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
        mechanismShape: null,
        uncataloguedBucket: null,
        ...mapping,
      });
    }
  }
  return entries.sort(compareRegistrarOwnership);
}

// The bounded constant pass deliberately accepts only exported string constants and exported object
// members whose values are strings. Ambiguous names remain unresolved rather than acquiring a value from
// package traversal order. Import aliases are applied later at each registrar's source file.
export function collectRegistrarKindConstants(sourceFiles: readonly string[]): RegistrarKindConstants {
  const identifierCandidates = new Map<string, Set<string>>();
  const memberCandidates = new Map<string, Set<string>>();
  for (const declaration of declarationsIn(sourceFiles)) {
    if (!declaration.exported || declaration.node.type !== 'VariableDeclarator') continue;
    const initializer = unwrapExpression(declaration.node.init);
    const value = stringLiteralValue(initializer);
    if (value !== null) addConstantCandidate(identifierCandidates, declaration.name, value);
    if (initializer?.type !== 'ObjectExpression') continue;
    for (const property of initializer.properties) {
      if (property.type !== 'Property') continue;
      const member = propertyName(property.key, property.computed);
      const memberValue = stringLiteralValue(unwrapExpression(property.value));
      if (member === null || memberValue === null) continue;
      addConstantCandidate(memberCandidates, `${declaration.name}\0${member}`, memberValue);
    }
  }
  return {
    identifiers: uniqueConstantValues(identifierCandidates),
    members: uniqueConstantValues(memberCandidates),
  };
}

export function collectRegistrarRuntimeDeclarations(options: RegistrarOwnershipOptions): RegistrarRuntimeDeclaration[] {
  return declarationsIn(options.sourceFiles)
    .filter((declaration) => declaration.exported && /^register[A-Z]/.test(declaration.name))
    .map((declaration) => ({
      packageName: options.packageName,
      parameters: runtimeParameters(declaration.node),
      registrar: declaration.name,
      sourceFile: declaration.sourceFile,
    }))
    .sort((a, b) => a.registrar.localeCompare(b.registrar) || a.sourceFile.localeCompare(b.sourceFile));
}

function declarationsIn(sourceFiles: readonly string[]): NamedDeclaration[] {
  const declarations: NamedDeclaration[] = [];
  for (const sourceFile of sourceFiles) {
    const statements = getParsedOxcSource(sourceFile).program.body;
    const importAliases = collectImportAliases(statements);
    for (const statement of statements) {
      const exported = statement.type === 'ExportNamedDeclaration';
      const declaration = exported ? statement.declaration : statement;
      if (declaration === null) continue;
      if (declaration.type === 'FunctionDeclaration' || declaration.type === 'TSDeclareFunction') {
        if (declaration.id !== null)
          declarations.push({ exported, importAliases, name: declaration.id.name, node: declaration, sourceFile });
      } else if (declaration.type === 'VariableDeclaration') {
        for (const variable of declaration.declarations)
          addVariableDeclaration(declarations, variable, exported, importAliases, sourceFile);
      }
    }
  }
  return declarations;
}

function addVariableDeclaration(
  declarations: NamedDeclaration[],
  variable: VariableDeclarator,
  exported: boolean,
  importAliases: ReadonlyMap<string, string>,
  sourceFile: string,
): void {
  if (variable.id.type === 'Identifier')
    declarations.push({ exported, importAliases, name: variable.id.name, node: variable, sourceFile });
}

function registrationMappings(
  declaration: Node,
  constants: RegistrarKindConstants = EMPTY_KIND_CONSTANTS,
  importAliases: ReadonlyMap<string, string> = new Map(),
): RegistrationMapping[] {
  const mappings = new Map<string, RegistrationMapping>();
  visit(declaration, (node) => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return;
    const pair = registrationPairArguments(node.arguments);
    if (pair === null) return;
    const kind = resolveKind(pair.kind, constants, importAliases);
    if (/^register[A-Z]/.test(node.callee.name) && kind !== null && pair.implementation.type === 'Identifier') {
      const mapping = {
        door: node.callee.name,
        kind,
        implementation: pair.implementation.name,
      };
      mappings.set(`${mapping.door}\0${mapping.kind}\0${mapping.implementation}`, mapping);
    }
  });
  return [...mappings.values()].sort(compareRegistrationMapping);
}

// The classification describes why the string-kind/identifier-implementation recorder did not recover
// a row; it does not claim the registrar itself is underivable. Buckets are exclusive. A hidden
// loop/array is the outermost shape, then a non-bare callee mirrors the walk's first rejection. For a
// bare register* call, implementation shape precedes kind shape because constant folding alone cannot
// recover an inline implementation. Anything with no fixed kind-registration call stays outside the
// miss denominator as not-kind-registration.
function classifyUncataloguedRegistrar(declaration: Node): UncataloguedRegistrarBucket {
  const evidence = collectUncataloguedEvidence(declaration);
  if (evidence.loopOrArray) return 'hidden-loop-or-array';
  if (evidence.calleeExpression) return 'callee-expression';
  if (evidence.implementationInline) return 'implementation-inline';
  if (evidence.implementationCallResult) return 'implementation-call-result';
  if (evidence.kindMemberOrComputed) return 'kind-member-or-computed';
  if (evidence.kindIdentifier) return 'kind-identifier';
  return 'not-kind-registration';
}

interface UncataloguedEvidence {
  calleeExpression: boolean;
  implementationCallResult: boolean;
  implementationInline: boolean;
  kindIdentifier: boolean;
  kindMemberOrComputed: boolean;
  loopOrArray: boolean;
}

function collectUncataloguedEvidence(declaration: Node): UncataloguedEvidence {
  const evidence: UncataloguedEvidence = {
    calleeExpression: false,
    implementationCallResult: false,
    implementationInline: false,
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
    if (pair.implementation.type === 'CallExpression') evidence.implementationCallResult = true;
    else if (
      pair.implementation.type === 'ArrowFunctionExpression' ||
      pair.implementation.type === 'FunctionExpression' ||
      pair.implementation.type === 'ObjectExpression'
    ) {
      evidence.implementationInline = true;
    }
    if (pair.kind.type === 'Identifier') evidence.kindIdentifier = true;
    else if (pair.kind.type === 'MemberExpression') evidence.kindMemberOrComputed = true;
  });
  return evidence;
}

// A registrar whose key originates in one of its parameters owns the registration mechanism, not a
// concrete kind. Direct forms and loops over caller-supplied collections are kept separate so a hidden
// module array cannot disappear into the honest batch category. The data-flow is intentionally bounded:
// function parameters, local variable initializers, and for-in/of bindings only.
function registrarMechanismShape(declaration: Node): RegistrarMechanismShape | null {
  const parameterNames = functionParameterNames(declaration);
  if (parameterNames.size === 0) return null;
  const callerValues = collectCallerDerivedNames(declaration, parameterNames);
  let batch = false;
  let direct = false;
  visitWithAncestors(declaration, [], (node, ancestors) => {
    if (
      node.type !== 'CallExpression' ||
      (!isRegistrationCall(node.callee) && !isPersistentRegistryTableRegistrationCall(node.callee))
    ) {
      return;
    }
    const parameterLoop = ancestors.find(
      (ancestor) =>
        (ancestor.type === 'ForOfStatement' || ancestor.type === 'ForInStatement') &&
        expressionReferencesAny(ancestor.right, callerValues),
    );
    if (parameterLoop !== undefined) {
      batch = true;
      return;
    }
    if (isPersistentRegistryTableRegistrationCall(node.callee)) {
      const kind = node.arguments[1];
      if (kind !== undefined && expressionReferencesAny(kind, callerValues)) direct = true;
      return;
    }
    if (node.callee.type !== 'MemberExpression') return;
    const property = memberExpressionName(node.callee);
    if (property !== 'register' && property !== 'set') return;
    const kind = node.arguments[0];
    if (kind !== undefined && expressionReferencesAny(kind, callerValues)) direct = true;
  });
  if (direct) return 'caller-supplied-kind';
  return batch ? 'caller-supplied-batch' : null;
}

function functionParameterNames(declaration: Node): Set<string> {
  if (declaration.type === 'FunctionDeclaration' || declaration.type === 'TSDeclareFunction') {
    return bindingNames(declaration.params);
  }
  if (
    declaration.type === 'VariableDeclarator' &&
    (declaration.init?.type === 'ArrowFunctionExpression' || declaration.init?.type === 'FunctionExpression')
  ) {
    return bindingNames(declaration.init.params);
  }
  return new Set();
}

function runtimeParameters(declaration: Node): RegistrarRuntimeParameter[] {
  const parameters =
    declaration.type === 'FunctionDeclaration' || declaration.type === 'TSDeclareFunction'
      ? declaration.params
      : declaration.type === 'VariableDeclarator' &&
          (declaration.init?.type === 'ArrowFunctionExpression' || declaration.init?.type === 'FunctionExpression')
        ? declaration.init.params
        : [];
  return parameters.map((parameter, index) => {
    const node = parameter as Node;
    const binding = node.type === 'AssignmentPattern' ? node.left : node;
    const annotated = binding as Node & { typeAnnotation?: { typeAnnotation: Node } | null };
    return {
      defaulted: node.type === 'AssignmentPattern',
      name: binding.type === 'Identifier' ? binding.name : `parameter${index + 1}`,
      typeNames: collectTypeNames(annotated.typeAnnotation?.typeAnnotation ?? null),
    };
  });
}

function collectTypeNames(typeNode: Node | null): string[] {
  if (typeNode === null) return [];
  const names = new Set<string>();
  visit(typeNode, (node) => {
    if (node.type === 'TSTypeReference' && node.typeName.type === 'Identifier') names.add(node.typeName.name);
    else if (node.type === 'TSStringKeyword') names.add('string');
    else if (node.type === 'TSNumberKeyword') names.add('number');
    else if (node.type === 'TSBooleanKeyword') names.add('boolean');
    else if (node.type === 'TSFunctionType') names.add('Function');
    else if (node.type === 'TSArrayType' || node.type === 'TSTupleType') names.add('Array');
  });
  return [...names];
}

function bindingNames(bindings: readonly Node[]): Set<string> {
  const names = new Set<string>();
  for (const binding of bindings) collectBindingNames(binding, names);
  return names;
}

function collectBindingNames(binding: Node, names: Set<string>): void {
  if (binding.type === 'Identifier') {
    names.add(binding.name);
    return;
  }
  if (binding.type === 'AssignmentPattern') {
    collectBindingNames(binding.left, names);
    return;
  }
  if (binding.type === 'RestElement') {
    collectBindingNames(binding.argument, names);
    return;
  }
  if (binding.type === 'ArrayPattern') {
    for (const element of binding.elements) if (element !== null) collectBindingNames(element, names);
    return;
  }
  if (binding.type !== 'ObjectPattern') return;
  for (const property of binding.properties) {
    if (property.type === 'RestElement') collectBindingNames(property.argument, names);
    else collectBindingNames(property.value, names);
  }
}

function collectCallerDerivedNames(declaration: Node, parameters: ReadonlySet<string>): Set<string> {
  const names = new Set(parameters);
  let changed = true;
  while (changed) {
    changed = false;
    visit(declaration, (node) => {
      if (node.type === 'VariableDeclarator' && node.init !== null && expressionReferencesAny(node.init, names)) {
        const before = names.size;
        collectBindingNames(node.id, names);
        changed ||= names.size !== before;
      }
      if (
        (node.type === 'ForOfStatement' || node.type === 'ForInStatement') &&
        expressionReferencesAny(node.right, names)
      ) {
        const before = names.size;
        const left = node.left;
        if (left.type === 'VariableDeclaration') {
          for (const variable of left.declarations) collectBindingNames(variable.id, names);
        } else {
          collectBindingNames(left, names);
        }
        changed ||= names.size !== before;
      }
    });
  }
  return names;
}

function expressionReferencesAny(node: Node, names: ReadonlySet<string>): boolean {
  if (node.type === 'Identifier') return names.has(node.name);
  for (const [key, value] of Object.entries(node)) {
    if (
      key === 'parent' ||
      value === null ||
      typeof value !== 'object' ||
      (node.type === 'MemberExpression' && key === 'property' && !node.computed) ||
      (node.type === 'Property' && key === 'key' && !node.computed)
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child !== null && typeof child === 'object' && 'type' in child) {
          if (expressionReferencesAny(child as Node, names)) return true;
        }
      }
    } else if ('type' in value && expressionReferencesAny(value as Node, names)) {
      return true;
    }
  }
  return false;
}

function isRegistrationCall(callee: Node): boolean {
  if (callee.type === 'Identifier') return /^register[A-Z]/.test(callee.name);
  if (callee.type !== 'MemberExpression') return false;
  if (callee.computed) return callee.property.type === 'Literal' && callee.property.value === 'register';
  return (
    callee.property.name === 'register' || callee.property.name === 'set' || /^register[A-Z]/.test(callee.property.name)
  );
}

function isPersistentRegistryTableRegistrationCall(callee: Node): boolean {
  return callee.type === 'Identifier' && callee.name === 'withRegistryTableEntry';
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

function resolveKind(
  node: Node,
  constants: RegistrarKindConstants,
  importAliases: ReadonlyMap<string, string>,
): string | null {
  const expression = unwrapExpression(node);
  const literal = stringLiteralValue(expression);
  if (literal !== null) return literal;
  if (expression?.type === 'Identifier') {
    return constants.identifiers.get(importAliases.get(expression.name) ?? expression.name) ?? null;
  }
  if (expression?.type !== 'MemberExpression') return null;
  const object = unwrapExpression(expression.object);
  const member = memberExpressionName(expression);
  if (object?.type !== 'Identifier' || member === null) return null;
  const objectName = importAliases.get(object.name) ?? object.name;
  return constants.members.get(`${objectName}\0${member}`) ?? null;
}

function collectImportAliases(statements: readonly Node[]): ReadonlyMap<string, string> {
  const aliases = new Map<string, string>();
  for (const statement of statements) {
    if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type') continue;
      const imported = specifier.imported;
      const importedName = imported.type === 'Identifier' ? imported.name : String(imported.value);
      aliases.set(specifier.local.name, importedName);
    }
  }
  return aliases;
}

function unwrapExpression(node: Node | null): Node | null {
  let expression = node;
  while (
    expression !== null &&
    (expression.type === 'ChainExpression' ||
      expression.type === 'ParenthesizedExpression' ||
      expression.type === 'TSAsExpression' ||
      expression.type === 'TSNonNullExpression' ||
      expression.type === 'TSSatisfiesExpression' ||
      expression.type === 'TSTypeAssertion')
  ) {
    expression = expression.expression;
  }
  return expression;
}

function stringLiteralValue(node: Node | null): string | null {
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
}

function propertyName(key: Node, computed: boolean): string | null {
  if (!computed && key.type === 'Identifier') return key.name;
  return key.type === 'Literal' && typeof key.value === 'string' ? key.value : null;
}

function memberExpressionName(member: Extract<Node, { type: 'MemberExpression' }>): string | null {
  return propertyName(member.property, member.computed);
}

function addConstantCandidate(candidates: Map<string, Set<string>>, name: string, value: string): void {
  const values = candidates.get(name) ?? new Set<string>();
  values.add(value);
  candidates.set(name, values);
}

function uniqueConstantValues(candidates: ReadonlyMap<string, ReadonlySet<string>>): ReadonlyMap<string, string> {
  const constants = new Map<string, string>();
  for (const [name, values] of candidates) {
    if (values.size !== 1) continue;
    const value = values.values().next().value;
    if (value !== undefined) constants.set(name, value);
  }
  return constants;
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
