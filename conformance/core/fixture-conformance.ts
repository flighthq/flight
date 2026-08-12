import { existsSync, readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import type { ImportDiagnostic } from '@flighthq/types/contract';

import {
  FIXTURE_RELEASE_TAG,
  FIXTURE_STAMP_FILE,
  isFixturePackMetadataEntry,
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
  imported: boolean;
  notRunReason?: string;
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

export interface ConformanceFixtureScore {
  acceptedImport: ConformanceFixtureFractionScore;
  assurance: {
    fixtureContent: 'not-retained';
    semanticCorrectness: 'not-measured';
  };
  definitions: {
    acceptedImport: string;
    executionCoverage: string;
    implementationCoverage: string;
    outcomeStates: Readonly<Record<ConformanceFixtureState, string>>;
    selectionCoverage: string;
  };
  executionCoverage: ConformanceFixtureFractionScore;
  families: readonly Readonly<ConformanceFixtureFamilyScore>[];
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

export function listConformanceFixtureReferences(treeDirectory: string): string[] {
  const references: string[] = [];
  const pending = [treeDirectory];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const reference = relative(treeDirectory, path).split(sep).join('/');
      if (entry.isDirectory()) {
        if (reference === 'LICENSES') continue;
        pending.push(path);
      } else if (entry.isFile() && reference !== FIXTURE_STAMP_FILE && !isFixturePackMetadataEntry(reference)) {
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
  for (const adapter of adapters) {
    if (adapter.id.trim() === '') throw new Error('Fixture conformance adapter id must be non-empty');
    if (adapterIds.has(adapter.id)) throw new Error(`Duplicate fixture conformance adapter id ${adapter.id}`);
    if (adapter.implementation.state === 'unavailable' && adapter.implementation.reason.trim() === '') {
      throw new Error(`Unavailable fixture conformance adapter ${adapter.id} must name its reason`);
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
    assurance: { fixtureContent: 'not-retained', semanticCorrectness: 'not-measured' },
    definitions: CONFORMANCE_FIXTURE_SCORE_DEFINITIONS,
    executionCoverage: fractionScore(executed, implemented),
    families,
    implementationCoverage: fractionScore(implemented, plan.candidates.length),
    outcomes: summarizeOutcomes(results),
    selectionCoverage: fractionScore(plan.candidates.length, plan.eligibleCandidateRuns),
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
      notRunReason: adapter.implementation.reason,
      state: 'not-run',
    };
  }
  try {
    const observation = await adapter.implementation.run(input);
    const diagnostics = summarizeDiagnostics(observation.diagnostics);
    if (observation.notRunReason !== undefined) {
      return { ...identity, ...diagnostics, notRunReason: observation.notRunReason, state: 'not-run' };
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
      state: 'threw',
    };
  }
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

function compareFixtureTree(left: Readonly<ConformanceFixtureTree>, right: Readonly<ConformanceFixtureTree>): number {
  return left.variant.localeCompare(right.variant) || left.tree.localeCompare(right.tree);
}

const CONFORMANCE_FIXTURE_SCORE_DEFINITIONS = {
  acceptedImport:
    'Selected candidate runs classified imported divided by implemented candidate runs that reached their target Flight method. This is execution evidence, not semantic-correctness evidence.',
  executionCoverage:
    'Implemented candidate runs that reached their target Flight method divided by selected candidate runs assigned to an available fixture adapter.',
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
} as const;
