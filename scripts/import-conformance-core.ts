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
  capabilities: readonly string[];
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
    diagnosticReported: boolean;
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

export interface ImportConformanceScoreCapabilityExercised {
  id: string;
  instrumentation: {
    fires: ImportConformanceScoreInstrumentationRole;
    staysSilent: ImportConformanceScoreInstrumentationRole;
  };
  outcomes: ImportConformanceOutcomeCounts;
  results: {
    fire: ImportConformanceScoreLaneResult;
    silence: ImportConformanceScoreLaneResult;
  };
  state: 'exercised';
  unknownObservations: ImportConformanceUnknownObservation[];
  witnesses: number;
}

export type ImportConformanceScoreInstrumentationRole =
  | { proofs: readonly string[]; state: 'proven' }
  | { state: 'unproven' };

export interface ImportConformanceScoreLaneResult {
  state: 'fail' | 'pass' | 'unknown';
}

export interface ImportConformanceInstrumentationProofs {
  fires: readonly string[];
  staysSilent: readonly string[];
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

export interface ImportConformanceUnknownObservation {
  reason:
    | 'fire-proof-missing-for-no-crumb'
    | 'loss-path-known-not-wired'
    | 'loss-path-not-identified'
    | 'silence-proof-missing-for-crumb';
  reference: string;
}

export type ImportConformanceScoreCapability =
  | ImportConformanceScoreCapabilityExercised
  | ImportConformanceScoreCapabilityNotRun
  | ImportConformanceScoreCapabilityUnmeasured;

interface ImportConformanceScorePackBase {
  capabilities: ImportConformanceScoreCapability[];
  id: string;
  importerSourceHash: string;
  release: string;
  sharding: {
    algorithm: 'fixture-count-v1';
    planHash: string;
    shards: ({ id: number; state: 'measured' } | { id: number; reason: string; state: 'not-run' })[];
  } | null;
  variant: string;
}

export interface ImportConformanceScorePackMeasured extends ImportConformanceScorePackBase {
  state: 'measured';
  summary: ImportConformanceScoreSummary;
}

export interface ImportConformanceScorePackNotRun extends ImportConformanceScorePackBase {
  outcomes: null;
  reason: 'missing-shard' | 'pack-unavailable';
  state: 'not-run';
  summary: null;
}

export type ImportConformanceScorePack = ImportConformanceScorePackMeasured | ImportConformanceScorePackNotRun;

export interface ImportConformanceScoreSummary {
  totalCapabilities: number;
  exercised: {
    capabilities: number;
    fireProven: ImportConformanceScoreProvenSummary;
    silenceProven: ImportConformanceScoreProvenSummary;
    singleWitnessCapabilities: number;
  };
}

export interface ImportConformanceScoreProvenSummary {
  capabilities: number;
  results: {
    failedCapabilities: number;
    passedCapabilities: number;
    unknownCapabilities: number;
  };
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
  return hashText(`import-conformance-result-v2\0${sourceHash}\0${importerSourceHash}`);
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
  lossPathIdentifiedByCapability: ReadonlyMap<string, boolean>,
  importerSourceHash: string,
  provenance: Readonly<ImportConformanceProvenance>,
): ImportConformanceScore {
  assertSha256(importerSourceHash, 'importer source hash');
  assertExhaustiveProvenance(provenance);
  assertPlanMatchesIndex(plan, index);
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
  const sharding = { algorithm: plan.algorithm, planHash: plan.planHash, shards } as const;
  if (hasMissingShard) {
    const capabilities = index.capabilities.map((capability): ImportConformanceScoreCapability => {
      if (capability.witnesses.length === 0) return { id: capability.id, state: 'unmeasured' };
      return {
        completedWitnesses: capability.witnesses.filter((reference) =>
          completedShardIds.has(shardByReference.get(reference)!),
        ).length,
        expectedWitnesses: capability.witnesses.length,
        id: capability.id,
        reason: 'missing-shard',
        state: 'not-run',
      };
    });
    return {
      packs: [
        {
          capabilities,
          ...index.pack,
          importerSourceHash,
          outcomes: null,
          reason: 'missing-shard',
          sharding,
          state: 'not-run',
          summary: null,
        },
      ],
      provenance: { ...provenance },
      schemaVersion: 1,
    };
  }

  assertInstrumentationProofs(instrumentationProofs, index);
  assertLossPathStates(lossPathIdentifiedByCapability, index);
  for (const id of instrumentationProofs.keys()) {
    if (lossPathIdentifiedByCapability.get(id) !== true) {
      throw new Error(`Instrumentation proof for ${id} requires an identified loss path`);
    }
  }
  const capabilities: ImportConformanceScoreCapability[] = [];
  for (const capability of index.capabilities) {
    if (capability.witnesses.length === 0) {
      capabilities.push({ id: capability.id, state: 'unmeasured' });
      continue;
    }
    const capabilityInstrumentationProofs = instrumentationProofs.get(capability.id) ?? {
      fires: [],
      staysSilent: [],
    };
    const outcomes = emptyOutcomeCounts();
    const unknownObservations: ImportConformanceUnknownObservation[] = [];
    for (const reference of capability.witnesses) {
      const result = resultByReference.get(reference);
      if (result === undefined) throw new Error(`Completed shard has no result for ${reference}`);
      const outcome = result.capabilityOutcomes.find((candidate) => candidate.id === capability.id)!.outcome;
      if (outcome === 'threw' || outcome === 'importedWrong') {
        outcomes[outcome]++;
        continue;
      }
      const proofRole =
        outcome === 'unsupportedClean'
          ? capabilityInstrumentationProofs.staysSilent
          : capabilityInstrumentationProofs.fires;
      if (proofRole.length === 0) {
        unknownObservations.push({
          reason: getMissingProofReason(
            outcome,
            capabilityInstrumentationProofs,
            lossPathIdentifiedByCapability.get(capability.id)!,
          ),
          reference,
        });
        continue;
      }
      if (outcome !== 'passed') outcomes[outcome]++;
    }
    const failed = outcomes.threw + outcomes.importedWrong + outcomes.silentlyWrong > 0;
    const fire = createLaneResult(failed, unknownObservations.length > 0, capabilityInstrumentationProofs.fires);
    const silence = createLaneResult(
      failed,
      unknownObservations.length > 0,
      capabilityInstrumentationProofs.staysSilent,
    );
    capabilities.push({
      id: capability.id,
      instrumentation: {
        fires: createScoreInstrumentationRole(capabilityInstrumentationProofs.fires),
        staysSilent: createScoreInstrumentationRole(capabilityInstrumentationProofs.staysSilent),
      },
      outcomes,
      results: { fire, silence },
      state: 'exercised',
      unknownObservations,
      witnesses: capability.witnesses.length,
    });
  }

  const packBase = {
    capabilities,
    id: index.pack.id,
    importerSourceHash,
    release: index.pack.release,
    sharding,
    variant: index.pack.variant,
  } as const;
  const exercised = capabilities.filter(
    (capability): capability is ImportConformanceScoreCapabilityExercised => capability.state === 'exercised',
  );
  const fireProven = exercised.filter((capability) => capability.instrumentation.fires.state === 'proven');
  const silenceProven = exercised.filter((capability) => capability.instrumentation.staysSilent.state === 'proven');
  return {
    packs: [
      {
        ...packBase,
        state: 'measured',
        summary: {
          totalCapabilities: capabilities.length,
          exercised: {
            capabilities: exercised.length,
            fireProven: summarizeProvenCapabilities(fireProven, 'fire'),
            silenceProven: summarizeProvenCapabilities(silenceProven, 'silence'),
            singleWitnessCapabilities: exercised.filter((capability) => capability.witnesses === 1).length,
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
    if (capabilityProofs.fires.length === 0 && capabilityProofs.staysSilent.length === 0) {
      throw new Error(`Instrumentation proofs for ${id} must represent at least one proof role`);
    }
  }
}

function assertInstrumentationProofList(proofs: readonly string[], label: string): void {
  if (proofs.some((proof) => proof.trim() === '')) throw new Error(`${label} must not contain empty names`);
  assertSortedUnique(proofs, label);
}

function assertLossPathStates(
  states: ReadonlyMap<string, boolean>,
  index: Readonly<ImportConformanceCapabilityIndex>,
): void {
  const declared = new Set(index.capabilities.map((capability) => capability.id));
  if (states.size !== declared.size) throw new Error('Every declared capability requires an explicit loss-path state');
  for (const [id, identified] of states) {
    if (!declared.has(id) || typeof identified !== 'boolean') {
      throw new Error(`Invalid loss-path state for ${id}`);
    }
  }
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

function createLaneResult(
  failed: boolean,
  hasUnknownObservations: boolean,
  proofs: readonly string[],
): ImportConformanceScoreLaneResult {
  return {
    state: failed ? 'fail' : hasUnknownObservations || proofs.length === 0 ? 'unknown' : 'pass',
  };
}

function createScoreInstrumentationRole(proofs: readonly string[]): ImportConformanceScoreInstrumentationRole {
  return proofs.length === 0 ? { state: 'unproven' } : { proofs: [...proofs], state: 'proven' };
}

function getMissingProofReason(
  outcome: ImportConformanceResult['capabilityOutcomes'][number]['outcome'],
  proofs: Readonly<ImportConformanceInstrumentationProofs>,
  lossPathIdentified: boolean,
): ImportConformanceUnknownObservation['reason'] {
  if (proofs.fires.length === 0 && proofs.staysSilent.length === 0) {
    return lossPathIdentified ? 'loss-path-known-not-wired' : 'loss-path-not-identified';
  }
  return outcome === 'unsupportedClean' ? 'silence-proof-missing-for-crumb' : 'fire-proof-missing-for-no-crumb';
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function summarizeProvenCapabilities(
  capabilities: readonly Readonly<ImportConformanceScoreCapabilityExercised>[],
  lane: keyof ImportConformanceScoreCapabilityExercised['results'],
): ImportConformanceScoreProvenSummary {
  return {
    capabilities: capabilities.length,
    results: {
      failedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'fail').length,
      passedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'pass').length,
      unknownCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'unknown').length,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
