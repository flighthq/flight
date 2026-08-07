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
    diagnosticCause: 'separable' | 'unknown';
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
  instrumentAssurance: ImportConformanceInstrumentAssurance;
  packs: ImportConformanceScorePack[];
  provenance: ImportConformanceProvenance;
  schemaVersion: 1;
}

export interface ImportConformanceInstrumentAssurance {
  payloadValidity: 'external-audit-required';
  triggerCorrectness: 'proof-reference-presence';
  triggerScope: 'external-audit-required';
  triggerSpecificity: 'proof-reference-presence';
}

export interface ImportConformanceScoreCapabilityExercised {
  id: string;
  instrumentation: {
    fires: ImportConformanceScoreInstrumentationRole;
    staysSilent: ImportConformanceScoreInstrumentationRole;
  };
  lossPath: ImportConformanceLossPath;
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
  | { proofs: readonly [string, ...string[]]; state: 'referenced' }
  | { state: 'unreferenced' };

export interface ImportConformanceScoreLaneResult {
  state: 'fail' | 'pass' | 'unknown';
}

export interface ImportConformanceInstrumentationProofs {
  fires: readonly string[];
  staysSilent: readonly string[];
}

export type ImportConformanceLossPathState = 'audited-none' | 'identified' | 'unaudited';

export interface ImportConformanceLossPathAudit {
  auditId: string;
  auditedAt: string;
  subjectHash: string;
}

export type ImportConformanceLossPath =
  | { audit: ImportConformanceLossPathAudit; state: 'audited-none' | 'identified' }
  | { state: 'unaudited' };

export interface ImportConformanceScoreCapabilityNotRun {
  completedWitnesses: number;
  expectedWitnesses: number;
  id: string;
  reason: 'missing-shard' | 'pack-unavailable';
  state: 'not-run';
}

export interface ImportConformanceScoreCapabilityUnmeasured {
  id: string;
  instrumentation: {
    fires: ImportConformanceScoreInstrumentationRole;
    staysSilent: ImportConformanceScoreInstrumentationRole;
  };
  lossPath: ImportConformanceLossPath;
  state: 'unmeasured';
}

export interface ImportConformanceUnknownObservation {
  reason:
    | 'diagnostic-cause-unknown'
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
    fireReferenced: ImportConformanceScoreReferencedSummary;
    silenceReferenced: ImportConformanceScoreReferencedSummary;
    singleWitnessCapabilities: number;
  };
  lossPathPopulation: {
    auditedCapabilities: number;
    auditedNoLossPathCapabilities: number;
    auditState: 'complete' | 'partial';
    canSilentlyLoseCapabilities: number;
    unauditedCapabilities: number;
  };
  proofReferenced: {
    fireCapabilities: number;
    silenceCapabilities: number;
  };
}

export interface ImportConformanceScoreReferencedSummary {
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
      const probeState = fixture.probeState ?? 'readable';
      if (probeState === 'unreadable' && capabilities.length > 0) {
        throw new Error(`Unreadable fixture ${fixture.reference} must not contribute capability evidence`);
      }
      for (const id of capabilities) {
        if (!known.has(id)) throw new Error(`Fixture ${fixture.reference} emitted undeclared capability ${id}`);
      }
      return {
        capabilities,
        probeState,
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
  return hashText(`import-conformance-result-v3\0${sourceHash}\0${importerSourceHash}`);
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
    instrumentAssurance: createImportConformanceInstrumentAssurance(),
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
  lossPathByCapability: ReadonlyMap<string, Readonly<ImportConformanceLossPath>>,
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
    const capabilities = index.capabilities.map(
      (capability): ImportConformanceScoreCapabilityNotRun => ({
        completedWitnesses: capability.witnesses.filter((reference) =>
          completedShardIds.has(shardByReference.get(reference)!),
        ).length,
        expectedWitnesses: capability.witnesses.length,
        id: capability.id,
        reason: 'missing-shard',
        state: 'not-run',
      }),
    );
    return {
      instrumentAssurance: createImportConformanceInstrumentAssurance(),
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
  assertLossPaths(lossPathByCapability, index);
  for (const id of instrumentationProofs.keys()) {
    if (lossPathByCapability.get(id)?.state !== 'identified') {
      throw new Error(`Instrumentation proof for ${id} requires an identified loss path`);
    }
  }
  const capabilities: ImportConformanceScoreCapability[] = [];
  for (const capability of index.capabilities) {
    const capabilityInstrumentationProofs = instrumentationProofs.get(capability.id) ?? {
      fires: [],
      staysSilent: [],
    };
    const instrumentation = {
      fires: createScoreInstrumentationRole(capabilityInstrumentationProofs.fires),
      staysSilent: createScoreInstrumentationRole(capabilityInstrumentationProofs.staysSilent),
    };
    const lossPath = cloneLossPath(lossPathByCapability.get(capability.id)!);
    if (capability.witnesses.length === 0) {
      capabilities.push({ id: capability.id, instrumentation, lossPath, state: 'unmeasured' });
      continue;
    }
    const outcomes = emptyOutcomeCounts();
    const unknownObservations: ImportConformanceUnknownObservation[] = [];
    for (const reference of capability.witnesses) {
      const result = resultByReference.get(reference);
      if (result === undefined) throw new Error(`Completed shard has no result for ${reference}`);
      const capabilityOutcome = result.capabilityOutcomes.find((candidate) => candidate.id === capability.id)!;
      if (capabilityOutcome.diagnosticCause === 'unknown') {
        unknownObservations.push({ reason: 'diagnostic-cause-unknown', reference });
        continue;
      }
      const { outcome } = capabilityOutcome;
      if (outcome === 'threw' || outcome === 'importedWrong') {
        outcomes[outcome]++;
        continue;
      }
      if (lossPath.state === 'audited-none') {
        if (outcome !== 'passed') outcomes[outcome]++;
        continue;
      }
      const proofRole =
        outcome === 'unsupportedClean'
          ? capabilityInstrumentationProofs.staysSilent
          : capabilityInstrumentationProofs.fires;
      if (proofRole.length === 0) {
        unknownObservations.push({
          reason: getMissingProofReason(outcome, capabilityInstrumentationProofs, lossPath.state),
          reference,
        });
        continue;
      }
      if (outcome !== 'passed') outcomes[outcome]++;
    }
    const failed = outcomes.threw + outcomes.importedWrong + outcomes.silentlyWrong > 0;
    const fire = createLaneResult(
      failed,
      unknownObservations.length > 0,
      capabilityInstrumentationProofs.fires,
      lossPath.state !== 'audited-none',
    );
    const silence = createLaneResult(
      failed,
      unknownObservations.length > 0,
      capabilityInstrumentationProofs.staysSilent,
      lossPath.state !== 'audited-none',
    );
    capabilities.push({
      id: capability.id,
      instrumentation,
      lossPath,
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
  const fireReferenced = exercised.filter((capability) => capability.instrumentation.fires.state === 'referenced');
  const silenceReferenced = exercised.filter(
    (capability) => capability.instrumentation.staysSilent.state === 'referenced',
  );
  const measuredCapabilities = capabilities.filter(
    (
      capability,
    ): capability is ImportConformanceScoreCapabilityExercised | ImportConformanceScoreCapabilityUnmeasured =>
      capability.state !== 'not-run',
  );
  const summary: ImportConformanceScoreSummary = {
    totalCapabilities: capabilities.length,
    exercised: {
      capabilities: exercised.length,
      fireReferenced: summarizeReferencedCapabilities(fireReferenced, 'fire'),
      silenceReferenced: summarizeReferencedCapabilities(silenceReferenced, 'silence'),
      singleWitnessCapabilities: exercised.filter((capability) => capability.witnesses === 1).length,
    },
    lossPathPopulation: summarizeLossPathPopulation(measuredCapabilities),
    proofReferenced: {
      fireCapabilities: measuredCapabilities.filter(
        (capability) => capability.instrumentation.fires.state === 'referenced',
      ).length,
      silenceCapabilities: measuredCapabilities.filter(
        (capability) => capability.instrumentation.staysSilent.state === 'referenced',
      ).length,
    },
  };
  assertSummaryMatchesCapabilities(summary, capabilities);
  return {
    instrumentAssurance: createImportConformanceInstrumentAssurance(),
    packs: [
      {
        ...packBase,
        state: 'measured',
        summary,
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

function assertLossPaths(
  lossPaths: ReadonlyMap<string, Readonly<ImportConformanceLossPath>>,
  index: Readonly<ImportConformanceCapabilityIndex>,
): void {
  const declared = new Set(index.capabilities.map((capability) => capability.id));
  if (lossPaths.size !== declared.size) {
    throw new Error('Every declared capability requires an explicit loss-path declaration');
  }
  for (const [id, lossPath] of lossPaths) {
    if (!declared.has(id)) {
      throw new Error(`Invalid loss-path state for ${id}`);
    }
    if (lossPath.state === 'unaudited') continue;
    assertLossPathAudit(lossPath.audit, id);
  }
}

function assertLossPathAudit(audit: Readonly<ImportConformanceLossPathAudit>, id: string): void {
  if (audit.auditId.trim() === '' || audit.subjectHash.trim() === '') {
    throw new Error(`Loss-path audit for ${id} requires non-empty auditId and subjectHash`);
  }
  const timestamp = Date.parse(audit.auditedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(audit.auditedAt) ||
    Number.isNaN(timestamp) ||
    new Date(timestamp).toISOString() !== audit.auditedAt
  ) {
    throw new Error(`Loss-path audit for ${id} requires a canonical UTC auditedAt`);
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

function createImportConformanceInstrumentAssurance(): ImportConformanceInstrumentAssurance {
  return {
    payloadValidity: 'external-audit-required',
    triggerCorrectness: 'proof-reference-presence',
    triggerScope: 'external-audit-required',
    triggerSpecificity: 'proof-reference-presence',
  };
}

function createLaneResult(
  failed: boolean,
  hasUnknownObservations: boolean,
  proofs: readonly string[],
  unreferencedIsUnknown: boolean,
): ImportConformanceScoreLaneResult {
  return {
    state: failed
      ? 'fail'
      : hasUnknownObservations || (unreferencedIsUnknown && proofs.length === 0)
        ? 'unknown'
        : 'pass',
  };
}

function createScoreInstrumentationRole(proofs: readonly string[]): ImportConformanceScoreInstrumentationRole {
  return proofs.length === 0
    ? { state: 'unreferenced' }
    : { proofs: [...proofs] as [string, ...string[]], state: 'referenced' };
}

function cloneLossPath(lossPath: Readonly<ImportConformanceLossPath>): ImportConformanceLossPath {
  return lossPath.state === 'unaudited'
    ? { state: 'unaudited' }
    : { audit: { ...lossPath.audit }, state: lossPath.state };
}

function getMissingProofReason(
  outcome: ImportConformanceResult['capabilityOutcomes'][number]['outcome'],
  proofs: Readonly<ImportConformanceInstrumentationProofs>,
  lossPathState: ImportConformanceLossPathState,
): ImportConformanceUnknownObservation['reason'] {
  if (proofs.fires.length === 0 && proofs.staysSilent.length === 0) {
    return lossPathState === 'identified' ? 'loss-path-known-not-wired' : 'loss-path-not-identified';
  }
  return outcome === 'unsupportedClean' ? 'silence-proof-missing-for-crumb' : 'fire-proof-missing-for-no-crumb';
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function summarizeReferencedCapabilities(
  capabilities: readonly Readonly<ImportConformanceScoreCapabilityExercised>[],
  lane: keyof ImportConformanceScoreCapabilityExercised['results'],
): ImportConformanceScoreReferencedSummary {
  return {
    capabilities: capabilities.length,
    results: {
      failedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'fail').length,
      passedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'pass').length,
      unknownCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'unknown').length,
    },
  };
}

function summarizeLossPathPopulation(
  capabilities: readonly Readonly<
    ImportConformanceScoreCapabilityExercised | ImportConformanceScoreCapabilityUnmeasured
  >[],
): ImportConformanceScoreSummary['lossPathPopulation'] {
  const unauditedCapabilities = capabilities.filter((capability) => capability.lossPath.state === 'unaudited').length;
  const auditedNoLossPathCapabilities = capabilities.filter(
    (capability) => capability.lossPath.state === 'audited-none',
  ).length;
  return {
    auditedCapabilities: capabilities.length - unauditedCapabilities,
    auditedNoLossPathCapabilities,
    auditState: unauditedCapabilities === 0 ? 'complete' : 'partial',
    canSilentlyLoseCapabilities: capabilities.filter((capability) => capability.lossPath.state === 'identified').length,
    unauditedCapabilities,
  };
}

function assertSummaryMatchesCapabilities(
  summary: Readonly<ImportConformanceScoreSummary>,
  capabilities: readonly Readonly<ImportConformanceScoreCapability>[],
): void {
  const measured = capabilities.filter(
    (
      capability,
    ): capability is ImportConformanceScoreCapabilityExercised | ImportConformanceScoreCapabilityUnmeasured =>
      capability.state !== 'not-run',
  );
  const exercised = measured.filter(
    (capability): capability is ImportConformanceScoreCapabilityExercised => capability.state === 'exercised',
  );
  const fireReferenced = exercised.filter((capability) => capability.instrumentation.fires.state === 'referenced');
  const silenceReferenced = exercised.filter(
    (capability) => capability.instrumentation.staysSilent.state === 'referenced',
  );
  const checks: readonly [number, number, string][] = [
    [summary.totalCapabilities, capabilities.length, 'totalCapabilities'],
    [summary.exercised.capabilities, exercised.length, 'exercised.capabilities'],
    [summary.exercised.fireReferenced.capabilities, fireReferenced.length, 'exercised.fireReferenced.capabilities'],
    [
      summary.exercised.silenceReferenced.capabilities,
      silenceReferenced.length,
      'exercised.silenceReferenced.capabilities',
    ],
    [
      summary.exercised.singleWitnessCapabilities,
      exercised.filter((capability) => capability.witnesses === 1).length,
      'exercised.singleWitnessCapabilities',
    ],
    [
      summary.proofReferenced.fireCapabilities,
      measured.filter((capability) => capability.instrumentation.fires.state === 'referenced').length,
      'proofReferenced.fireCapabilities',
    ],
    [
      summary.proofReferenced.silenceCapabilities,
      measured.filter((capability) => capability.instrumentation.staysSilent.state === 'referenced').length,
      'proofReferenced.silenceCapabilities',
    ],
  ];
  for (const [actual, expected, path] of checks) {
    if (actual !== expected) throw new Error(`Score summary ${path} must equal the capability rows (${expected})`);
  }
  assertReferencedResultsMatch(summary.exercised.fireReferenced, fireReferenced, 'fire');
  assertReferencedResultsMatch(summary.exercised.silenceReferenced, silenceReferenced, 'silence');
  const expectedLossPath = summarizeLossPathPopulation(measured);
  if (JSON.stringify(summary.lossPathPopulation) !== JSON.stringify(expectedLossPath)) {
    throw new Error('Score summary lossPathPopulation must equal the capability rows');
  }
}

function assertReferencedResultsMatch(
  summary: Readonly<ImportConformanceScoreReferencedSummary>,
  capabilities: readonly Readonly<ImportConformanceScoreCapabilityExercised>[],
  lane: 'fire' | 'silence',
): void {
  const expected = {
    failedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'fail').length,
    passedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'pass').length,
    unknownCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'unknown').length,
  };
  if (JSON.stringify(summary.results) !== JSON.stringify(expected)) {
    throw new Error(`Score summary exercised.${lane}Referenced.results must equal the capability rows`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
