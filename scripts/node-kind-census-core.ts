import type { Node } from 'oxc-parser';

import { getParsedOxcSource } from './oxc-source';

// The three functions that mint a graph node. Every Node2D/Node3D in the SDK is created through one of
// them, because they are the only callers of the two runtime factories that stamp a family traits key
// (`Node2DTraitsKey` in scene2d/displayObject.ts, `Node3DTraitsKey` in scene3d/sceneNode.ts). This is a
// SEAM, not a registry: a kind reaches a node only by being passed as an argument here, and nothing
// records that afterwards, which is why the population has to be derived by probing rather than read.
export const NODE_KIND_CHOKEPOINTS: readonly string[] = ['createNode', 'createNode2D', 'createNode3D'];

export type NodeKindFamily = '2d' | '3d';

export type NodeKindExclusionReason =
  // Probed cleanly and is simply not a graph node (a plain entity, a runtime, a descriptor).
  | 'not-a-node'
  // Mints a node but carries no kind of its own: the caller supplies it. `createNode2D` and `createNode`
  // are the generic factories, so they are excluded by what they DO rather than by being named in a list.
  | 'kind-supplied-by-caller'
  // Requires a real domain argument, so a zero-argument probe cannot construct it (`createMorphShape`
  // needs a PathMorph). Recorded rather than fatal because the static chokepoint cross-check below still
  // establishes the kind: the two halves are what make the partition total. Supplying per-constructor
  // arguments would reintroduce the hand-maintained table this instrument exists to avoid.
  | 'probe-threw';

export type NodeKindUnresolvedReason =
  // A chokepoint call whose kind argument is not a statically resolvable constant AND whose enclosing
  // function is not kind-preserving. The instrument cannot bound what this site mints, so it must say so
  // rather than report the part of the population it did manage to see.
  'kind-not-statically-resolvable';

// Where the evidence for a population entry came from. Runtime is the classification authority wherever a
// constructor can be invoked; static chokepoint evidence covers the constructors that require domain
// arguments, which would otherwise drop out of a rosterless census entirely.
export type NodeKindEvidence = 'runtime-probe' | 'static-chokepoint';

export interface NodeKindChokepointSite {
  chokepoint: string;
  enclosingFunction: string;
  // The resolved kind constant VALUE, or null when the argument is not a resolvable constant.
  kind: string | null;
  packageName: string;
  sourceFile: string;
}

export interface NodeKindProbeOutcome {
  exportName: string;
  // `node.kind` when it is a non-empty string, else null.
  kind: string | null;
  packageName: string;
  // The error message when the probe threw, else null.
  thrown: string | null;
  // The family resolved from the live runtime's traits key, or null when the value is not a graph node.
  traits: NodeKindFamily | null;
}

export interface NodeKindPopulationEntry {
  evidence: NodeKindEvidence;
  exportName: string;
  family: NodeKindFamily;
  kind: string;
  packageName: string;
}

export interface NodeKindExcludedEntry {
  exportName: string;
  packageName: string;
  reason: NodeKindExclusionReason;
}

export interface NodeKindUnresolvedEntry {
  detail: string;
  exportName: string;
  packageName: string;
  reason: NodeKindUnresolvedReason;
}

export interface NodeKindCensusReport {
  // Kinds a document registry binds. Empty until a registry exists; the diff below is inert, not absent.
  covered: readonly string[];
  excluded: readonly NodeKindExcludedEntry[];
  // Bound kinds that no public constructor can mint. This is the half that catches a roster naming
  // something that is not a graph node at all.
  extraneous: readonly string[];
  population: readonly NodeKindPopulationEntry[];
  uncovered: readonly string[];
  unresolved: readonly NodeKindUnresolvedEntry[];
}

// Every `export const XKind = 'value'` in the given files, by constant NAME. Package-qualification is
// unnecessary because the SDK requires globally unique exported names, and a name bound to two different
// values is dropped rather than guessed at.
export function collectNodeKindConstants(sourceFiles: readonly string[]): ReadonlyMap<string, string> {
  const candidates = new Map<string, Set<string>>();
  for (const sourceFile of sourceFiles) {
    for (const statement of getParsedOxcSource(sourceFile).program.body) {
      if (statement.type !== 'ExportNamedDeclaration') continue;
      const declaration = statement.declaration;
      if (declaration === null || declaration.type !== 'VariableDeclaration') continue;
      for (const variable of declaration.declarations) {
        if (variable.id.type !== 'Identifier') continue;
        const value = stringLiteralValue(variable.init);
        if (value === null) continue;
        const values = candidates.get(variable.id.name) ?? new Set<string>();
        values.add(value);
        candidates.set(variable.id.name, values);
      }
    }
  }
  const constants = new Map<string, string>();
  for (const [name, values] of candidates) {
    if (values.size !== 1) continue;
    const value = values.values().next().value;
    if (value !== undefined) constants.set(name, value);
  }
  return constants;
}

// Every call to a chokepoint, with its kind argument resolved to a constant value where that is possible.
//
// Two resolution paths, because both occur in the SDK today: a literal constant identifier
// (`createNode2D(SpriteKind, ...)`), and a forwarded parameter carrying a constant default
// (`createMesh(geometry, materials, kind: Kind = MeshKind)` calling `createNode3D(kind, obj)`). The second
// is the shape that defeats a reader matching only literal arguments — it silently drops Mesh and
// Billboard and reports a clean, smaller population.
//
// A chokepoint calling another chokepoint is plumbing rather than a mint (`createNode2D` forwards to
// `createNode`), and is skipped: its kind is by definition the caller's, so it names no kind of its own.
export function collectNodeKindChokepointSites(
  sourceFilesByPackage: ReadonlyMap<string, readonly string[]>,
  constants: ReadonlyMap<string, string>,
): NodeKindChokepointSite[] {
  const sites: NodeKindChokepointSite[] = [];
  for (const [packageName, sourceFiles] of sourceFilesByPackage) {
    for (const sourceFile of sourceFiles) {
      for (const fn of functionsIn(getParsedOxcSource(sourceFile).program.body)) {
        if (NODE_KIND_CHOKEPOINTS.includes(fn.name)) continue;
        if (isKindPreservingConstructor(fn.name)) continue;
        const defaults = parameterDefaults(fn.node);
        for (const call of callsIn(fn.node)) {
          const callee = unwrapExpression(call.callee);
          if (callee === null || callee.type !== 'Identifier') continue;
          if (!NODE_KIND_CHOKEPOINTS.includes(callee.name)) continue;
          const argument = unwrapExpression((call.arguments[0] ?? null) as Node | null);
          sites.push({
            chokepoint: callee.name,
            enclosingFunction: fn.name,
            kind: resolveKindArgument(argument, defaults, constants),
            packageName,
            sourceFile,
          });
        }
      }
    }
  }
  return sites.sort(
    (a, b) =>
      a.sourceFile.localeCompare(b.sourceFile) ||
      a.enclosingFunction.localeCompare(b.enclosingFunction) ||
      a.chokepoint.localeCompare(b.chokepoint),
  );
}

// Every function that reaches a chokepoint, directly or through other functions. Seeded with the
// chokepoints and grown to a fixpoint, so a constructor that wraps another constructor is found without
// being named — which is what a hand-maintained candidate list would fail to do the first time someone
// adds `createLodMesh` on top of `createMesh`.
//
// The graph is keyed by function NAME rather than by module, which the SDK's globally-unique-name rule
// makes sound and which sidesteps resolving `@flighthq/x/contract` specifiers back to source files.
export function collectNodeConstructorCandidates(sourceFiles: readonly string[]): string[] {
  const callees = new Map<string, Set<string>>();
  for (const sourceFile of sourceFiles) {
    for (const fn of functionsIn(getParsedOxcSource(sourceFile).program.body)) {
      const names = callees.get(fn.name) ?? new Set<string>();
      for (const call of callsIn(fn.node)) {
        const callee = unwrapExpression(call.callee);
        if (callee?.type === 'Identifier') names.add(callee.name);
      }
      callees.set(fn.name, names);
    }
  }
  const candidates = new Set<string>(NODE_KIND_CHOKEPOINTS);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, names] of callees) {
      if (candidates.has(name)) continue;
      for (const callee of names) {
        if (!candidates.has(callee)) continue;
        candidates.add(name);
        grew = true;
        break;
      }
    }
  }
  return [...candidates].sort((a, b) => a.localeCompare(b));
}

// The packages whose source calls a chokepoint — the only packages whose public lane can mint a node, and
// therefore the only ones worth probing. Derived, so a new node-minting package joins the probe set by
// existing rather than by being added to a list.
export function collectNodeMintingPackages(sourceFilesByPackage: ReadonlyMap<string, readonly string[]>): string[] {
  const packages: string[] = [];
  for (const [packageName, sourceFiles] of sourceFilesByPackage) {
    if (sourceFiles.some(callsAChokepoint)) packages.push(packageName);
  }
  return packages.sort((a, b) => a.localeCompare(b));
}

// Assembles the report from probe outcomes and chokepoint sites. The RUNTIME outcome decides what a kind
// is; the static sites only cross-check that nothing the chokepoints mint went unseen.
export function createNodeKindCensusReport(input: {
  covered: readonly string[];
  outcomes: readonly NodeKindProbeOutcome[];
  sites: readonly NodeKindChokepointSite[];
}): NodeKindCensusReport {
  const population: NodeKindPopulationEntry[] = [];
  const excluded: NodeKindExcludedEntry[] = [];
  const unresolved: NodeKindUnresolvedEntry[] = [];

  for (const outcome of input.outcomes) {
    if (outcome.thrown !== null) {
      excluded.push({ exportName: outcome.exportName, packageName: outcome.packageName, reason: 'probe-threw' });
      continue;
    }
    if (outcome.traits === null) {
      excluded.push({ exportName: outcome.exportName, packageName: outcome.packageName, reason: 'not-a-node' });
      continue;
    }
    if (outcome.kind === null) {
      excluded.push({
        exportName: outcome.exportName,
        packageName: outcome.packageName,
        reason: 'kind-supplied-by-caller',
      });
      continue;
    }
    population.push({
      evidence: 'runtime-probe',
      exportName: outcome.exportName,
      family: outcome.traits,
      kind: outcome.kind,
      packageName: outcome.packageName,
    });
  }

  // The static half. A chokepoint site that names a kind constant is proof the kind is minted, whether or
  // not the probe could invoke the constructor that does it — this is what keeps a required-argument
  // constructor like `createMorphShape` in the population instead of vanishing into a smaller, cleaner
  // looking number. A site whose kind is dynamic is unresolved: the instrument cannot bound it.
  const mintedKinds = new Set(population.map((entry) => entry.kind));
  for (const site of input.sites) {
    if (site.kind === null) {
      unresolved.push({
        detail: `${site.sourceFile}: ${site.enclosingFunction} calls ${site.chokepoint} with a kind this instrument cannot resolve to a constant`,
        exportName: site.enclosingFunction,
        packageName: site.packageName,
        reason: 'kind-not-statically-resolvable',
      });
      continue;
    }
    if (mintedKinds.has(site.kind)) continue;
    const family = chokepointFamily(site.chokepoint);
    if (family === null) {
      // The base factory is family-agnostic — it stamps whichever runtime its caller passes — so a direct
      // call to it names a kind whose family this instrument cannot determine. No such site exists today;
      // it is unresolved rather than assumed so that adding one is visible instead of silently mislabelled.
      unresolved.push({
        detail: `${site.sourceFile}: ${site.enclosingFunction} mints '${site.kind}' through ${site.chokepoint}, whose family is indeterminate`,
        exportName: site.enclosingFunction,
        packageName: site.packageName,
        reason: 'kind-not-statically-resolvable',
      });
      continue;
    }
    mintedKinds.add(site.kind);
    population.push({
      evidence: 'static-chokepoint',
      exportName: site.enclosingFunction,
      family,
      kind: site.kind,
      packageName: site.packageName,
    });
  }

  const coveredKinds = [...new Set(input.covered)].sort((a, b) => a.localeCompare(b));
  return {
    covered: coveredKinds,
    excluded: excluded.sort(compareByPackageThenExport),
    extraneous: coveredKinds.filter((kind) => !mintedKinds.has(kind)),
    population: population.sort((a, b) => a.kind.localeCompare(b.kind) || a.exportName.localeCompare(b.exportName)),
    uncovered: [...mintedKinds].filter((kind) => !coveredKinds.includes(kind)).sort((a, b) => a.localeCompare(b)),
    unresolved: unresolved.sort(compareByPackageThenExport),
  };
}

// The printed census. R7 makes the runtime test the arbiter, so the derived populations have to be
// legible in the run output rather than described in a note that can drift from what the code found.
export function formatNodeKindCensusReport(report: Readonly<NodeKindCensusReport>): string {
  const lines: string[] = [];
  lines.push(`INCLUDED (graph-node kinds a public constructor mints): ${report.population.length}`);
  for (const entry of report.population) {
    lines.push(
      `  ${entry.kind.padEnd(20)} ${entry.family}  ${entry.evidence.padEnd(17)} ${entry.packageName}.${entry.exportName}`,
    );
  }
  lines.push(`EXCLUDED (probed, not a kind-bearing graph node): ${report.excluded.length}`);
  for (const entry of report.excluded) {
    lines.push(`  ${`${entry.packageName}.${entry.exportName}`.padEnd(44)} ${entry.reason}`);
  }
  lines.push(`UNRESOLVED (must be empty): ${report.unresolved.length}`);
  for (const entry of report.unresolved) {
    lines.push(`  ${entry.reason}: ${entry.detail}`);
  }
  lines.push(
    `COVERED ${report.covered.length} | UNCOVERED ${report.uncovered.length} | EXTRANEOUS ${report.extraneous.length}`,
  );
  if (report.uncovered.length > 0) lines.push(`  uncovered: ${report.uncovered.join(', ')}`);
  if (report.extraneous.length > 0) lines.push(`  extraneous: ${report.extraneous.join(', ')}`);
  return lines.join('\n');
}

// Any of the three fails the run. `unresolved` is included because a census that cannot account for part
// of its own input has not measured the population, and reporting the part it managed to see as the
// answer is the failure this instrument exists to prevent.
export function hasNodeKindCensusFailure(report: Readonly<NodeKindCensusReport>): boolean {
  return report.unresolved.length > 0 || report.uncovered.length > 0 || report.extraneous.length > 0;
}

// A `clone*` reproduces the kind of the node it is given, so it cannot introduce a kind that the
// constructor of its source did not already contribute. Both its probe (which would need a real source
// node) and its chokepoint site (whose kind argument is `source.kind`) are therefore uninformative about
// the population rather than gaps in it. This leans on the SDK's own allocation-verb convention, where
// `clone*` is a defined verb rather than a loose naming habit.
export function isKindPreservingConstructor(exportName: string): boolean {
  return exportName.startsWith('clone');
}

interface NamedFunction {
  name: string;
  node: Node;
}

function chokepointFamily(chokepoint: string): NodeKindFamily | null {
  if (chokepoint === 'createNode2D') return '2d';
  if (chokepoint === 'createNode3D') return '3d';
  return null;
}

function callsAChokepoint(sourceFile: string): boolean {
  for (const fn of functionsIn(getParsedOxcSource(sourceFile).program.body)) {
    if (NODE_KIND_CHOKEPOINTS.includes(fn.name)) continue;
    for (const call of callsIn(fn.node)) {
      const callee = unwrapExpression(call.callee);
      if (callee?.type === 'Identifier' && NODE_KIND_CHOKEPOINTS.includes(callee.name)) return true;
    }
  }
  return false;
}

function callsIn(node: Node): Extract<Node, { type: 'CallExpression' }>[] {
  const calls: Extract<Node, { type: 'CallExpression' }>[] = [];
  walk(node, (child) => {
    if (child.type === 'CallExpression') calls.push(child);
  });
  return calls;
}

function compareByPackageThenExport(
  a: Readonly<{ exportName: string; packageName: string }>,
  b: Readonly<{ exportName: string; packageName: string }>,
): number {
  return a.packageName.localeCompare(b.packageName) || a.exportName.localeCompare(b.exportName);
}

function functionsIn(statements: readonly Node[]): NamedFunction[] {
  const functions: NamedFunction[] = [];
  for (const statement of statements) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration === null || declaration === undefined) continue;
    if (declaration.type === 'FunctionDeclaration' && declaration.id !== null) {
      functions.push({ name: declaration.id.name, node: declaration });
    } else if (declaration.type === 'VariableDeclaration') {
      for (const variable of declaration.declarations) {
        if (variable.id.type !== 'Identifier' || variable.init === null) continue;
        if (variable.init.type !== 'ArrowFunctionExpression' && variable.init.type !== 'FunctionExpression') continue;
        functions.push({ name: variable.id.name, node: variable.init });
      }
    }
  }
  return functions;
}

// Parameter name -> the identifier its default initializer names. Only identifier defaults matter: a kind
// default is always a constant reference (`kind: Kind = MeshKind`), never an expression.
function parameterDefaults(node: Node): ReadonlyMap<string, string> {
  const defaults = new Map<string, string>();
  const parameters =
    node.type === 'FunctionDeclaration' || node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression'
      ? node.params
      : [];
  for (const parameter of parameters) {
    const pattern = parameter as Node;
    if (pattern.type !== 'AssignmentPattern') continue;
    if (pattern.left.type !== 'Identifier') continue;
    const right = unwrapExpression(pattern.right);
    if (right?.type === 'Identifier') defaults.set(pattern.left.name, right.name);
  }
  return defaults;
}

function resolveKindArgument(
  argument: Node | null,
  defaults: ReadonlyMap<string, string>,
  constants: ReadonlyMap<string, string>,
): string | null {
  if (argument === null) return null;
  const literal = stringLiteralValue(argument);
  if (literal !== null) return literal;
  if (argument.type !== 'Identifier') return null;
  const direct = constants.get(argument.name);
  if (direct !== undefined) return direct;
  const forwarded = defaults.get(argument.name);
  if (forwarded === undefined) return null;
  return constants.get(forwarded) ?? null;
}

function stringLiteralValue(node: Node | null | undefined): string | null {
  const expression = unwrapExpression(node ?? null);
  return expression?.type === 'Literal' && typeof expression.value === 'string' && expression.value.length > 0
    ? expression.value
    : null;
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

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const value of Object.values(node as unknown as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) walk(item, visit);
      }
    } else if (isNode(value)) {
      walk(value, visit);
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}
