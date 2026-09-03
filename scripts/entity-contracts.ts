// Semantic integrity gate for named-base-plus-inline-object intersections. These refinements are
// useful for closed discriminated unions, platform feature detection, and backend-local views, but
// the same syntax can silently weaken a required/readonly member or leak a package-private shape
// through a public signature. The predicates below resolve symbols and assignability through
// TypeScript's type graph; there is no file, type, or call-site roster.
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import { Node, Project, SymbolFlags, SyntaxKind, TypeFormatFlags, ts } from 'ts-morph';
import type {
  CallExpression,
  Expression,
  FunctionDeclaration,
  IndexSignatureDeclaration,
  PropertySignature,
  Signature,
  SourceFile,
  Symbol as MorphSymbol,
  Type,
  TypeAliasDeclaration,
  TypeLiteralNode,
  TypeNode,
  TypeReferenceNode,
  VariableDeclaration,
} from 'ts-morph';

import { formatGateProvenance, readGateTreeState } from './gate-provenance';

// Required/readonly weakening and exact duplicate members are unsound in every named-base refinement,
// so they fail the gate. Exported production create* object results outside Entity and EntityRuntime are
// contract violations: user-facing Flight SDK objects belong on Entity, while native objects, collections,
// and true descriptor/options/type-only results are excluded semantically. clone* is outside this doctrine.
// Implementation-local signature aliases and hidden Entity fields remain advisory while their public type-home
// policy is settled.

export type EntityContractRule =
  | 'exported-create-return'
  | 'invalid-non-entity-create-result'
  | 'redundant-inline-member'
  | 'readonly-redeclaration'
  | 'redundant-optional-property';

export type EntityContractAdvisoryRule = 'exported-local-alias' | 'hidden-entity-field';

export interface EntityContractIssue {
  column: number;
  detail: string;
  line: number;
  name: string;
  path: string;
  rule: EntityContractRule;
}

export interface EntityContractAdvisory extends Omit<EntityContractIssue, 'rule'> {
  rule: EntityContractAdvisoryRule;
}

export interface ExportedCreateCandidate extends EntityContractIssue {
  returnTypes: readonly string[];
  rule: 'exported-create-return';
}

export type ExportedCreateExclusionReason =
  | 'array-or-tuple'
  | 'callable'
  | 'descriptor'
  | 'external-native'
  | 'non-object-result'
  | 'options'
  | 'type-only';

export interface ExportedCreateExclusion {
  column: number;
  line: number;
  name: string;
  path: string;
  reasons: readonly ExportedCreateExclusionReason[];
  returnTypes: readonly string[];
  source: 'automatic' | 'marker';
}

export interface EntityContractReport {
  advisories: readonly EntityContractAdvisory[];
  candidateIntersections: number;
  excludedDeclarationFiles: number;
  excludedTestFiles: number;
  excludedTestHelperFiles: number;
  excludedToolingFiles: number;
  exportedCreateCandidates: readonly ExportedCreateCandidate[];
  exportedCreateEntityReturns: number;
  exportedCreateExclusions: readonly ExportedCreateExclusion[];
  exportedCreateFunctions: number;
  exportedCreateRuntimeReturns: number;
  exportedSignatures: number;
  issues: readonly EntityContractIssue[];
  runtimeCreateExceptions: readonly string[];
  scannedFiles: number;
}

export interface EntityContractScope {
  project: Project;
  root: string;
  sourceFiles: readonly SourceFile[];
}

export interface ExportedCreateRemediationPackage {
  candidates: readonly ExportedCreateCandidate[];
  packageName: string;
}

export interface ExportedCreateRemediationReport {
  acceptedEntity: number;
  acceptedEntityRuntime: number;
  automaticExclusions: readonly ExportedCreateExclusion[];
  candidatePredicate: 'exported production create* object result outside Entity and EntityRuntime';
  candidates: number;
  excludedFactoryPrefixes: readonly ['clone'];
  mode: 'enforced';
  markedExclusions: readonly ExportedCreateExclusion[];
  packages: readonly ExportedCreateRemediationPackage[];
  runtimeExceptions: readonly string[];
  semanticSecondRoots: readonly ['EntityRuntime'];
  targetContract: 'user-facing Flight SDK objects transitively assign to Entity';
  total: number;
}

interface CandidateIntersection {
  bases: readonly TypeNode[];
  literals: readonly TypeLiteralNode[];
  node: TypeNode;
}

interface ExportedSurface {
  declaration: FunctionDeclaration | VariableDeclaration;
  names: Set<string>;
}

interface FactoryReturn {
  expressions: readonly Expression[];
  name: string;
  node: FunctionDeclaration;
}

interface LocalAliasExposure {
  alias: TypeAliasDeclaration;
  surfaces: Set<string>;
}

interface ExportedCreateCensus {
  candidates: ExportedCreateCandidate[];
  entity: number;
  exclusions: ExportedCreateExclusion[];
  issues: EntityContractIssue[];
  runtime: number;
  runtimeNames: string[];
  total: number;
}

interface NonEntityCreateMarkerClassification {
  detail?: string;
  kind?: 'descriptor' | 'options' | 'type-only';
  node: TypeReferenceNode;
}

const FACTORY_NAME = /^(?:clone|create)[A-Z0-9]/;
const SOURCE_EXTENSION = /\.(?:[cm]?ts|tsx)$/;
const TEST_SOURCE = /(?:^|\/)(?:__tests__|tests?)(?:\/|$)|\.(?:spec|test)\.(?:[cm]?ts|tsx)$/;
const TEST_HELPER_SOURCE = /(?:testhelper|testsupport)\.(?:[cm]?ts|tsx)$/i;

export function checkEntityContracts(scope: Readonly<EntityContractScope>): EntityContractReport {
  const entitySource = scope.sourceFiles.find((source) =>
    normalizePath(source.getFilePath()).endsWith('/types/src/Entity.ts'),
  );
  if (entitySource === undefined) throw new Error('Entity contract gate could not find packages/types/src/Entity.ts');
  const entityType = entitySource.getInterfaceOrThrow('Entity').getType();
  const entityRuntimeType = entitySource.getInterfaceOrThrow('EntityRuntime').getType();
  const markerSource = scope.sourceFiles.find((source) =>
    normalizePath(source.getFilePath()).endsWith('/types/src/NonEntityCreateResult.ts'),
  );
  if (markerSource === undefined) {
    throw new Error('Entity contract gate could not find packages/types/src/NonEntityCreateResult.ts');
  }
  const nonEntityCreateResult = markerSource.getTypeAliasOrThrow('NonEntityCreateResult');
  const advisories: EntityContractAdvisory[] = [];
  const issues: EntityContractIssue[] = [];
  const candidates = scope.sourceFiles.flatMap(collectCandidateIntersections);
  const factories = scope.sourceFiles.flatMap(collectFactoryReturns);
  for (const factory of factories) {
    if (entityCategory(factory.node.getReturnType(), entityType, entityRuntimeType) !== 'entity') continue;
    advisories.push(...collectHiddenEntityFields(factory, candidates, scope.root));
  }

  for (const candidate of candidates) {
    for (const literal of candidate.literals) {
      for (const property of literal.getProperties()) {
        const name = property.getName();
        const baseProperties = candidate.bases.flatMap((base) => {
          const type = base.getType();
          const symbol = type.getProperty(name);
          return symbol === undefined ? [] : [{ readonly: hasReadonlyProperty(type, name), symbol }];
        });
        if (
          property.hasQuestionToken() &&
          baseProperties.some(({ symbol }) => !symbol.hasFlags(SymbolFlags.Optional))
        ) {
          issues.push(
            issue(
              scope.root,
              property,
              'redundant-optional-property',
              name,
              'inline property is optional even though a named base already requires it',
            ),
          );
        }
        if (
          !property.isReadonly() &&
          baseProperties.some(({ readonly, symbol }) => readonly && hasSamePropertyType(property, symbol))
        ) {
          issues.push(
            issue(
              scope.root,
              property,
              'readonly-redeclaration',
              name,
              'inline property is writable even though a named base declares it readonly',
            ),
          );
        }
        if (baseProperties.some(({ readonly, symbol }) => isRedundantProperty(property, symbol, readonly))) {
          issues.push(
            issue(
              scope.root,
              property,
              'redundant-inline-member',
              name,
              'inline property exactly repeats a named base property',
            ),
          );
        }
      }
      for (const index of literal.getIndexSignatures()) {
        const kind = indexKind(index);
        if (
          !index.isReadonly() &&
          candidate.bases.some((base) => {
            const baseType = base.getType();
            return indexType(baseType, kind) !== undefined && hasReadonlyIndex(baseType, kind);
          })
        ) {
          issues.push(
            issue(
              scope.root,
              index,
              'readonly-redeclaration',
              `[${kind}]`,
              `inline ${kind} index is writable even though a named base declares it readonly`,
            ),
          );
        }
      }
    }
  }

  const exportedSurfaces = collectExportedSurfaces(scope.sourceFiles);
  const exportedCreateCensus = collectExportedCreateCensus(
    exportedSurfaces,
    entityType,
    entityRuntimeType,
    nonEntityCreateResult,
    scope.root,
  );
  issues.push(...exportedCreateCensus.candidates, ...exportedCreateCensus.issues);
  const localAliasExposures = collectLocalAliasExposures(exportedSurfaces, scope.root);
  for (const exposure of localAliasExposures) {
    const names = [...exposure.surfaces].sort();
    const shown = names.slice(0, 3).join(', ');
    const remainder = names.length > 3 ? ` and ${names.length - 3} more` : '';
    advisories.push(
      advisory(
        scope.root,
        exposure.alias,
        'exported-local-alias',
        exposure.alias.getName(),
        `implementation-local alias is exposed by ${shown}${remainder}; move the public shape to @flighthq/types`,
      ),
    );
  }

  return {
    advisories: advisories.sort(compareIssues),
    candidateIntersections: candidates.length,
    excludedDeclarationFiles: 0,
    excludedTestFiles: 0,
    excludedTestHelperFiles: 0,
    excludedToolingFiles: 0,
    exportedCreateCandidates: exportedCreateCensus.candidates,
    exportedCreateEntityReturns: exportedCreateCensus.entity,
    exportedCreateExclusions: exportedCreateCensus.exclusions,
    exportedCreateFunctions: exportedCreateCensus.total,
    exportedCreateRuntimeReturns: exportedCreateCensus.runtime,
    exportedSignatures: exportedSurfaces.length,
    issues: issues.sort(compareIssues),
    runtimeCreateExceptions: [...new Set(exportedCreateCensus.runtimeNames)].sort(),
    scannedFiles: scope.sourceFiles.length,
  };
}

export function formatEntityContractReport(report: Readonly<EntityContractReport>, root: string): string {
  const passed = report.issues.length === 0;
  const createReport = createExportedCreateRemediationReport(report);
  const createIssues = report.issues.filter((entry) => entry.rule === 'exported-create-return');
  const otherIssues = report.issues.filter((entry) => entry.rule !== 'exported-create-return');
  const exportedAliasAdvisories = report.advisories.filter((entry) => entry.rule === 'exported-local-alias');
  const fieldAdvisories = report.advisories.filter((entry) => entry.rule === 'hidden-entity-field');
  const acceptedCreates = createReport.acceptedEntity + createReport.acceptedEntityRuntime;
  const lines = [
    formatGateProvenance(
      {
        command: 'npm run entity-contracts:check (scripts/entity-contracts.ts)',
        counting:
          'one specialization = one intersection with a named base and direct inline object; factory and public-signature populations are derived semantically from the same production program',
        scope:
          'tracked and untracked packages/*/src TypeScript production source; declarations, tests and tool-* packages excluded by role, never by site roster',
      },
      readGateTreeState(root),
    ),
    `${passed ? pc.green('OK') : pc.yellow('!')} ${pc.bold('Entity structural-specialization contracts hold')} ${pc.dim(`(${report.scannedFiles} production files, ${report.candidateIntersections} specializations, ${report.exportedSignatures} exported signatures)`)}`,
    '  Derived exclusions:',
    `  - declaration-source: ${report.excludedDeclarationFiles}`,
    `  - test-source: ${report.excludedTestFiles}`,
    `  - test-helper-source: ${report.excludedTestHelperFiles}`,
    `  - tooling-package: ${report.excludedToolingFiles}`,
    `  Exported create-return contract: ${acceptedCreates}/${createReport.total} exported create symbols resolve to Entity or EntityRuntime; ${createReport.candidates} violations across ${createReport.packages.length} packages`,
    `  Semantically excluded create returns: ${createReport.automaticExclusions.length} automatic (${formatExclusionReasons(createReport.automaticExclusions)}), ${createReport.markedExclusions.length} source-marked (${formatExclusionReasons(createReport.markedExclusions)})`,
    `  Exported EntityRuntime second-root results: ${formatNames(report.runtimeCreateExceptions)}`,
  ];
  if (otherIssues.length > 0) {
    lines.push('', `  ${otherIssues.length} semantic contract issue${otherIssues.length === 1 ? '' : 's'}:`);
    for (const entry of otherIssues) {
      lines.push(`  - [${entry.rule}] ${entry.path}:${entry.line}:${entry.column} ${entry.name} — ${entry.detail}`);
    }
  }
  if (createIssues.length > 0) {
    lines.push(
      '',
      `  ${createReport.candidates} exported create-return contract violation${createReport.candidates === 1 ? '' : 's'}:`,
    );
    for (const group of createReport.packages) {
      lines.push(`  ${group.packageName} (${group.candidates.length}):`);
      for (const entry of group.candidates) {
        lines.push(
          `  - ${entry.path}:${entry.line}:${entry.column} ${entry.name}: ${entry.returnTypes.join(' | ')} — ${entry.detail}`,
        );
      }
    }
  }
  if (exportedAliasAdvisories.length > 0) {
    lines.push(
      '',
      `  ${exportedAliasAdvisories.length} report-only implementation-local exported signature type${exportedAliasAdvisories.length === 1 ? '' : 's'}:`,
    );
    for (const entry of exportedAliasAdvisories) {
      lines.push(`  - [${entry.rule}] ${entry.path}:${entry.line}:${entry.column} ${entry.name} — ${entry.detail}`);
    }
  }
  if (fieldAdvisories.length > 0) {
    lines.push(
      '',
      `  ${fieldAdvisories.length} implementation-field advisor${fieldAdvisories.length === 1 ? 'y' : 'ies'}:`,
    );
    for (const entry of fieldAdvisories) {
      lines.push(`  - [${entry.rule}] ${entry.path}:${entry.line}:${entry.column} ${entry.name} — ${entry.detail}`);
    }
  }
  return lines.join('\n');
}

export function createExportedCreateRemediationReport(
  report: Readonly<EntityContractReport>,
): ExportedCreateRemediationReport {
  const byPackage = new Map<string, ExportedCreateCandidate[]>();
  for (const entry of report.exportedCreateCandidates) {
    const packageName = entry.name.slice(0, entry.name.indexOf(' '));
    const candidates = byPackage.get(packageName) ?? [];
    candidates.push(entry);
    byPackage.set(packageName, candidates);
  }
  const packages = [...byPackage]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([packageName, candidates]) => ({
      candidates: candidates.sort((a, b) => a.name.localeCompare(b.name) || compareIssues(a, b)),
      packageName,
    }));
  return {
    acceptedEntity: report.exportedCreateEntityReturns,
    acceptedEntityRuntime: report.exportedCreateRuntimeReturns,
    automaticExclusions: report.exportedCreateExclusions.filter((entry) => entry.source === 'automatic'),
    candidatePredicate: 'exported production create* object result outside Entity and EntityRuntime',
    candidates: packages.reduce((total, entry) => total + entry.candidates.length, 0),
    excludedFactoryPrefixes: ['clone'],
    mode: 'enforced',
    markedExclusions: report.exportedCreateExclusions.filter((entry) => entry.source === 'marker'),
    packages,
    runtimeExceptions: report.runtimeCreateExceptions,
    semanticSecondRoots: ['EntityRuntime'],
    targetContract: 'user-facing Flight SDK objects transitively assign to Entity',
    total: report.exportedCreateFunctions,
  };
}

export function readEntityContractReport(root: string): EntityContractReport {
  const listing = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z', '--', 'packages'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const paths = [...new Set(listing.split('\0'))].filter((path) => path !== '' && path.includes('/src/'));
  let excludedDeclarationFiles = 0;
  let excludedTestFiles = 0;
  let excludedTestHelperFiles = 0;
  let excludedToolingFiles = 0;
  const productionPaths: string[] = [];
  for (const path of paths.sort()) {
    if (!SOURCE_EXTENSION.test(path)) continue;
    if (/\.d\.(?:[cm]?ts|tsx)$/.test(path)) {
      excludedDeclarationFiles++;
      continue;
    }
    if (TEST_SOURCE.test(path)) {
      excludedTestFiles++;
      continue;
    }
    if (TEST_HELPER_SOURCE.test(path)) {
      excludedTestHelperFiles++;
      continue;
    }
    if (/^packages\/tool-[^/]+\//.test(path)) {
      excludedToolingFiles++;
      continue;
    }
    const absolutePath = join(root, path);
    if (existsSync(absolutePath) && statSync(absolutePath).isFile()) productionPaths.push(absolutePath);
  }

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    tsConfigFilePath: join(root, 'tsconfig.base.json'),
  });
  const sourceFiles = productionPaths.map((path) => project.addSourceFileAtPath(path));
  return {
    ...checkEntityContracts({ project, root, sourceFiles }),
    excludedDeclarationFiles,
    excludedTestFiles,
    excludedTestHelperFiles,
    excludedToolingFiles,
  };
}

function collectCandidateIntersections(sourceFile: SourceFile): CandidateIntersection[] {
  return sourceFile.getDescendantsOfKind(SyntaxKind.IntersectionType).flatMap((node) => {
    const typeNodes = node.getTypeNodes();
    const literals = getTypeLiterals(typeNodes);
    const bases = typeNodes.filter(Node.isTypeReference);
    return literals.length > 0 && bases.length > 0 ? [{ bases, literals, node }] : [];
  });
}

function collectExportedSurfaces(sourceFiles: readonly SourceFile[]): ExportedSurface[] {
  const byDeclaration = new Map<string, ExportedSurface>();
  for (const sourceFile of sourceFiles) {
    const match = normalizePath(sourceFile.getFilePath()).match(/\/packages\/([^/]+)\/src\/(?:contract|index)\.ts$/);
    if (match === null) continue;
    const packageName = match[1] as string;
    for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
      for (const declaration of declarations) {
        if (!Node.isFunctionDeclaration(declaration) && !Node.isVariableDeclaration(declaration)) continue;
        if (isExcludedSurfaceDeclaration(declaration)) continue;
        if (declaration.getType().getCallSignatures().length === 0) continue;
        const key = nodeKey(declaration);
        const surface = byDeclaration.get(key) ?? { declaration, names: new Set<string>() };
        surface.names.add(`@flighthq/${packageName} ${name}`);
        byDeclaration.set(key, surface);
      }
    }
  }
  return [...byDeclaration.values()].sort((a, b) => nodeKey(a.declaration).localeCompare(nodeKey(b.declaration)));
}

function collectExportedCreateCensus(
  surfaces: readonly ExportedSurface[],
  entityType: Type,
  entityRuntimeType: Type,
  nonEntityCreateResult: TypeAliasDeclaration,
  root: string,
): ExportedCreateCensus {
  const census: ExportedCreateCensus = {
    candidates: [],
    entity: 0,
    exclusions: [],
    issues: [],
    runtime: 0,
    runtimeNames: [],
    total: 0,
  };
  const seenNames = new Set<string>();
  for (const surface of surfaces) {
    // @flighthq/sdk is an aggregate mirror of the owning package roots, not a second constructor.
    const names = [...surface.names]
      .filter(
        (name) =>
          !seenNames.has(name) && !name.startsWith('@flighthq/sdk ') && /^create[A-Z0-9]/.test(exportName(name)),
      )
      .sort();
    if (names.length === 0) continue;
    for (const name of names) seenNames.add(name);
    const automaticReasons = new Set<ExportedCreateExclusionReason>();
    const excludedReturnTypes = new Set<string>();
    let hasObjectResult = false;
    let hasNonObjectResult = false;
    let hasEntityResult = false;
    let hasRuntimeResult = false;
    let hasInvalidObjectResult = false;
    const invalidReturnTypes = new Set<string>();
    const markerKinds = new Set<'descriptor' | 'options' | 'type-only'>();
    for (const signature of surface.declaration.getType().getCallSignatures()) {
      const marker = classifyNonEntityCreateMarker(signature, nonEntityCreateResult, entityType, entityRuntimeType);
      if (marker?.detail !== undefined) {
        for (const name of names) {
          census.issues.push(issue(root, marker.node, 'invalid-non-entity-create-result', name, marker.detail));
        }
      }
      for (const resultType of exportedCreateResultTypes(signature.getReturnType())) {
        if (isFailureSentinel(resultType) || resultType.isNever()) continue;
        const resultTypeText = resultType.getText(surface.declaration, TypeFormatFlags.NoTruncation);
        // A primitive, void, or otherwise non-object result is a real answer about the factory, not a
        // reason to drop it: it is recorded as an automatic exclusion so every exported create symbol
        // stays visible in the census.
        if (!isObjectResult(resultType)) {
          hasNonObjectResult = true;
          automaticReasons.add('non-object-result');
          excludedReturnTypes.add(resultTypeText);
          continue;
        }
        hasObjectResult = true;
        const returnType = resultTypeText;
        // Shape and platform ownership are terminal: adding an Entity intersection to an array,
        // callable, collection, or native object must not move that value into the SDK-object set.
        const automaticReason = automaticCreateExclusionReason(resultType, root);
        if (automaticReason !== null) {
          automaticReasons.add(automaticReason);
          excludedReturnTypes.add(returnType);
          continue;
        }
        if (marker?.kind !== undefined) {
          excludedReturnTypes.add(returnType);
          markerKinds.add(marker.kind);
          continue;
        }
        const category = entityCategory(resultType, entityType, entityRuntimeType);
        if (category === null) {
          hasInvalidObjectResult = true;
          invalidReturnTypes.add(returnType);
        } else if (category === 'runtime') {
          hasRuntimeResult = true;
        } else {
          hasEntityResult = true;
        }
      }
    }
    if (!hasObjectResult && !hasNonObjectResult) continue;
    for (const name of names) {
      census.total++;
      if (hasInvalidObjectResult) {
        census.candidates.push({
          ...issue(
            root,
            surface.declaration,
            'exported-create-return',
            name,
            'exported create result must transitively assign to Entity or EntityRuntime unless it is automatically excluded or directly marked descriptor, options, or type-only',
          ),
          returnTypes: [...invalidReturnTypes].sort(),
          rule: 'exported-create-return',
        });
      } else if (hasRuntimeResult) {
        census.runtime++;
        census.runtimeNames.push(name);
      } else if (hasEntityResult) {
        census.entity++;
      } else {
        const source = surface.declaration.getSourceFile();
        const position = source.getLineAndColumnAtPos(surface.declaration.getStart());
        census.exclusions.push({
          column: position.column,
          line: position.line,
          name,
          path: normalizePath(relative(root, source.getFilePath())),
          reasons: [...new Set<ExportedCreateExclusionReason>([...automaticReasons, ...markerKinds])].sort(),
          returnTypes: [...excludedReturnTypes].sort(),
          source: markerKinds.size > 0 ? 'marker' : 'automatic',
        });
      }
    }
  }
  return census;
}

function collectFactoryReturns(sourceFile: SourceFile): FactoryReturn[] {
  return sourceFile.getFunctions().flatMap((node) => {
    const name = node.getName();
    const typeNode = node.getReturnTypeNode();
    const body = node.getBody();
    if (name === undefined || !FACTORY_NAME.test(name) || typeNode === undefined || body === undefined) return [];
    const expressions = body.getDescendantsOfKind(SyntaxKind.ReturnStatement).flatMap((statement) => {
      if (statement.getFirstAncestor(Node.isFunctionLikeDeclaration) !== node) return [];
      const expression = statement.getExpression();
      return expression === undefined ? [] : [expression];
    });
    return [{ expressions, name, node }];
  });
}

function collectHiddenEntityFields(
  factory: FactoryReturn,
  candidates: readonly CandidateIntersection[],
  root: string,
): EntityContractAdvisory[] {
  if (factory.node.getTypeParameters().length > 0) return [];
  const declaredType = factory.node.getReturnType();
  // A union deliberately exposes only its common properties through getProperty; variant-owned fields
  // are not hidden state. The advisor is for one concrete Entity contract with an implementation overlay.
  if (declaredType.isUnion()) return [];
  const overlayProperties = new Set<string>();
  for (const candidate of candidates) {
    if (!isDefinitelyAssignableTo(candidate.node.getType(), declaredType)) continue;
    for (const literal of candidate.literals) {
      for (const property of literal.getType().getProperties()) overlayProperties.add(property.getName());
    }
  }
  if (overlayProperties.size === 0) return [];
  const findings = new Map<string, EntityContractAdvisory>();
  for (const expression of factory.expressions) {
    const call = findCreateEntityCall(expression);
    const object = call?.getArguments()[0];
    if (object === undefined || !Node.isObjectLiteralExpression(object)) continue;
    for (const symbol of object.getType().getProperties()) {
      if (declaredType.getProperty(symbol.getName()) !== undefined) continue;
      if (!overlayProperties.has(symbol.getName())) continue;
      const declaration = symbol.getDeclarations()[0] ?? object;
      const finding = advisory(
        root,
        declaration,
        'hidden-entity-field',
        factory.name,
        `createEntity(...) persists ${displaySymbolName(symbol)} outside the declared Entity contract`,
      );
      findings.set(`${finding.path}:${finding.line}:${finding.column}:${symbol.getName()}`, finding);
    }
  }
  return [...findings.values()];
}

function collectLocalAliasExposures(surfaces: readonly ExportedSurface[], root: string): LocalAliasExposure[] {
  const exposures = new Map<string, LocalAliasExposure>();
  for (const surface of surfaces) {
    for (const signature of surface.declaration.getType().getCallSignatures()) {
      const types = [signature.getReturnType()];
      for (const parameter of signature.getParameters()) {
        const declaration = parameter.getDeclarations()[0] ?? signature.getDeclaration();
        types.push(parameter.getTypeAtLocation(declaration));
      }
      for (const typeParameter of signature.getTypeParameters()) {
        const constraint = typeParameter.getConstraint();
        const defaultType = typeParameter.getDefault();
        if (constraint !== undefined) types.push(constraint);
        if (defaultType !== undefined) types.push(defaultType);
      }
      for (const type of types) {
        for (const alias of implementationAliasesInType(type, root)) {
          if (!containsCandidateIntersection(alias.getTypeNodeOrThrow())) continue;
          const key = nodeKey(alias);
          const exposure = exposures.get(key) ?? { alias, surfaces: new Set<string>() };
          for (const name of surface.names) exposure.surfaces.add(name);
          exposures.set(key, exposure);
        }
      }
    }
  }
  return [...exposures.values()].sort((a, b) => nodeKey(a.alias).localeCompare(nodeKey(b.alias)));
}

function compareIssues(
  a: Readonly<Omit<EntityContractIssue, 'rule'> & { rule: string }>,
  b: Readonly<Omit<EntityContractIssue, 'rule'> & { rule: string }>,
): number {
  return a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule);
}

function containsCandidateIntersection(typeNode: TypeNode): boolean {
  if (Node.isIntersectionTypeNode(typeNode)) {
    const nodes = typeNode.getTypeNodes();
    if (nodes.some(Node.isTypeLiteral) && nodes.some(isNamedTypeNode)) return true;
  }
  return typeNode.getDescendantsOfKind(SyntaxKind.IntersectionType).some((node) => {
    const nodes = node.getTypeNodes();
    return nodes.some(Node.isTypeLiteral) && nodes.some(isNamedTypeNode);
  });
}

function classifyNonEntityCreateMarker(
  signature: Signature,
  markerDeclaration: TypeAliasDeclaration,
  entityType: Type,
  entityRuntimeType: Type,
): NonEntityCreateMarkerClassification | undefined {
  const returnTypeNode = signature.getDeclaration().getReturnTypeNode();
  if (returnTypeNode === undefined) return undefined;
  const marker = findDirectNonEntityCreateMarker(returnTypeNode, markerDeclaration);
  if (marker === undefined) return undefined;
  const typeArguments = marker.getTypeArguments();
  if (typeArguments.length !== 2) {
    return {
      detail: 'NonEntityCreateResult requires exactly a result type and one semantic reason tag',
      node: marker,
    };
  }
  const resultType = typeArguments[0]!.getType();
  if (
    exportedCreateResultTypes(resultType).some(
      (type) => !isFailureSentinel(type) && entityCategory(type, entityType, entityRuntimeType) !== null,
    )
  ) {
    return {
      detail: 'NonEntityCreateResult cannot wrap Entity or EntityRuntime; remove the redundant exemption marker',
      node: marker,
    };
  }
  const literal = typeArguments[1]!.getType().getLiteralValue();
  if (literal !== 'descriptor' && literal !== 'options' && literal !== 'type-only') {
    return {
      detail: 'NonEntityCreateResult reason must be exactly descriptor, options, or type-only',
      node: marker,
    };
  }
  return { kind: literal, node: marker };
}

function findDirectNonEntityCreateMarker(
  typeNode: TypeNode,
  markerDeclaration: TypeAliasDeclaration,
): TypeReferenceNode | undefined {
  if (Node.isParenthesizedTypeNode(typeNode)) {
    return findDirectNonEntityCreateMarker(typeNode.getTypeNode(), markerDeclaration);
  }
  if (Node.isUnionTypeNode(typeNode)) {
    const resultNodes = typeNode.getTypeNodes().filter((node) => !isFailureSentinelTypeNode(node));
    return resultNodes.length === 1 ? findDirectNonEntityCreateMarker(resultNodes[0]!, markerDeclaration) : undefined;
  }
  if (!Node.isTypeReference(typeNode)) return undefined;
  const symbol = typeNode.getTypeName().getSymbol();
  const declarationSymbol = symbol?.getAliasedSymbol() ?? symbol;
  if (declarationSymbol?.getDeclarations().some((node) => nodeKey(node) === nodeKey(markerDeclaration)) === true) {
    return typeNode;
  }
  const transparentWrapper = typeNode.getTypeName().getText();
  const typeArguments = typeNode.getTypeArguments();
  return (transparentWrapper === 'Awaited' || transparentWrapper === 'Promise') && typeArguments.length === 1
    ? findDirectNonEntityCreateMarker(typeArguments[0]!, markerDeclaration)
    : undefined;
}

function isFailureSentinelTypeNode(typeNode: TypeNode): boolean {
  if (typeNode.getKind() === SyntaxKind.NullKeyword || typeNode.getKind() === SyntaxKind.UndefinedKeyword) return true;
  return Node.isLiteralTypeNode(typeNode) && ['false', 'null'].includes(typeNode.getLiteral().getText());
}

function automaticCreateExclusionReason(type: Type, root: string): ExportedCreateExclusionReason | null {
  if (type.isArray() || type.isTuple()) return 'array-or-tuple';
  if (type.getCallSignatures().length > 0) return 'callable';
  for (const member of type.getIntersectionTypes()) {
    const reason = automaticCreateExclusionReason(member, root);
    if (reason !== null) return reason;
  }
  return isExternalNativeType(type, root) ? 'external-native' : null;
}

function isExternalNativeType(type: Type, root: string, seen = new Set<Type>()): boolean {
  if (seen.has(type)) return false;
  seen.add(type);
  const packagesRoot = `${normalizePath(resolve(root, 'packages'))}/`;
  const isRepositoryDeclaration = (declaration: Node): boolean =>
    normalizePath(declaration.getSourceFile().getFilePath()).startsWith(packagesRoot);
  const alias = type.getAliasSymbol();
  const aliasDeclarations = alias?.getDeclarations() ?? [];
  if (aliasDeclarations.some(isRepositoryDeclaration)) return false;
  if (alias !== undefined) {
    const objectArguments = type.getAliasTypeArguments().filter(isObjectResult);
    if (objectArguments.length > 0) {
      return objectArguments.every((argument) => isExternalNativeType(argument, root, seen));
    }
    // External generic utility aliases over primitives (for example Record<string, number>) create a
    // repository-owned structural result, not an instance owned by that external declaration.
    if (type.getAliasTypeArguments().length > 0) return false;
  }
  const declarations = type.getSymbol()?.getDeclarations() ?? aliasDeclarations;
  const repositoryDeclarations = declarations.filter(isRepositoryDeclaration);
  if (repositoryDeclarations.length === 0) return declarations.length > 0;
  // An empty repository interface can give a portable name to a selected native surface without
  // creating a Flight-owned object. Its complete heritage must remain external; one local member or
  // local base makes it a repository result that needs Entity or an explicit source marker.
  return repositoryDeclarations.every((declaration) => {
    if (!Node.isInterfaceDeclaration(declaration) || declaration.getMembers().length > 0) return false;
    const bases = declaration.getBaseTypes();
    return bases.length > 0 && bases.every((base) => isExternalNativeType(base, root, seen));
  });
}

function isExcludedSurfaceDeclaration(declaration: FunctionDeclaration | VariableDeclaration): boolean {
  const path = normalizePath(declaration.getSourceFile().getFilePath());
  return TEST_SOURCE.test(path) || TEST_HELPER_SOURCE.test(path) || /\/packages\/tool-[^/]+\//.test(path);
}

function entityCategory(type: Type, entityType: Type, entityRuntimeType: Type): 'entity' | 'runtime' | null {
  if (type.isAny() || type.isUnknown()) return null;
  if (isDefinitelyAssignableTo(type, entityType)) return 'entity';
  // EntityRuntime is the sole structural exception because runtime objects deliberately carry private
  // package state rather than the public Entity runtime-key slot. It is derived by assignability, not a
  // factory-name allowlist, and actual return expressions must still resolve to EntityRuntime.
  if (isDefinitelyAssignableTo(type, entityRuntimeType)) return 'runtime';
  return null;
}

function exportedCreateResultTypes(type: Type, seen = new Set<Type>()): Type[] {
  // Awaiting is gated on the result actually being thenable. TypeScript answers `Awaited<Type>` — itself
  // a conditional — for a bare type parameter, so unconditionally awaiting turned every generic factory
  // into an unresolvable conditional and lost it from the census.
  const awaited = (type.getProperty('then') !== undefined ? type.getAwaitedType() : undefined) ?? type;
  if (seen.has(awaited)) return [awaited];
  seen.add(awaited);
  if (awaited.isUnion()) return awaited.getUnionTypes().flatMap((member) => exportedCreateResultTypes(member, seen));
  const branches = conditionalBranchTypes(awaited);
  if (branches.length > 0) return branches.flatMap((branch) => exportedCreateResultTypes(branch, seen));
  return [awaited];
}

// A conditional type that is still generic has no single resolved result, so it is adjudicated by its
// branches: each arm is a result the factory can actually return. The branches are read from the alias
// declaration because an uninstantiated conditional exposes no resolved arms through the type API. A
// conditional that yields no readable branch stays whole and is judged on its own, which is what makes
// an unresolvable object-capable result a violation rather than a silent skip.
function conditionalBranchTypes(type: Type): Type[] {
  if ((type.getFlags() & ts.TypeFlags.Conditional) === 0) return [];
  // A still-generic conditional carries its arms as its default constraint, which is the union of every
  // branch it can resolve to. That reads an inline conditional and an aliased one alike; the alias
  // declaration is only walked when there is no constraint to read.
  const constraint = type.getConstraint();
  if (constraint !== undefined) return constraint.isUnion() ? constraint.getUnionTypes() : [constraint];
  const declarations = type.getAliasSymbol()?.getDeclarations() ?? type.getSymbol()?.getDeclarations() ?? [];
  const branches: Type[] = [];
  for (const declaration of declarations) {
    if (!Node.isTypeAliasDeclaration(declaration)) continue;
    collectConditionalBranchTypes(declaration.getTypeNode(), branches);
  }
  return branches;
}

function collectConditionalBranchTypes(typeNode: TypeNode | undefined, branches: Type[]): void {
  if (typeNode === undefined) return;
  if (Node.isConditionalTypeNode(typeNode)) {
    collectConditionalBranchTypes(typeNode.getTrueType(), branches);
    collectConditionalBranchTypes(typeNode.getFalseType(), branches);
    return;
  }
  branches.push(typeNode.getType());
}

function exportName(surfaceName: string): string {
  return surfaceName.slice(surfaceName.lastIndexOf(' ') + 1);
}

function findCreateEntityCall(expression: Expression): CallExpression | undefined {
  const underlying = getUnderlyingExpression(expression);
  if (!Node.isCallExpression(underlying)) return undefined;
  const callee = underlying.getExpression();
  if (!Node.isIdentifier(callee)) return undefined;
  let symbol = callee.getSymbol();
  symbol = symbol?.getAliasedSymbol() ?? symbol;
  if (symbol?.getName() !== 'createEntity') return undefined;
  const declaredByEntityPackage = symbol.getDeclarations().some((declaration) => {
    const path = normalizePath(declaration.getSourceFile().getFilePath());
    return path.endsWith('/packages/entity/src/entity.ts');
  });
  return declaredByEntityPackage ? underlying : undefined;
}

// Every excluded create symbol is reported under the reason that excluded it, so a result leaving the
// Entity population is visible as a decision rather than as an absence. A create symbol whose result is
// primitive, void, or otherwise not an object appears here under non-object-result; before that reason
// existed such a symbol was dropped before it was ever counted.
function formatExclusionReasons(exclusions: readonly ExportedCreateExclusion[]): string {
  const counts = new Map<ExportedCreateExclusionReason, number>();
  for (const exclusion of exclusions) {
    for (const reason of exclusion.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  if (counts.size === 0) return 'none';
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, count]) => `${reason} ${count}`)
    .join(', ');
}

function formatNames(names: readonly string[]): string {
  return names.length === 0 ? 'none' : names.join(', ');
}

function getTypeLiterals(typeNodes: readonly TypeNode[]): TypeLiteralNode[] {
  return typeNodes.filter(Node.isTypeLiteral);
}

function getUnderlyingExpression(expression: Expression): Expression {
  const visited = new Set<string>();
  while (
    Node.isAsExpression(expression) ||
    Node.isTypeAssertion(expression) ||
    Node.isSatisfiesExpression(expression) ||
    Node.isParenthesizedExpression(expression) ||
    Node.isNonNullExpression(expression)
  ) {
    expression = expression.getExpression();
  }
  while (Node.isIdentifier(expression)) {
    const symbol = expression.getSymbol();
    const declaration = symbol?.getDeclarations().find(Node.isVariableDeclaration);
    if (declaration === undefined || visited.has(nodeKey(declaration))) break;
    visited.add(nodeKey(declaration));
    const initializer = declaration.getInitializer();
    if (initializer === undefined || !Node.isExpression(initializer)) break;
    expression = initializer;
    while (
      Node.isAsExpression(expression) ||
      Node.isTypeAssertion(expression) ||
      Node.isSatisfiesExpression(expression) ||
      Node.isParenthesizedExpression(expression) ||
      Node.isNonNullExpression(expression)
    ) {
      expression = expression.getExpression();
    }
  }
  return expression;
}

function implementationAliasesInType(type: Type, root: string, seen = new Set<Type>()): TypeAliasDeclaration[] {
  if (seen.has(type)) return [];
  seen.add(type);
  const aliases: TypeAliasDeclaration[] = [];
  const symbol = type.getAliasSymbol();
  if (symbol !== undefined) {
    for (const declaration of symbol.getDeclarations().filter(Node.isTypeAliasDeclaration)) {
      const path = normalizePath(declaration.getSourceFile().getFilePath());
      const packagesRoot = `${normalizePath(resolve(root, 'packages'))}/`;
      if (path.startsWith(packagesRoot) && !path.startsWith(`${packagesRoot}types/`)) aliases.push(declaration);
    }
  }
  const nested = [...type.getTypeArguments(), ...type.getUnionTypes(), ...type.getIntersectionTypes()];
  for (const child of nested) aliases.push(...implementationAliasesInType(child, root, seen));
  return [...new Map(aliases.map((alias) => [nodeKey(alias), alias])).values()];
}

function isDefinitelyAssignableTo(type: Type, target: Type): boolean {
  if (type.isAny() || type.isUnknown()) return false;
  if (type.isUnion()) return type.getUnionTypes().every((member) => isDefinitelyAssignableTo(member, target));
  return type.isAssignableTo(target);
}

function isFailureSentinel(type: Type): boolean {
  return type.isNull() || type.isUndefined() || (type.isBooleanLiteral() && type.getText() === 'false');
}

function isObjectResult(type: Type): boolean {
  if (type.isAny() || type.isUnknown()) return true;
  if (type.isTypeParameter()) {
    const constraint = type.getConstraint();
    return constraint === undefined || isObjectResult(constraint);
  }
  if (type.isIntersection()) return type.getIntersectionTypes().every(isObjectResult);
  // The `object` keyword carries NonPrimitive rather than Object, so `Type extends object` reads as a
  // non-object constraint unless it is named here. Without this every generic factory whose result is
  // `Type & Entity` — createEntity itself, createNode, createWgpuRendererData — leaves the census.
  return type.isObject() || (type.getFlags() & ts.TypeFlags.NonPrimitive) !== 0;
}

function isNamedTypeNode(typeNode: TypeNode): boolean {
  return Node.isTypeReference(typeNode);
}

function isRedundantProperty(property: PropertySignature, base: MorphSymbol, baseReadonly: boolean): boolean {
  const inlineOptional = property.hasQuestionToken();
  const baseOptional = base.hasFlags(SymbolFlags.Optional);
  if (inlineOptional !== baseOptional || property.isReadonly() !== baseReadonly) return false;
  return hasSamePropertyType(property, base);
}

function hasSamePropertyType(property: PropertySignature, base: MorphSymbol): boolean {
  const inlineType = property.getTypeNode()?.getType() ?? property.getType();
  const baseType = base.getTypeAtLocation(property);
  return isDefinitelyAssignableTo(inlineType, baseType) && isDefinitelyAssignableTo(baseType, inlineType);
}

function isReadonlyProperty(symbol: MorphSymbol): boolean {
  return symbol.getDeclarations().some((declaration) => {
    return (
      (Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration)) && declaration.isReadonly()
    );
  });
}

function hasReadonlyProperty(type: Type, name: string, seen = new Set<string>()): boolean {
  const property = type.getProperty(name);
  if (property === undefined) return false;
  if (isReadonlyProperty(property)) return true;
  const symbol = type.getAliasSymbol() ?? type.getSymbol();
  if (symbol !== undefined) {
    const key = `${symbol.getName()}:${symbol.getDeclarations().map(nodeKey).join('|')}:${name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    for (const declaration of symbol.getDeclarations()) {
      if (Node.isTypeAliasDeclaration(declaration)) {
        const node = declaration.getTypeNodeOrThrow();
        if (Node.isMappedTypeNode(node) && mappedTypeAddsReadonly(node.getReadonlyToken())) return true;
      }
      if (Node.isInterfaceDeclaration(declaration)) {
        for (const base of declaration.getBaseTypes()) {
          if (hasReadonlyProperty(base, name, seen)) return true;
        }
      }
    }
  }
  return type.getIntersectionTypes().some((member) => hasReadonlyProperty(member, name, seen));
}

function hasReadonlyIndex(type: Type, kind: 'number' | 'string', seen = new Set<string>()): boolean {
  const symbol = type.getAliasSymbol() ?? type.getSymbol();
  if (symbol !== undefined) {
    const key = `${symbol.getName()}:${symbol.getDeclarations().map(nodeKey).join('|')}:${kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    for (const declaration of symbol.getDeclarations()) {
      if (Node.isInterfaceDeclaration(declaration) || Node.isTypeLiteral(declaration)) {
        if (declaration.getIndexSignatures().some((index) => indexKind(index) === kind && index.isReadonly())) {
          return true;
        }
      }
      if (Node.isInterfaceDeclaration(declaration)) {
        for (const base of declaration.getBaseTypes()) {
          if (hasReadonlyIndex(base, kind, seen)) return true;
        }
      }
      if (Node.isTypeAliasDeclaration(declaration) && hasReadonlyIndex(declaration.getType(), kind, seen)) return true;
      if (Node.isTypeAliasDeclaration(declaration)) {
        const node = declaration.getTypeNodeOrThrow();
        if (Node.isMappedTypeNode(node) && mappedTypeAddsReadonly(node.getReadonlyToken())) return true;
      }
    }
  }
  return type.getIntersectionTypes().some((member) => hasReadonlyIndex(member, kind, seen));
}

function indexKind(index: IndexSignatureDeclaration): 'number' | 'string' {
  return index.getKeyType().isNumber() ? 'number' : 'string';
}

function indexType(type: Type, kind: 'number' | 'string'): Type | undefined {
  return kind === 'number' ? type.getNumberIndexType() : type.getStringIndexType();
}

function mappedTypeAddsReadonly(token: Node | undefined): boolean {
  return token !== undefined && token.getKind() !== SyntaxKind.MinusToken;
}

function issue(root: string, node: Node, rule: EntityContractRule, name: string, detail: string): EntityContractIssue {
  const source = node.getSourceFile();
  const position = source.getLineAndColumnAtPos(node.getStart());
  return {
    column: position.column,
    detail,
    line: position.line,
    name,
    path: normalizePath(relative(root, source.getFilePath())),
    rule,
  };
}

function advisory(
  root: string,
  node: Node,
  rule: EntityContractAdvisoryRule,
  name: string,
  detail: string,
): EntityContractAdvisory {
  const source = node.getSourceFile();
  const position = source.getLineAndColumnAtPos(node.getStart());
  return {
    column: position.column,
    detail,
    line: position.line,
    name,
    path: normalizePath(relative(root, source.getFilePath())),
    rule,
  };
}

function displaySymbolName(symbol: MorphSymbol): string {
  const declaration = symbol.getDeclarations()[0];
  if (
    declaration !== undefined &&
    (Node.isPropertyAssignment(declaration) ||
      Node.isShorthandPropertyAssignment(declaration) ||
      Node.isMethodDeclaration(declaration) ||
      Node.isGetAccessorDeclaration(declaration) ||
      Node.isSetAccessorDeclaration(declaration))
  ) {
    return `\`${declaration.getName()}\``;
  }
  return `\`${symbol.getName()}\``;
}

function nodeKey(node: Node): string {
  return `${normalizePath(node.getSourceFile().getFilePath())}:${node.getStart()}`;
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/');
}

function main(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const report = readEntityContractReport(root);
  if (process.argv.includes('--create-report')) {
    console.log(JSON.stringify(createExportedCreateRemediationReport(report), null, 2));
    return;
  }
  console.log(formatEntityContractReport(report, root));
  if (report.issues.length > 0) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
