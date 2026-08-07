import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FIXTURE_RELEASE_TAG,
  getFixtureTreePath,
  readFixtureTreeStamp,
  resolveFixtureCacheDirectory,
} from './fixtures';
import { classifyImportConformanceObservation } from './import-conformance-classifier';
import {
  assertImportConformanceFrozenCapabilityPartition,
  createImportConformanceNotRunScore,
  createImportConformanceScore,
  createImportConformanceShardPlan,
  parseImportConformanceCapabilityDefinitions,
} from './import-conformance-core';
import type {
  ImportConformanceCapabilityDefinition,
  ImportConformanceCapabilityIndex,
  ImportConformanceIndexedFixture,
  ImportConformanceResult,
} from './import-conformance-core';
import { formatImportConformanceScore } from './import-conformance-format';
import { parseImportConformanceInstrumentationMapping } from './import-conformance-instrumentation';
import {
  IMPORT_CONFORMANCE_FAILURE_EXIT_CODE,
  IMPORT_CONFORMANCE_NOT_RUN_EXIT_CODE,
  IMPORT_CONFORMANCE_SUCCESS_EXIT_CODE,
  parseImportConformanceArguments,
  parseImportConformanceShardSelection,
  prepareImportConformanceScoreTarget,
  writeImportConformanceScoreAtomically,
} from './import-conformance-process';
import type { ImportConformanceArguments } from './import-conformance-process';
import {
  hashImportConformanceImporterSource,
  readImportConformanceCachedResult,
  readImportConformanceShardResults,
  writeImportConformanceCachedResult,
  writeImportConformanceShardResult,
} from './import-conformance-runner-core';
import { formatImportConformanceSubset } from './import-conformance-subset';
import {
  buildSwfCapabilityIndex,
  SWF_CAPABILITY_SCOPED_UNKNOWN_MAPPINGS,
  SWF_CAPABILITY_CONVENTION_REVISION,
  SWF_IMPORTER_DECLARED_CENSUS,
  SWF_IMPORTER_DECLARED_INDIVIDUATION_MARGIN,
} from './swf-capability-index';
import { runSwfImportConformanceWorkerPool } from './swf-import-conformance-worker-pool';

export async function runImportConformanceProcess(
  args: Readonly<ImportConformanceArguments>,
  shardValue: string | undefined,
): Promise<number> {
  const definitions = readCapabilityDefinitions();
  const importerSourceHash = hashImportConformanceImporterSource(join(REPOSITORY_ROOT, 'packages', 'swf', 'src'));
  const shard = parseImportConformanceShardSelection(shardValue);
  const tree = findFixtureTree();
  if (tree === null) {
    if (args.mode === 'subset') throw new Error(`${PACK_ID} ${PACK_VARIANT} fixture tree is unavailable`);
    const score = createImportConformanceNotRunScore(
      {
        capabilityConventionRevision: SWF_CAPABILITY_CONVENTION_REVISION,
        id: PACK_ID,
        release: FIXTURE_RELEASE_TAG,
        variant: PACK_VARIANT,
      },
      definitions,
      importerSourceHash,
      { mode: 'exhaustive', runId: args.runId, runUrl: args.runUrl },
    );
    assertImportConformanceFrozenCapabilityPartition(score, definitions);
    writeImportConformanceScoreAtomically(args.scoreFile, score);
    process.stdout.write(formatImportConformanceScore(score));
    return IMPORT_CONFORMANCE_NOT_RUN_EXIT_CODE;
  }

  const index = await buildSwfCapabilityIndex(tree.directory, definitions, tree.corpusFiles);
  writeImportConformanceScoreAtomically(INDEX_PATH, index);
  if (args.mode === 'subset') return await runSubset(args.capability, index, tree.directory, importerSourceHash);

  const plan = createImportConformanceShardPlan(
    index.fixtures.map((fixture) => fixture.reference),
    shard.total,
  );
  const currentReferences = new Set(
    plan.assignments
      .filter((assignment) => assignment.shardId === shard.index)
      .map((assignment) => assignment.reference),
  );
  const currentFixtures = index.fixtures.filter((fixture) => currentReferences.has(fixture.reference));
  const currentResults = await runFixtures(currentFixtures, tree.directory, importerSourceHash);
  writeImportConformanceShardResult(SHARD_DIRECTORY, plan, shard.index, currentResults, importerSourceHash);
  const collected = readImportConformanceShardResults(SHARD_DIRECTORY, plan, index.fixtures, importerSourceHash);
  const instrumentation = readInstrumentationMapping(definitions);
  for (const problem of instrumentation.problems) process.stderr.write(`⚠ ${problem}.\n`);
  const score = createImportConformanceScore(
    index,
    plan,
    collected.completedShardIds,
    collected.results,
    instrumentation.proofs,
    instrumentation.lossPathByCapability,
    importerSourceHash,
    { mode: 'exhaustive', runId: args.runId, runUrl: args.runUrl },
    {
      capabilityScopedUnknownMappings: SWF_CAPABILITY_SCOPED_UNKNOWN_MAPPINGS,
      importerDeclaredCensus: SWF_IMPORTER_DECLARED_CENSUS,
      individuationMargin: SWF_IMPORTER_DECLARED_INDIVIDUATION_MARGIN,
    },
  );
  assertImportConformanceFrozenCapabilityPartition(score, definitions);
  writeImportConformanceScoreAtomically(args.scoreFile, score);
  process.stdout.write(formatImportConformanceScore(score));
  return score.packs.some((pack) => pack.state === 'not-run')
    ? IMPORT_CONFORMANCE_NOT_RUN_EXIT_CODE
    : IMPORT_CONFORMANCE_SUCCESS_EXIT_CODE;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let args: ImportConformanceArguments;
  try {
    args = parseImportConformanceArguments(argv);
  } catch (error) {
    prepareImportConformanceScoreTarget(findPotentialScoreTarget(argv));
    reportFailure(error);
    process.exitCode = IMPORT_CONFORMANCE_FAILURE_EXIT_CODE;
    return;
  }
  if (args.mode === 'exhaustive') prepareImportConformanceScoreTarget(args.scoreFile);
  try {
    process.exitCode = await runImportConformanceProcess(args, process.env['FLIGHT_CONFORMANCE_SHARD']);
  } catch (error) {
    if (args.mode === 'exhaustive') prepareImportConformanceScoreTarget(args.scoreFile);
    reportFailure(error);
    process.exitCode = IMPORT_CONFORMANCE_FAILURE_EXIT_CODE;
  }
}

function findFixtureTree(): { corpusFiles: number; directory: string } | null {
  const directory = getFixtureTreePath(resolveFixtureCacheDirectory(), PACK_VARIANT, PACK_ID);
  const stamp = readFixtureTreeStamp(directory);
  const pack = stamp?.packs.find((candidate) => candidate.pack === PACK_ID);
  if (stamp === null || pack === undefined || stamp.tag !== FIXTURE_RELEASE_TAG || stamp.variant !== PACK_VARIANT) {
    return null;
  }
  return { corpusFiles: pack.files, directory };
}

function findPotentialScoreTarget(argv: readonly string[]): string {
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === '--score-file') return argv[index + 1] ?? DEFAULT_SCORE_FILE;
    if (argument.startsWith('--score-file=')) return argument.slice('--score-file='.length) || DEFAULT_SCORE_FILE;
  }
  return DEFAULT_SCORE_FILE;
}

function readCapabilityDefinitions(): readonly ImportConformanceCapabilityDefinition[] {
  return parseImportConformanceCapabilityDefinitions(JSON.parse(readFileSync(CAPABILITY_PATH, 'utf8')));
}

function readInstrumentationMapping(definitions: readonly Readonly<ImportConformanceCapabilityDefinition>[]) {
  if (!existsSync(INSTRUMENTATION_PATH)) {
    return parseImportConformanceInstrumentationMapping(null, definitions);
  }
  try {
    return parseImportConformanceInstrumentationMapping(
      JSON.parse(readFileSync(INSTRUMENTATION_PATH, 'utf8')),
      definitions,
    );
  } catch {
    return parseImportConformanceInstrumentationMapping(null, definitions);
  }
}

async function runFixtures(
  fixtures: readonly Readonly<ImportConformanceIndexedFixture>[],
  treeDirectory: string,
  importerSourceHash: string,
): Promise<ImportConformanceResult[]> {
  const results = new Map<string, ImportConformanceResult>();
  const cold: ImportConformanceIndexedFixture[] = [];
  for (const fixture of fixtures) {
    const cached = readImportConformanceCachedResult(CACHE_DIRECTORY, fixture, importerSourceHash);
    if (cached === null) cold.push({ ...fixture });
    else results.set(fixture.reference, cached);
  }
  const observations = await runSwfImportConformanceWorkerPool(
    cold.map((fixture) => ({
      path: join(treeDirectory, ...fixture.reference.split('/')),
      reference: fixture.reference,
      sourceHash: fixture.sourceHash,
    })),
  );
  for (let index = 0; index < cold.length; index++) {
    const result = classifyImportConformanceObservation(cold[index]!, observations[index]!);
    writeImportConformanceCachedResult(CACHE_DIRECTORY, result, importerSourceHash);
    results.set(result.reference, result);
  }
  return fixtures.map((fixture) => results.get(fixture.reference)!);
}

async function runSubset(
  capabilityId: string,
  index: Readonly<ImportConformanceCapabilityIndex>,
  treeDirectory: string,
  importerSourceHash: string,
): Promise<number> {
  if (!index.capabilities.some((capability) => capability.id === capabilityId)) {
    throw new Error(`Unknown SWF capability ${capabilityId}`);
  }
  const selected = index.fixtures.filter((fixture) => fixture.capabilities.includes(capabilityId));
  const results = await runFixtures(selected, treeDirectory, importerSourceHash);
  process.stdout.write(
    formatImportConformanceSubset(
      results.map((result) => ({
        outcome: result.capabilityOutcomes.find((candidate) => candidate.id === capabilityId)!.outcome,
        reference: result.reference,
      })),
    ),
  );
  return IMPORT_CONFORMANCE_SUCCESS_EXIT_CODE;
}

function reportFailure(error: unknown): void {
  process.stderr.write(`✗ ${error instanceof Error ? error.message : String(error)}\n`);
}

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_DIRECTORY = join(REPOSITORY_ROOT, '.artifacts', 'import-conformance');
const CACHE_DIRECTORY = join(ARTIFACT_DIRECTORY, 'cache');
const CAPABILITY_PATH = join(REPOSITORY_ROOT, 'agents', 'packages', 'swf', 'capabilities.json');
const DEFAULT_SCORE_FILE = '.artifacts/import-conformance/score.json';
const INDEX_PATH = join(ARTIFACT_DIRECTORY, 'index.json');
const INSTRUMENTATION_PATH = join(REPOSITORY_ROOT, 'agents', 'packages', 'swf', 'instrumentation.json');
const PACK_ID = 'swf-ruffle-fixtures';
const PACK_VARIANT = 'full';
const SHARD_DIRECTORY = join(ARTIFACT_DIRECTORY, 'shards');
const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) void main();
