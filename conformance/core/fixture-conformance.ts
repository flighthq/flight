import { existsSync, readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import type { ImportDiagnostic } from '@flighthq/types/contract';

import {
  FIXTURE_RELEASE_TAG,
  FIXTURE_STAMP_FILE,
  isFixturePackMetadataEntry,
  readFixturePackManifestPaths,
  readFixtureTreeStamp,
} from '../../scripts/fixtures';

export interface ConformanceFixturePack {
  id: string;
  verifiedFixtureFiles: number;
}

export interface ConformanceFixtureTree {
  directory: string;
  packs: readonly ConformanceFixturePack[];
  release: string;
  tree: string;
  variant: string;
}

export interface ConformanceFixtureInput {
  absolutePath: string;
  reference: string;
  references: readonly string[];
  tree: Readonly<ConformanceFixtureTree>;
}

export interface ConformanceFixtureObservation {
  diagnostics: readonly Readonly<ImportDiagnostic>[];
  featureOutcomes?: readonly Readonly<ConformanceFixtureFeatureOutcome>[];
  imported: boolean;
  notRunReason?: string;
}

export interface ConformanceFixtureFeatureDefinition {
  /** Format-owned stable identity; the shared core never interprets or synthesizes feature ids. */
  id: string;
  label: string;
}

export interface ConformanceFixtureFeatureOutcome {
  /** Must name one feature declared by the adapter that produced this outcome. */
  id: string;
  notRunReason?: string;
  /** Passed/failed comes only from an explicit adapter probe or oracle, never from import acceptance. */
  state: 'failed' | 'not-run' | 'passed';
}

export type ConformanceFixtureAdapterImplementation =
  | {
      run(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation>;
      state: 'available';
    }
  | {
      reason: string;
      state: 'unavailable';
    };

export interface ConformanceFixtureAdapter {
  features: readonly Readonly<ConformanceFixtureFeatureDefinition>[];
  id: string;
  implementation: ConformanceFixtureAdapterImplementation;
  selects(tree: Readonly<ConformanceFixtureTree>, reference: string): boolean;
}

export type ConformanceFixtureState = 'degraded' | 'imported' | 'not-run' | 'rejected' | 'threw' | 'unsupported';

export interface ConformanceFixtureResult {
  adapter: string;
  diagnosticKinds: readonly string[];
  diagnostics: Readonly<Record<'Drop' | 'Recover' | 'Reject' | 'Skip', number>>;
  errorName?: string;
  featureOutcomes: readonly Readonly<ConformanceFixtureFeatureOutcome>[];
  notRunReason?: string;
  packs: readonly string[];
  reference: string;
  state: ConformanceFixtureState;
  tree: string;
  variant: string;
}

export interface RunConformanceFixtureOptions {
  concurrency?: number;
  limit?: number;
}

export interface ConformanceFixtureCandidate {
  adapter: Readonly<ConformanceFixtureAdapter>;
  input: ConformanceFixtureInput;
}

export interface ConformanceFixtureTreeCensus {
  eligibleCandidateRuns: number;
  fixtureFiles: number;
  matchedFixtureFiles: number;
  selectedCandidateRuns: number;
  stampedFixtureFiles: number;
  tree: string;
  variant: string;
}

export interface ConformanceFixturePlan {
  adapters: readonly Readonly<ConformanceFixtureAdapter>[];
  candidates: readonly Readonly<ConformanceFixtureCandidate>[];
  eligibleCandidateRuns: number;
  families: readonly {
    adapter: string;
    eligibleCandidateRuns: number;
    selectedCandidateRuns: number;
  }[];
  trees: readonly Readonly<ConformanceFixtureTreeCensus>[];
}

export interface ConformanceFixtureFractionScore {
  denominator: number;
  numerator: number;
  state: 'measured' | 'not-measured';
  value: number | null;
}

export interface ConformanceFixtureFamilyScore {
  acceptedImport: ConformanceFixtureFractionScore;
  adapter: string;
  eligibleCandidateRuns: number;
  executionCoverage: ConformanceFixtureFractionScore;
  implementation: 'available' | 'unavailable';
  implementationCoverage: ConformanceFixtureFractionScore;
  outcomes: Readonly<Record<ConformanceFixtureState, number>>;
  selectedCandidateRuns: number;
  selectionCoverage: ConformanceFixtureFractionScore;
}

export interface ConformanceFixtureFileScore {
  acceptedCoverage: ConformanceFixtureFractionScore;
  acceptedFiles: number;
  acceptedOfAttempted: ConformanceFixtureFractionScore;
  attemptedFiles: number;
  completedFiles: number;
  corpusFiles: number;
  executionCoverage: ConformanceFixtureFractionScore;
  matchedFiles: number;
  selectionCoverage: ConformanceFixtureFractionScore;
}

export interface ConformanceFixtureFeatureScoreRow {
  adapter: string;
  checks: Readonly<Record<ConformanceFixtureFeatureOutcome['state'], number>>;
  id: string;
  label: string;
  state: 'conforming' | 'failing' | 'not-tested' | 'unobserved';
}

export interface ConformanceFixtureFeatureScore {
  checks: Readonly<Record<ConformanceFixtureFeatureOutcome['state'], number>>;
  conformingFeatures: number;
  declaredFeatures: number;
  observedFeatures: number;
  rows: readonly Readonly<ConformanceFixtureFeatureScoreRow>[];
  testedFeatures: number;
  workingAsExpected: ConformanceFixtureFractionScore;
}

export interface ConformanceFixtureScore {
  acceptedImport: ConformanceFixtureFractionScore;
  assurance: {
    featureCorrectness: 'adapter-declared-outcomes-only';
    fixtureContent: 'not-retained';
    importAcceptanceSemanticCorrectness: 'not-measured';
  };
  definitions: {
    acceptedImport: string;
    executionCoverage: string;
    fileCoverage: string;
    implementationCoverage: string;
    outcomeStates: Readonly<Record<ConformanceFixtureState, string>>;
    selectionCoverage: string;
    workingAsExpected: string;
  };
  executionCoverage: ConformanceFixtureFractionScore;
  families: readonly Readonly<ConformanceFixtureFamilyScore>[];
  features: Readonly<ConformanceFixtureFeatureScore>;
  files: Readonly<ConformanceFixtureFileScore>;
  implementationCoverage: ConformanceFixtureFractionScore;
  outcomes: Readonly<Record<ConformanceFixtureState, number>>;
  selectionCoverage: ConformanceFixtureFractionScore;
}

export function discoverConformanceFixtureTrees(
  cacheDirectory: string,
  release = FIXTURE_RELEASE_TAG,
): ConformanceFixtureTree[] {
  const extracted = join(cacheDirectory, 'extracted');
  if (!existsSync(extracted)) return [];

  const trees: ConformanceFixtureTree[] = [];
  for (const variantEntry of readdirSync(extracted, { withFileTypes: true })) {
    if (!variantEntry.isDirectory()) continue;
    const variantDirectory = join(extracted, variantEntry.name);
    for (const treeEntry of readdirSync(variantDirectory, { withFileTypes: true })) {
      if (!treeEntry.isDirectory()) continue;
      const directory = join(variantDirectory, treeEntry.name);
      const stamp = readFixtureTreeStamp(directory);
      if (stamp === null || stamp.tag !== release || stamp.variant !== variantEntry.name || stamp.packs.length === 0) {
        continue;
      }
      trees.push({
        directory,
        packs: stamp.packs
          .map((pack) => ({ id: pack.pack, verifiedFixtureFiles: pack.verifiedFixtureFiles }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        release: stamp.tag,
        tree: treeEntry.name,
        variant: stamp.variant,
      });
    }
  }
  return trees.sort(compareFixtureTree);
}

export function getConformanceFixtureTreeLabel(tree: Readonly<ConformanceFixtureTree>): string {
  return `${tree.variant}/${basename(tree.directory)}`;
}

// ★ THE PACK'S MANIFEST DECIDES WHAT IS A FIXTURE, not a rule applied to a directory walk. Classifying
// the walk required this reader and each pack's author to reach the same verdict on every file, and the
// first pack filing a per-project licence beside its assets showed they need not: the walk counted 1,144
// where the manifest declared 1,126, and the stamp comparison below rejected a tree that was perfectly
// intact. Reading the declared set removes the disagreement instead of adjudicating it — the same change
// made in `scripts/fixtures.ts` for extraction, applied here to enumeration.
//
// The walk is still what finds files, because it is what proves they are ON DISK; the manifest only says
// which of them count. A tree with no manifest keeps the old classifier, so any pack shape not seen here
// behaves as before.
export function listConformanceFixtureReferences(treeDirectory: string): string[] {
  let declared: ReadonlySet<string> | null = null;
  if (existsSync(join(treeDirectory, 'manifest.json'))) {
    declared = new Set(readFixturePackManifestPaths(treeDirectory));
  }
  const references: string[] = [];
  const pending = [treeDirectory];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const reference = relative(treeDirectory, path).split(sep).join('/');
      if (entry.isDirectory()) {
        if (declared === null && reference === 'LICENSES') continue;
        pending.push(path);
      } else if (!entry.isFile() || reference === FIXTURE_STAMP_FILE) {
        continue;
      } else if (declared === null ? !isFixturePackMetadataEntry(reference) : declared.has(reference)) {
        references.push(reference);
      }
    }
  }
  return references.sort();
}

export function createConformanceFixturePlan(
  trees: readonly Readonly<ConformanceFixtureTree>[],
  adapters: readonly Readonly<ConformanceFixtureAdapter>[],
  options: Readonly<Pick<RunConformanceFixtureOptions, 'limit'>> = {},
): ConformanceFixturePlan {
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1)) {
    throw new Error('Fixture conformance limit must be a positive safe integer');
  }
  const adapterIds = new Set<string>();
  const featureIds = new Set<string>();
  for (const adapter of adapters) {
    if (adapter.id.trim() === '') throw new Error('Fixture conformance adapter id must be non-empty');
    if (adapterIds.has(adapter.id)) throw new Error(`Duplicate fixture conformance adapter id ${adapter.id}`);
    if (adapter.implementation.state === 'unavailable' && adapter.implementation.reason.trim() === '') {
      throw new Error(`Unavailable fixture conformance adapter ${adapter.id} must name its reason`);
    }
    for (const feature of adapter.features) {
      if (!isConformanceIdentifier(feature.id)) {
        throw new Error(`Fixture conformance adapter ${adapter.id} has invalid feature id`);
      }
      if (feature.label.trim() === '') {
        throw new Error(`Fixture conformance feature ${feature.id} must have a non-empty label`);
      }
      if (featureIds.has(feature.id)) throw new Error(`Duplicate fixture conformance feature id ${feature.id}`);
      featureIds.add(feature.id);
    }
    adapterIds.add(adapter.id);
  }

  const eligible: ConformanceFixtureCandidate[] = [];
  const treeReferences = new Map<Readonly<ConformanceFixtureTree>, readonly string[]>();
  const matchedReferences = new Map<Readonly<ConformanceFixtureTree>, Set<string>>();
  for (const tree of trees) {
    const references = listConformanceFixtureReferences(tree.directory);
    const stampedFixtureFiles = tree.packs.reduce((total, pack) => total + pack.verifiedFixtureFiles, 0);
    if (references.length !== stampedFixtureFiles) {
      throw new Error(
        `Fixture tree ${getConformanceFixtureTreeLabel(tree)} no longer matches its verified stamp: expected ${stampedFixtureFiles} fixture files, found ${references.length}. Reacquire with npm run fixtures -- ${tree.packs.map((pack) => pack.id).join(' ')} --variant ${tree.variant}`,
      );
    }
    treeReferences.set(tree, references);
    const matched = new Set<string>();
    matchedReferences.set(tree, matched);
    for (const reference of references) {
      for (const adapter of adapters) {
        if (!adapter.selects(tree, reference)) continue;
        matched.add(reference);
        eligible.push({
          adapter,
          input: { absolutePath: join(tree.directory, ...reference.split('/')), reference, references, tree },
        });
      }
    }
  }
  eligible.sort(compareFixtureInput);
  const candidates = options.limit === undefined ? eligible : eligible.slice(0, options.limit);
  return {
    adapters: [...adapters],
    candidates,
    eligibleCandidateRuns: eligible.length,
    families: adapters.map((adapter) => ({
      adapter: adapter.id,
      eligibleCandidateRuns: eligible.filter((candidate) => candidate.adapter.id === adapter.id).length,
      selectedCandidateRuns: candidates.filter((candidate) => candidate.adapter.id === adapter.id).length,
    })),
    trees: trees.map((tree) => ({
      eligibleCandidateRuns: eligible.filter((candidate) => candidate.input.tree === tree).length,
      fixtureFiles: treeReferences.get(tree)!.length,
      matchedFixtureFiles: matchedReferences.get(tree)!.size,
      selectedCandidateRuns: candidates.filter((candidate) => candidate.input.tree === tree).length,
      stampedFixtureFiles: tree.packs.reduce((total, pack) => total + pack.verifiedFixtureFiles, 0),
      tree: tree.tree,
      variant: tree.variant,
    })),
  };
}

export async function runConformanceFixtureAdapters(
  trees: readonly Readonly<ConformanceFixtureTree>[],
  adapters: readonly Readonly<ConformanceFixtureAdapter>[],
  options: Readonly<RunConformanceFixtureOptions> = {},
): Promise<ConformanceFixtureResult[]> {
  const plan = createConformanceFixturePlan(trees, adapters, options);
  return runConformanceFixturePlan(plan, options.concurrency);
}

export async function runConformanceFixturePlan(
  plan: Readonly<ConformanceFixturePlan>,
  concurrency = 1,
): Promise<ConformanceFixtureResult[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error('Fixture conformance concurrency must be a positive safe integer');
  }
  const results = new Array<ConformanceFixtureResult>(plan.candidates.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, plan.candidates.length) }, async () => {
      for (;;) {
        const index = next++;
        const candidate = plan.candidates[index];
        if (candidate === undefined) return;
        results[index] = await runConformanceFixtureAdapter(candidate.adapter, candidate.input);
      }
    }),
  );
  return results;
}

export function scoreConformanceFixturePlan(
  plan: Readonly<ConformanceFixturePlan>,
  results: readonly Readonly<ConformanceFixtureResult>[],
): ConformanceFixtureScore {
  if (results.length !== plan.candidates.length) {
    throw new Error(
      `Fixture conformance result count ${results.length} does not match selected candidate count ${plan.candidates.length}`,
    );
  }
  for (let index = 0; index < plan.candidates.length; index++) {
    assertConformanceFixtureResultIdentity(plan.candidates[index]!, results[index]!, index);
  }
  const families = [...plan.adapters]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((adapter): ConformanceFixtureFamilyScore => {
      const census = plan.families.find((family) => family.adapter === adapter.id);
      if (census === undefined) throw new Error(`Fixture conformance plan has no census for ${adapter.id}`);
      const { eligibleCandidateRuns, selectedCandidateRuns } = census;
      const familyResults = results.filter((result) => result.adapter === adapter.id);
      if (familyResults.length !== selectedCandidateRuns) {
        throw new Error(
          `Fixture conformance result count ${familyResults.length} for ${adapter.id} does not match its selected candidate count ${selectedCandidateRuns}`,
        );
      }
      const implemented = adapter.implementation.state === 'available' ? selectedCandidateRuns : 0;
      const executed = familyResults.filter((result) => result.state !== 'not-run').length;
      return {
        acceptedImport: fractionScore(familyResults.filter((result) => result.state === 'imported').length, executed),
        adapter: adapter.id,
        eligibleCandidateRuns,
        executionCoverage: fractionScore(executed, implemented),
        implementation: adapter.implementation.state,
        implementationCoverage: fractionScore(implemented, selectedCandidateRuns),
        outcomes: summarizeOutcomes(familyResults),
        selectedCandidateRuns,
        selectionCoverage: fractionScore(selectedCandidateRuns, eligibleCandidateRuns),
      };
    });
  const implemented = families.reduce((total, family) => total + family.implementationCoverage.numerator, 0);
  const executed = results.filter((result) => result.state !== 'not-run').length;
  return {
    acceptedImport: fractionScore(results.filter((result) => result.state === 'imported').length, executed),
    assurance: {
      featureCorrectness: 'adapter-declared-outcomes-only',
      fixtureContent: 'not-retained',
      importAcceptanceSemanticCorrectness: 'not-measured',
    },
    definitions: CONFORMANCE_FIXTURE_SCORE_DEFINITIONS,
    executionCoverage: fractionScore(executed, implemented),
    families,
    features: scoreConformanceFixtureFeatures(plan, results),
    files: scoreConformanceFixtureFiles(plan, results),
    implementationCoverage: fractionScore(implemented, plan.candidates.length),
    outcomes: summarizeOutcomes(results),
    selectionCoverage: fractionScore(plan.candidates.length, plan.eligibleCandidateRuns),
  };
}

function scoreConformanceFixtureFiles(
  plan: Readonly<ConformanceFixturePlan>,
  results: readonly Readonly<ConformanceFixtureResult>[],
): ConformanceFixtureFileScore {
  const files = new Map<string, ConformanceFixtureResult[]>();
  for (let index = 0; index < plan.candidates.length; index++) {
    const candidate = plan.candidates[index]!;
    const key = `${candidate.input.tree.directory}\0${candidate.input.reference}`;
    const fileResults = files.get(key) ?? [];
    fileResults.push(results[index]!);
    files.set(key, fileResults);
  }
  const attemptedFiles = files.size;
  const completedFiles = [...files.values()].filter((fileResults) =>
    fileResults.every((result) => result.state !== 'not-run' && result.state !== 'threw'),
  ).length;
  const acceptedFiles = [...files.values()].filter((fileResults) =>
    fileResults.every((result) => result.state === 'imported'),
  ).length;
  const matchedFiles = plan.trees.reduce((total, tree) => total + tree.matchedFixtureFiles, 0);
  const corpusFiles = plan.trees.reduce((total, tree) => total + tree.fixtureFiles, 0);
  return {
    acceptedCoverage: fractionScore(acceptedFiles, corpusFiles),
    acceptedFiles,
    acceptedOfAttempted: fractionScore(acceptedFiles, attemptedFiles),
    attemptedFiles,
    completedFiles,
    corpusFiles,
    executionCoverage: fractionScore(completedFiles, corpusFiles),
    matchedFiles,
    selectionCoverage: fractionScore(attemptedFiles, corpusFiles),
  };
}

function scoreConformanceFixtureFeatures(
  plan: Readonly<ConformanceFixturePlan>,
  results: readonly Readonly<ConformanceFixtureResult>[],
): ConformanceFixtureFeatureScore {
  const rows = plan.adapters
    .flatMap((adapter) =>
      adapter.features.map((feature): ConformanceFixtureFeatureScoreRow => {
        const outcomes = results
          .filter((result) => result.adapter === adapter.id)
          .flatMap((result) => result.featureOutcomes)
          .filter((outcome) => outcome.id === feature.id);
        const checks = summarizeFeatureOutcomes(outcomes);
        return {
          adapter: adapter.id,
          checks,
          id: feature.id,
          label: feature.label,
          state:
            outcomes.length === 0
              ? 'unobserved'
              : checks.failed > 0
                ? 'failing'
                : checks.passed > 0
                  ? 'conforming'
                  : 'not-tested',
        };
      }),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const tested = rows.filter((row) => row.state === 'conforming' || row.state === 'failing');
  const checks = summarizeFeatureOutcomes(results.flatMap((result) => result.featureOutcomes));
  const conformingFeatures = tested.filter((row) => row.state === 'conforming').length;
  return {
    checks,
    conformingFeatures,
    declaredFeatures: rows.length,
    observedFeatures: rows.filter((row) => row.state !== 'unobserved').length,
    rows,
    testedFeatures: tested.length,
    workingAsExpected: fractionScore(conformingFeatures, tested.length),
  };
}

function assertConformanceFixtureResultIdentity(
  candidate: Readonly<ConformanceFixtureCandidate>,
  result: Readonly<ConformanceFixtureResult>,
  index: number,
): void {
  const expectedPacks = candidate.input.tree.packs.map((pack) => pack.id);
  if (
    result.adapter !== candidate.adapter.id ||
    result.reference !== candidate.input.reference ||
    result.tree !== candidate.input.tree.tree ||
    result.variant !== candidate.input.tree.variant ||
    result.packs.length !== expectedPacks.length ||
    result.packs.some((pack, packIndex) => pack !== expectedPacks[packIndex])
  ) {
    throw new Error(`Fixture conformance result ${index} does not match its selected candidate identity`);
  }
  if (
    candidate.adapter.implementation.state === 'unavailable' &&
    (result.state !== 'not-run' || result.notRunReason !== candidate.adapter.implementation.reason)
  ) {
    throw new Error(`Fixture conformance result ${index} does not match its unavailable adapter outcome`);
  }
}

async function runConformanceFixtureAdapter(
  adapter: Readonly<ConformanceFixtureAdapter>,
  input: Readonly<ConformanceFixtureInput>,
): Promise<ConformanceFixtureResult> {
  const identity = {
    adapter: adapter.id,
    packs: input.tree.packs.map((pack) => pack.id),
    reference: input.reference,
    tree: input.tree.tree,
    variant: input.tree.variant,
  };
  if (adapter.implementation.state === 'unavailable') {
    return {
      ...identity,
      diagnosticKinds: [],
      diagnostics: { Drop: 0, Recover: 0, Reject: 0, Skip: 0 },
      featureOutcomes: [],
      notRunReason: adapter.implementation.reason,
      state: 'not-run',
    };
  }
  try {
    const observation = await adapter.implementation.run(input);
    const diagnostics = summarizeDiagnostics(observation.diagnostics);
    const featureOutcomes = normalizeFeatureOutcomes(adapter, observation.featureOutcomes ?? []);
    if (observation.notRunReason !== undefined) {
      return {
        ...identity,
        ...diagnostics,
        featureOutcomes,
        notRunReason: observation.notRunReason,
        state: 'not-run',
      };
    }
    const rejected = observation.diagnostics.some((diagnostic) => diagnostic.severity === 'Reject');
    const degraded = observation.diagnostics.some(
      (diagnostic) => diagnostic.severity === 'Drop' || diagnostic.severity === 'Recover',
    );
    const unsupported = observation.diagnostics.some((diagnostic) => diagnostic.kind.includes('unsupported'));
    const skipped = observation.diagnostics.some((diagnostic) => diagnostic.severity === 'Skip');
    return {
      ...identity,
      ...diagnostics,
      featureOutcomes,
      state: unsupported
        ? 'unsupported'
        : !observation.imported || rejected
          ? 'rejected'
          : degraded
            ? 'degraded'
            : skipped
              ? 'unsupported'
              : 'imported',
    };
  } catch (error) {
    return {
      ...identity,
      diagnosticKinds: [],
      diagnostics: { Drop: 0, Recover: 0, Reject: 0, Skip: 0 },
      errorName: error instanceof Error ? error.name : typeof error,
      featureOutcomes: [],
      state: 'threw',
    };
  }
}

function normalizeFeatureOutcomes(
  adapter: Readonly<ConformanceFixtureAdapter>,
  outcomes: readonly Readonly<ConformanceFixtureFeatureOutcome>[],
): ConformanceFixtureFeatureOutcome[] {
  const declared = new Set(adapter.features.map((feature) => feature.id));
  const seen = new Set<string>();
  return outcomes
    .map((outcome) => {
      if (!declared.has(outcome.id) || seen.has(outcome.id)) {
        throw new Error('Fixture adapter emitted an undeclared or duplicate feature outcome');
      }
      if (outcome.state !== 'failed' && outcome.state !== 'not-run' && outcome.state !== 'passed') {
        throw new Error('Fixture adapter emitted an invalid feature outcome state');
      }
      if (outcome.state === 'not-run') {
        if (outcome.notRunReason === undefined || !isConformanceIdentifier(outcome.notRunReason)) {
          throw new Error('Fixture adapter emitted an invalid feature not-run reason');
        }
      } else if (outcome.notRunReason !== undefined) {
        throw new Error('Fixture adapter attached a not-run reason to a measured feature outcome');
      }
      seen.add(outcome.id);
      return { ...outcome };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function summarizeDiagnostics(
  diagnostics: readonly Readonly<ImportDiagnostic>[],
): Pick<ConformanceFixtureResult, 'diagnosticKinds' | 'diagnostics'> {
  const counts = { Drop: 0, Recover: 0, Reject: 0, Skip: 0 };
  const kinds = new Set<string>();
  for (const diagnostic of diagnostics) {
    counts[diagnostic.severity] += 1;
    kinds.add(diagnostic.kind);
  }
  return { diagnosticKinds: [...kinds].sort(), diagnostics: counts };
}

function compareFixtureInput(
  left: Readonly<ConformanceFixtureCandidate>,
  right: Readonly<ConformanceFixtureCandidate>,
): number {
  return (
    compareFixtureTree(left.input.tree, right.input.tree) ||
    left.adapter.id.localeCompare(right.adapter.id) ||
    left.input.reference.localeCompare(right.input.reference)
  );
}

function fractionScore(numerator: number, denominator: number): ConformanceFixtureFractionScore {
  return denominator === 0
    ? { denominator, numerator, state: 'not-measured', value: null }
    : { denominator, numerator, state: 'measured', value: numerator / denominator };
}

function summarizeOutcomes(
  results: readonly Readonly<ConformanceFixtureResult>[],
): Record<ConformanceFixtureState, number> {
  const outcomes = { degraded: 0, imported: 0, 'not-run': 0, rejected: 0, threw: 0, unsupported: 0 };
  for (const result of results) outcomes[result.state] += 1;
  return outcomes;
}

function summarizeFeatureOutcomes(
  outcomes: readonly Readonly<ConformanceFixtureFeatureOutcome>[],
): Record<ConformanceFixtureFeatureOutcome['state'], number> {
  const summary = { failed: 0, 'not-run': 0, passed: 0 };
  for (const outcome of outcomes) summary[outcome.state] += 1;
  return summary;
}

function isConformanceIdentifier(value: string): boolean {
  return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value);
}

function compareFixtureTree(left: Readonly<ConformanceFixtureTree>, right: Readonly<ConformanceFixtureTree>): number {
  return left.variant.localeCompare(right.variant) || left.tree.localeCompare(right.tree);
}

const CONFORMANCE_FIXTURE_SCORE_DEFINITIONS = {
  acceptedImport:
    'Selected candidate runs classified imported divided by implemented candidate runs that reached their target Flight method. This is execution evidence, not semantic-correctness evidence.',
  executionCoverage:
    'Implemented candidate runs that reached their target Flight method divided by selected candidate runs assigned to an available fixture adapter.',
  fileCoverage:
    'Unique files accepted, attempted, or completed divided by every fixture file in the selected verified trees. Unmatched files stay in the denominator rather than disappearing.',
  implementationCoverage:
    'Selected candidate runs assigned to an available fixture adapter divided by all selected candidate runs, including declared fixture families whose Flight implementation is unavailable.',
  outcomeStates: {
    degraded:
      'The Flight method returned an import but reported at least one Drop or Recover diagnostic without an unsupported diagnostic taking precedence.',
    imported: 'The Flight method returned an import with no Drop, Recover, Reject, or Skip diagnostic.',
    'not-run':
      'The candidate did not reach its target Flight method, including a declared family with no implementation or an unavailable prerequisite.',
    rejected: 'The Flight method returned no import or reported a Reject diagnostic not classified as unsupported.',
    threw: 'The Flight adapter threw; only its error name is retained.',
    unsupported: 'A diagnostic named unsupported input, or a Skip diagnostic remained after earlier branches.',
  },
  selectionCoverage:
    'Candidate runs selected after the optional deterministic limit divided by all adapter-matched candidate runs in the verified corpus.',
  workingAsExpected:
    'Adapter-declared features whose every measured fixture outcome passed divided by adapter-declared features with at least one passed or failed outcome. Import acceptance alone never creates a feature outcome.',
} as const;
