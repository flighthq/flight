import { createHash } from 'node:crypto';

export interface ImportConformanceCapabilityDefinition {
  id: string;
  label: string;
}

export interface ImportConformanceCapabilityIndex {
  capabilities: ImportConformanceIndexedCapability[];
  fixtures: ImportConformanceIndexedFixture[];
  inventory: {
    corpusFiles: number;
    indexedSwfFiles: number;
    unreadableSwfFiles: number;
  };
  pack: ImportConformancePackIdentity;
  schemaVersion: 1;
}

export interface ImportConformanceIndexedCapability extends ImportConformanceCapabilityDefinition {
  witnesses: string[];
}

export interface ImportConformanceIndexedFixture {
  capabilities: string[];
  probeState: 'readable' | 'unreadable';
  reference: string;
  sourceHash: string;
}

export interface ImportConformanceOutcomeCounts {
  importedWrong: number;
  silentlyWrong: number;
  threw: number;
  unsupportedClean: number;
}

export interface ImportConformancePackIdentity {
  id: string;
  release: string;
  variant: string;
}

export interface ImportConformanceProvenance {
  mode: 'exhaustive';
  runId: string;
  runUrl: string;
}

export interface ImportConformanceResult {
  capabilityOutcomes: {
    id: string;
    outcome: keyof ImportConformanceOutcomeCounts | 'passed';
  }[];
  outcome: keyof ImportConformanceOutcomeCounts | 'passed';
  reference: string;
  sourceHash: string;
}

export interface ImportConformanceShardPlan {
  algorithm: 'fixture-count-v1';
  assignments: ImportConformanceShardAssignment[];
  planHash: string;
  shardCount: number;
}

export interface ImportConformanceShardAssignment {
  reference: string;
  shardId: number;
}

export interface ImportConformanceScore {
  packs: ImportConformanceScorePack[];
  provenance: ImportConformanceProvenance;
  schemaVersion: 1;
}

export interface ImportConformanceScoreCapabilityMeasured {
  id: string;
  instrumentationProofs: ImportConformanceInstrumentationProofs;
  outcomes: ImportConformanceOutcomeCounts;
  result: 'fail' | 'pass';
  state: 'measured';
  witnesses: number;
}

export interface ImportConformanceInstrumentationProofs {
  fires: string[];
  staysSilent: string[];
}

export interface ImportConformanceScoreCapabilityNotRun {
  completedWitnesses: number;
  expectedWitnesses: number;
  id: string;
  reason: 'missing-shard' | 'pack-unavailable';
  state: 'not-run';
}

export interface ImportConformanceScoreCapabilityUnmeasured {
  id: string;
  state: 'unmeasured';
}

export interface ImportConformanceScoreCapabilityUnknown {
  id: string;
  reason: 'diagnostic-instrumentation-missing';
  state: 'unknown';
  witnesses: number;
}

export type ImportConformanceScoreCapability =
  | ImportConformanceScoreCapabilityMeasured
  | ImportConformanceScoreCapabilityNotRun
  | ImportConformanceScoreCapabilityUnmeasured
  | ImportConformanceScoreCapabilityUnknown;

export interface ImportConformanceScorePack {
  capabilities: ImportConformanceScoreCapability[];
  id: string;
  importerSourceHash: string;
  outcomes: ImportConformanceOutcomeCounts | null;
  reason?: 'instrumentation-incomplete' | 'missing-shard' | 'pack-unavailable';
  release: string;
  sharding: {
    algorithm: 'fixture-count-v1';
    planHash: string;
    shards: ({ id: number; state: 'measured' } | { id: number; reason: string; state: 'not-run' })[];
  } | null;
  state: 'measured' | 'not-run';
  summary: {
    totalCapabilities: number;
    exercised: {
      capabilities: number;
      instrumented: {
        capabilities: number;
        passedCapabilities: number;
      };
      singleWitnessCapabilities: number;
    };
  } | null;
  variant: string;
}

interface ImportConformanceFixtureEvidence {
  capabilities: readonly string[];
  probeState?: 'readable' | 'unreadable';
  reference: string;
  sourceHash: string;
}

export function buildImportConformanceCapabilityIndex(
  pack: Readonly<ImportConformancePackIdentity>,
  definitions: readonly Readonly<ImportConformanceCapabilityDefinition>[],
  evidence: readonly Readonly<ImportConformanceFixtureEvidence>[],
  corpusFileCount = evidence.length,
): ImportConformanceCapabilityIndex {
  assertPackIdentity(pack);
  assertCapabilityDefinitions(definitions);
  const known = new Set(definitions.map((definition) => definition.id));
  const fixtures = evidence
    .map((fixture) => {
      if (fixture.reference === '') throw new Error('A fixture reference must be non-empty');
      assertSha256(fixture.sourceHash, `fixture ${fixture.reference} source hash`);
      const capabilities = [...new Set(fixture.capabilities)].sort();
      for (const id of capabilities) {
        if (!known.has(id)) throw new Error(`Fixture ${fixture.reference} emitted undeclared capability ${id}`);
      }
      return {
        capabilities,
        probeState: fixture.probeState ?? 'readable',
        reference: fixture.reference,
        sourceHash: fixture.sourceHash,
      };
    })
    .sort(compareFixtureReference);
  assertSortedUnique(
    fixtures.map((fixture) => fixture.reference),
    'fixture references',
  );

  const witnesses = new Map(definitions.map((definition) => [definition.id, [] as string[]]));
  for (const fixture of fixtures) {
    for (const id of fixture.capabilities) witnesses.get(id)!.push(fixture.reference);
  }
  return {
    capabilities: definitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      witnesses: witnesses.get(definition.id)!,
    })),
    fixtures,
    inventory: {
      corpusFiles: assertCorpusFileCount(corpusFileCount, fixtures.length),
      indexedSwfFiles: fixtures.length,
      unreadableSwfFiles: fixtures.filter((fixture) => fixture.probeState === 'unreadable').length,
    },
    pack: { ...pack },
    schemaVersion: 1,
  };
}

export function createImportConformanceCacheKey(sourceHash: string, importerSourceHash: string): string {
  assertSha256(sourceHash, 'fixture source hash');
  assertSha256(importerSourceHash, 'importer source hash');
  return hashText(`import-conformance-result-v1\0${sourceHash}\0${importerSourceHash}`);
}

export function createImportConformanceNotRunScore(
  pack: Readonly<ImportConformancePackIdentity>,
  definitions: readonly Readonly<ImportConformanceCapabilityDefinition>[],
  importerSourceHash: string,
  provenance: Readonly<ImportConformanceProvenance>,
): ImportConformanceScore {
  assertPackIdentity(pack);
  assertCapabilityDefinitions(definitions);
  assertSha256(importerSourceHash, 'importer source hash');
  assertExhaustiveProvenance(provenance);
  return {
    packs: [
      {
        capabilities: definitions.map((definition) => ({
          completedWitnesses: 0,
          expectedWitnesses: 0,
          id: definition.id,
          reason: 'pack-unavailable',
          state: 'not-run',
        })),
        ...pack,
        importerSourceHash,
        outcomes: null,
        reason: 'pack-unavailable',
        sharding: null,
        state: 'not-run',
        summary: null,
      },
    ],
    provenance: { ...provenance },
    schemaVersion: 1,
  };
}

export function createImportConformanceScore(
  index: Readonly<ImportConformanceCapabilityIndex>,
  plan: Readonly<ImportConformanceShardPlan>,
  completedShardIds: ReadonlySet<number>,
  results: readonly Readonly<ImportConformanceResult>[],
  instrumentationProofs: ReadonlyMap<string, Readonly<ImportConformanceInstrumentationProofs>>,
  unknownPolicy: 'measured' | 'not-run',
  importerSourceHash: string,
  provenance: Readonly<ImportConformanceProvenance>,
): ImportConformanceScore {
  assertSha256(importerSourceHash, 'importer source hash');
  assertExhaustiveProvenance(provenance);
  assertPlanMatchesIndex(plan, index);
  assertInstrumentationProofs(instrumentationProofs, index);
  const resultByReference = new Map(results.map((result) => [result.reference, result]));
  assertSortedUnique(results.map((result) => result.reference).sort(), 'result references');
  for (const result of results) assertResultMatchesIndex(result, index);

  const shards = Array.from({ length: plan.shardCount }, (_, id) =>
    completedShardIds.has(id)
      ? ({ id, state: 'measured' } as const)
      : ({ id, reason: 'missing-shard', state: 'not-run' } as const),
  );
  const hasMissingShard = shards.some((shard) => shard.state === 'not-run');
  const shardByReference = new Map(plan.assignments.map((assignment) => [assignment.reference, assignment.shardId]));
  for (const assignment of plan.assignments) {
    const result = resultByReference.get(assignment.reference);
    if (completedShardIds.has(assignment.shardId) && result === undefined) {
      throw new Error(`Completed shard has no result for ${assignment.reference}`);
    }
    if (!completedShardIds.has(assignment.shardId) && result !== undefined) {
      throw new Error(`Missing shard unexpectedly has a result for ${assignment.reference}`);
    }
  }
  const capabilities: ImportConformanceScoreCapability[] = [];
  for (const capability of index.capabilities) {
    if (capability.witnesses.length === 0) {
      capabilities.push({ id: capability.id, state: 'unmeasured' });
      continue;
    }
    const completedWitnesses = capability.witnesses.filter((reference) =>
      completedShardIds.has(shardByReference.get(reference)!),
    ).length;
    if (completedWitnesses < capability.witnesses.length) {
      capabilities.push({
        completedWitnesses,
        expectedWitnesses: capability.witnesses.length,
        id: capability.id,
        reason: 'missing-shard',
        state: 'not-run',
      });
      continue;
    }
    const capabilityInstrumentationProofs = instrumentationProofs.get(capability.id);
    if (capabilityInstrumentationProofs === undefined) {
      capabilities.push({
        id: capability.id,
        reason: 'diagnostic-instrumentation-missing',
        state: 'unknown',
        witnesses: capability.witnesses.length,
      });
      continue;
    }

    const outcomes = emptyOutcomeCounts();
    for (const reference of capability.witnesses) {
      const result = resultByReference.get(reference);
      if (result === undefined) throw new Error(`Completed shard has no result for ${reference}`);
      const outcome = result.capabilityOutcomes.find((candidate) => candidate.id === capability.id)!.outcome;
      if (outcome !== 'passed') outcomes[outcome]++;
    }
    capabilities.push({
      id: capability.id,
      instrumentationProofs: {
        fires: [...capabilityInstrumentationProofs.fires],
        staysSilent: [...capabilityInstrumentationProofs.staysSilent],
      },
      outcomes,
      result: outcomes.threw + outcomes.importedWrong + outcomes.silentlyWrong === 0 ? 'pass' : 'fail',
      state: 'measured',
      witnesses: capability.witnesses.length,
    });
  }

  const packBase = {
    capabilities,
    id: index.pack.id,
    importerSourceHash,
    release: index.pack.release,
    sharding: { algorithm: plan.algorithm, planHash: plan.planHash, shards },
    variant: index.pack.variant,
  } as const;
  if (hasMissingShard) {
    return {
      packs: [
        {
          ...packBase,
          outcomes: null,
          reason: 'missing-shard',
          state: 'not-run',
          summary: null,
        },
      ],
      provenance: { ...provenance },
      schemaVersion: 1,
    };
  }

  const measured = capabilities.filter(
    (capability): capability is ImportConformanceScoreCapabilityMeasured => capability.state === 'measured',
  );
  const unknown = capabilities.filter(
    (capability): capability is ImportConformanceScoreCapabilityUnknown => capability.state === 'unknown',
  );
  if (unknown.length > 0 && unknownPolicy === 'not-run') {
    return {
      packs: [
        {
          ...packBase,
          outcomes: null,
          reason: 'instrumentation-incomplete',
          state: 'not-run',
          summary: null,
        },
      ],
      provenance: { ...provenance },
      schemaVersion: 1,
    };
  }
  const outcomes = emptyOutcomeCounts();
  for (const result of results) {
    if (result.outcome !== 'passed') outcomes[result.outcome]++;
  }
  return {
    packs: [
      {
        ...packBase,
        outcomes,
        state: 'measured',
        summary: {
          totalCapabilities: capabilities.length,
          exercised: {
            capabilities: measured.length + unknown.length,
            instrumented: {
              capabilities: measured.length,
              passedCapabilities: measured.filter((capability) => capability.result === 'pass').length,
            },
            singleWitnessCapabilities:
              measured.filter((capability) => capability.witnesses === 1).length +
              unknown.filter((capability) => capability.witnesses === 1).length,
          },
        },
      },
    ],
    provenance: { ...provenance },
    schemaVersion: 1,
  };
}

export function createImportConformanceShardPlan(
  fixtureReferences: readonly string[],
  shardCount: number,
): ImportConformanceShardPlan {
  if (!Number.isSafeInteger(shardCount) || shardCount < 1) throw new Error('Shard count must be a positive integer');
  const references = [...fixtureReferences].sort();
  assertSortedUnique(references, 'fixture references');
  const assignments = references.map((reference, index) => ({ reference, shardId: index % shardCount }));
  const canonical = assignments.map((assignment) => `${assignment.reference}\0${assignment.shardId}`).join('\n');
  return {
    algorithm: 'fixture-count-v1',
    assignments,
    planHash: hashText(`fixture-count-v1\0${shardCount}\n${canonical}`),
    shardCount,
  };
}

export function isImportConformanceFixtureReference(reference: string): boolean {
  const segments = reference.split(/[\\/]/);
  return !segments.includes('LICENSES') && reference.toLowerCase().endsWith('.swf');
}

export function parseImportConformanceCapabilityDefinitions(
  value: unknown,
): readonly ImportConformanceCapabilityDefinition[] {
  if (!isRecord(value) || !Array.isArray(value.capabilities) || value.count !== value.capabilities.length) {
    throw new Error('Invalid SWF capability artifact root');
  }
  const definitions = value.capabilities.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || typeof candidate.label !== 'string') {
      throw new Error(`Invalid SWF capability artifact row ${index}`);
    }
    return { id: candidate.id, label: candidate.label };
  });
  assertCapabilityDefinitions(definitions);
  return definitions;
}

function assertCapabilityDefinitions(definitions: readonly Readonly<ImportConformanceCapabilityDefinition>[]): void {
  if (definitions.length === 0) throw new Error('Capability enumeration must not be empty');
  for (const definition of definitions) {
    if (!/^swf(\.[a-z0-9]+(-[a-z0-9]+)*)+$/.test(definition.id) || definition.label === '') {
      throw new Error(`Invalid capability definition ${definition.id}`);
    }
  }
  assertSortedUnique(
    definitions.map((definition) => definition.id),
    'capability ids',
  );
}

function assertCorpusFileCount(corpusFileCount: number, indexedSwfFiles: number): number {
  if (!Number.isSafeInteger(corpusFileCount) || corpusFileCount < indexedSwfFiles) {
    throw new Error('Corpus file count must be an integer no smaller than the indexed SWF count');
  }
  return corpusFileCount;
}

function assertExhaustiveProvenance(provenance: Readonly<ImportConformanceProvenance>): void {
  if (provenance.mode !== 'exhaustive' || provenance.runId.trim() === '' || provenance.runUrl.trim() === '') {
    throw new Error('A score requires the non-empty exhaustive full-index runId and runUrl');
  }
}

function assertPackIdentity(pack: Readonly<ImportConformancePackIdentity>): void {
  if (pack.id === '' || pack.release === '' || pack.variant === '') {
    throw new Error('Pack id, release, and variant must be non-empty');
  }
}

function assertInstrumentationProofs(
  proofs: ReadonlyMap<string, Readonly<ImportConformanceInstrumentationProofs>>,
  index: Readonly<ImportConformanceCapabilityIndex>,
): void {
  const declared = new Set(index.capabilities.map((capability) => capability.id));
  for (const [id, capabilityProofs] of proofs) {
    if (!declared.has(id)) throw new Error(`Instrumentation proof names undeclared capability ${id}`);
    assertInstrumentationProofList(capabilityProofs.fires, `firing proofs for ${id}`);
    assertInstrumentationProofList(capabilityProofs.staysSilent, `silence proofs for ${id}`);
  }
}

function assertInstrumentationProofList(proofs: readonly string[], label: string): void {
  if (proofs.length === 0 || proofs.some((proof) => proof.trim() === '')) {
    throw new Error(`${label} must be non-empty`);
  }
  assertSortedUnique(proofs, label);
}

function assertPlanMatchesIndex(
  plan: Readonly<ImportConformanceShardPlan>,
  index: Readonly<ImportConformanceCapabilityIndex>,
): void {
  const expected = createImportConformanceShardPlan(
    index.fixtures.map((fixture) => fixture.reference),
    plan.shardCount,
  );
  if (plan.algorithm !== expected.algorithm || plan.planHash !== expected.planHash) {
    throw new Error('Shard plan does not match the exhaustive capability index');
  }
}

function assertResultMatchesIndex(
  result: Readonly<ImportConformanceResult>,
  index: Readonly<ImportConformanceCapabilityIndex>,
): void {
  const fixture = index.fixtures.find((candidate) => candidate.reference === result.reference);
  if (fixture === undefined) throw new Error(`Result names unknown fixture ${result.reference}`);
  if (fixture.sourceHash !== result.sourceHash) throw new Error(`Result source hash is stale for ${result.reference}`);
  const expected = fixture.capabilities.join('\0');
  if (result.capabilityOutcomes.map((candidate) => candidate.id).join('\0') !== expected) {
    throw new Error(`Result capability evidence is stale for ${result.reference}`);
  }
}

function assertSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} must be a lowercase SHA-256`);
}

function assertSortedUnique(values: readonly (number | string)[], label: string): void {
  for (let index = 1; index < values.length; index++) {
    if (values[index - 1]! >= values[index]!) throw new Error(`${label} must be sorted and unique`);
  }
}

function compareFixtureReference(
  a: Readonly<ImportConformanceIndexedFixture>,
  b: Readonly<ImportConformanceIndexedFixture>,
): number {
  return a.reference < b.reference ? -1 : a.reference > b.reference ? 1 : 0;
}

function emptyOutcomeCounts(): ImportConformanceOutcomeCounts {
  return { importedWrong: 0, silentlyWrong: 0, threw: 0, unsupportedClean: 0 };
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
