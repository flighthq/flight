import { Node, SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';

import { collectEntryPointInventory } from './export-inventory';

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
  sourceFiles: readonly SourceFile[];
}

interface LaneOptions {
  packageName: string;
  publicEntry: SourceFile;
  contractEntry: SourceFile;
  symbols: ReadonlySet<string>;
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
    const name = declaration.getName();
    if (name === undefined) continue;
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
    if (!registrationMaps(declaration, generic, kind, runner)) {
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

export function effectReachabilitySymbols(backend: EffectBackend, sourceFiles: readonly SourceFile[]): Set<string> {
  const prefix = PREFIX[backend];
  const generic = `register${prefix}RenderEffect`;
  const runnerPattern = new RegExp(`^default${prefix}.+EffectRunner$`);
  const registerPattern = new RegExp(`^register${prefix}.+Effect$`);
  const symbols = new Set<string>([generic]);
  for (const declaration of declarationsIn(sourceFiles)) {
    const name = declaration.getName();
    if (name === undefined) continue;
    if (runnerPattern.test(name) || registerPattern.test(name)) symbols.add(name);
  }
  return symbols;
}

export function defaultCompositionSymbols(sourceFiles: readonly SourceFile[]): Set<string> {
  const symbols = new Set<string>();
  for (const declaration of declarationsIn(sourceFiles)) {
    const name = declaration.getName();
    if (name === undefined) continue;
    if (/^default[A-Z].*(?:Renderer|Runner)$/.test(name) && !name.endsWith('EffectRunner')) symbols.add(name);
  }
  return symbols;
}

export function collectReachabilityLanes(options: LaneOptions): ReachabilityLaneEntry[] {
  const dotValues = collectEntryPointInventory(options.publicEntry).valueNames;
  const contractValues = collectEntryPointInventory(options.contractEntry).valueNames;
  return [...options.symbols].sort().map((symbol) => ({
    packageName: options.packageName,
    symbol,
    dot: dotValues.has(symbol),
    contract: contractValues.has(symbol),
  }));
}

function registrationMaps(declaration: Node, generic: string, kind: string, runner: string): boolean {
  return declaration.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const expression = call.getExpression();
    const args = call.getArguments();
    return (
      Node.isIdentifier(expression) &&
      expression.getText() === generic &&
      args[1]?.getText() === `'${kind}'` &&
      args[2]?.getText() === runner
    );
  });
}

function declarationsIn(sourceFiles: readonly SourceFile[]) {
  return sourceFiles.flatMap((sourceFile) => [
    ...sourceFile.getFunctions(),
    ...sourceFile.getVariableStatements().flatMap((statement) => statement.getDeclarations()),
  ]);
}
