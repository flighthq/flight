import type { FunctionDeclaration, Node as MorphNode, SourceFile, VariableDeclaration } from 'ts-morph';
import { Node, SyntaxKind } from 'ts-morph';

export type ReachabilityKind = 'default-renderer' | 'default-runner' | 'per-kind-registrar';
export type ReachabilityLane = 'contract-only' | 'private';

export interface ReachabilityAllowance {
  packageName: string;
  symbol: string;
  source: string;
  reason: string;
}

export interface ReachabilityCandidate {
  packageName: string;
  symbol: string;
  source: string;
  line: number;
  kind: ReachabilityKind;
}

export interface ReachabilityViolation extends ReachabilityCandidate {
  lane: ReachabilityLane;
}

export interface ReachabilityAudit {
  candidates: number;
  allowed: Array<ReachabilityViolation & { reason: string }>;
  violations: ReachabilityViolation[];
  staleAllowances: ReachabilityAllowance[];
}

// Shared authoritative inventory for checks that need to distinguish the cultivated application API
// from the complete sibling contract. Keep this sourced from ts-morph's resolved barrel declarations:
// text searches cannot follow re-export aliases or tell a contract-only symbol from a nonexistent one.
export interface PackageEntryPointInventory {
  publicNames: ReadonlySet<string>;
  contractNames: ReadonlySet<string>;
}

interface AuditOptions {
  packageName: string;
  sourceFiles: readonly SourceFile[];
  publicNames: ReadonlySet<string>;
  contractNames: ReadonlySet<string>;
  relativePath: (sourceFile: SourceFile) => string;
  allowances: readonly ReachabilityAllowance[];
}

type CandidateDeclaration = FunctionDeclaration | VariableDeclaration;

const DEFAULT_RUNNER = /^default[A-Z].*Runner$/;
const DEFAULT_RENDERER = /^default[A-Z].*Renderer$/;
const REGISTER = /^register[A-Z]/;

export function collectEntryPointInventory(
  publicEntry: SourceFile,
  contractEntry?: SourceFile,
): PackageEntryPointInventory {
  return {
    publicNames: new Set(publicEntry.getExportedDeclarations().keys()),
    contractNames: new Set(contractEntry?.getExportedDeclarations().keys() ?? []),
  };
}

// Finds declared composition points, not merely already-exported ones. That distinction is the point of
// the gate: a new default implementation cannot disappear just because its author forgot both barrels.
export function auditReachability(options: AuditOptions): ReachabilityAudit {
  const candidates = options.sourceFiles.flatMap((sourceFile) =>
    declarationsIn(sourceFile).flatMap((declaration) => {
      const kind = classifyReachabilityDeclaration(declaration);
      if (kind === null) return [];
      return [
        {
          packageName: options.packageName,
          symbol: declaration.getName(),
          source: options.relativePath(sourceFile),
          line: declaration.getStartLineNumber(),
          kind,
        } satisfies ReachabilityCandidate,
      ];
    }),
  );

  const allowed: Array<ReachabilityViolation & { reason: string }> = [];
  const violations: ReachabilityViolation[] = [];
  const usedAllowances = new Set<ReachabilityAllowance>();

  for (const candidate of candidates) {
    if (options.publicNames.has(candidate.symbol)) continue;
    const violation: ReachabilityViolation = {
      ...candidate,
      lane: options.contractNames.has(candidate.symbol) ? 'contract-only' : 'private',
    };
    const allowance = options.allowances.find(
      (entry) =>
        entry.packageName === candidate.packageName &&
        entry.symbol === candidate.symbol &&
        entry.source === candidate.source,
    );
    if (allowance !== undefined && allowance.reason.trim() !== '') {
      usedAllowances.add(allowance);
      allowed.push({ ...violation, reason: allowance.reason });
    } else {
      violations.push(violation);
    }
  }

  return {
    candidates: candidates.length,
    allowed,
    violations,
    staleAllowances: options.allowances.filter(
      (entry) => entry.packageName === options.packageName && !usedAllowances.has(entry),
    ),
  };
}

export function classifyReachabilityDeclaration(declaration: CandidateDeclaration): ReachabilityKind | null {
  const name = declaration.getName();
  if (DEFAULT_RUNNER.test(name)) return 'default-runner';
  if (DEFAULT_RENDERER.test(name)) return 'default-renderer';
  return REGISTER.test(name) && isPerKindRegistrar(declaration) ? 'per-kind-registrar' : null;
}

// A per-kind registrar is a thin, specific wrapper around one more-general register* primitive. The
// kind argument may be a literal (`'BlurEffect'`) or a declared *Kind token. Requiring one nested
// registration excludes generic registries and aggregate `registerDefaults()` conveniences.
function isPerKindRegistrar(declaration: CandidateDeclaration): boolean {
  const body = callableBody(declaration);
  if (body === null) return false;
  const calls = body.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expression = call.getExpression();
    return (
      Node.isIdentifier(expression) &&
      REGISTER.test(expression.getText()) &&
      expression.getText() !== declaration.getName()
    );
  });
  if (calls.length !== 1) return false;
  return calls[0].getArguments().some(isKindArgument);
}

function callableBody(declaration: CandidateDeclaration): MorphNode | null {
  if (Node.isFunctionDeclaration(declaration)) return declaration.getBody() ?? null;
  const initializer = declaration.getInitializer();
  if (initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
    return initializer.getBody();
  }
  return null;
}

function isKindArgument(node: MorphNode): boolean {
  if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) return true;
  if (Node.isIdentifier(node)) return node.getText().endsWith('Kind');
  return Node.isPropertyAccessExpression(node) && node.getName().endsWith('Kind');
}

function declarationsIn(sourceFile: SourceFile): CandidateDeclaration[] {
  return [
    ...sourceFile.getFunctions(),
    ...sourceFile.getVariableStatements().flatMap((statement) => statement.getDeclarations()),
  ];
}
