import { createHash } from 'node:crypto';

import { assertImportConformanceOracleOutcomes, createImportConformanceCaseIdentity } from './import-conformance-case';
import type {
  ImportConformanceCaseIdentity,
  ImportConformanceCaseMember,
  ImportConformanceOracleOutcome,
} from './import-conformance-case';
import { assertImportConformanceDenominators } from './import-conformance-denominator';
import type { ImportConformanceDenominators } from './import-conformance-denominator';
import {
  assertImportConformanceDiagnosticEvidencePolicy,
  cloneImportConformanceDiagnosticEvidencePolicy,
  parseImportConformanceRetainedDiagnostic,
} from './import-conformance-diagnostic-evidence';
import type { ImportConformanceDiagnosticEvidencePolicy } from './import-conformance-diagnostic-evidence';
import {
  deriveImportConformanceCapabilityScopedUnknownEvidence,
  IMPORT_CONFORMANCE_FIXTURE_OUTCOME_DEFINITIONS,
} from './import-conformance-score';
import type {
  ImportConformanceCapability,
  ImportConformanceCapabilityScopedUnknownMappings,
  ImportConformanceConfigurationLimit,
  ImportConformanceConfigurationLimits,
  ImportConformanceDiagnosticChannel,
  ImportConformanceExercisedCapability,
  ImportConformanceFixtureDiagnosticEvidence,
  ImportConformanceFixtureOutcome,
  ImportConformanceFixtureOutcomePopulations,
  ImportConformanceFixtureOutcomes,
  ImportConformanceInstrumentAssurance,
  ImportConformanceInstrumentAudit,
  ImportConformanceInstrumentation,
  ImportConformanceLossPath,
  ImportConformanceLossPathAudit,
  ImportConformanceMeasuredPack,
  ImportConformanceNotRunCapability,
  ImportConformanceNotRunPack,
  ImportConformanceOracleAssurance,
  ImportConformanceOracleOutcomes,
  ImportConformanceOutcomeCounts,
  ImportConformanceProvenance,
  ImportConformanceReferencedSummary,
  ImportConformanceScore,
  ImportConformanceSummary,
  ImportConformanceUnknownObservation,
  ImportConformanceUnmeasuredCapability,
  ImportConformanceUnwiredLossObservation,
} from './import-conformance-score';

export type {
  ImportConformanceConfigurationLimit,
  ImportConformanceConfigurationLimits,
  ImportConformanceDiagnosticChannel,
  ImportConformanceInstrumentAssurance,
  ImportConformanceInstrumentAudit,
  ImportConformanceLossPath,
  ImportConformanceLossPathAudit,
  ImportConformanceOracleAssurance,
  ImportConformanceOutcomeCounts,
  ImportConformanceProvenance,
  ImportConformanceScore,
  ImportConformanceUnknownObservation,
  ImportConformanceUnwiredLossObservation,
} from './import-conformance-score';

export type ImportConformanceScoreCapability = ImportConformanceCapability;
export type ImportConformanceScoreCapabilityExercised = ImportConformanceExercisedCapability;
export type ImportConformanceScoreCapabilityNotRun = ImportConformanceNotRunCapability;
export type ImportConformanceScoreCapabilityUnmeasured = ImportConformanceUnmeasuredCapability;
export type ImportConformanceScoreInstrumentationRole = ImportConformanceInstrumentation;
export type ImportConformanceScoreLaneResult = ImportConformanceExercisedCapability['results']['fire'];
export type ImportConformanceScorePackMeasured = ImportConformanceMeasuredPack;
export type ImportConformanceScorePackNotRun = ImportConformanceNotRunPack;
export type ImportConformanceScoreReferencedSummary = ImportConformanceReferencedSummary;
export type ImportConformanceScoreSummary = ImportConformanceSummary;

export interface ImportConformanceCapabilityDefinition {
  id: string;
  label: string;
}

export interface ImportConformanceCapabilityIndex {
  capabilities: ImportConformanceIndexedCapability[];
  cases: ImportConformanceIndexedCase[];
  inventory: {
    corpusFiles: number;
    indexedCases: number;
    unreadableCases: number;
  };
  pack: ImportConformancePackIdentity;
  schemaVersion: 2;
}

export interface ImportConformanceIndexedCapability extends ImportConformanceCapabilityDefinition {
  witnesses: string[];
}

export interface ImportConformanceIndexedCase extends ImportConformanceCaseIdentity {
  capabilities: readonly string[];
  probeState: 'readable' | 'unreadable';
}

/** SWF's one-file index remains an adapter over the case contract. */
export type ImportConformanceIndexedFixture = ImportConformanceIndexedCase;

export interface ImportConformancePackIdentity {
  capabilityConventionRevision: string;
  id: string;
  release: string;
  variant: string;
}

export interface ImportConformanceResult {
  caseHash: string;
  capabilityOutcomes: {
    diagnosticCause: 'separable' | 'unknown';
    diagnosticReported: boolean;
    id: string;
    outcome: keyof ImportConformanceOutcomeCounts | 'passed';
  }[];
  importOutcome: keyof ImportConformanceOutcomeCounts | 'passed';
  oracleOutcomes: ImportConformanceOracleOutcome[];
  outcome: keyof ImportConformanceOutcomeCounts | 'passed';
  probeUnreadableEvidence?: {
    diagnostics: ImportConformanceFixtureDiagnosticEvidence[];
    imported: boolean;
    threw: boolean;
  };
  reference: string;
}

export function applyImportConformanceOracleOutcomes(
  importOutcome: ImportConformanceResult['importOutcome'],
  oracleOutcomes: readonly Readonly<ImportConformanceOracleOutcome>[],
): ImportConformanceResult['outcome'] {
  assertImportConformanceOracleOutcomes(oracleOutcomes);
  return importOutcome === 'passed' && oracleOutcomes.some((oracle) => oracle.state === 'failed')
    ? 'importedWrong'
    : importOutcome;
}

export interface ImportConformanceShardPlan {
  algorithm: 'case-count-v2';
  assignments: ImportConformanceShardAssignment[];
  planHash: string;
  shardCount: number;
}

export interface ImportConformanceShardAssignment {
  caseHash: string;
  reference: string;
  shardId: number;
}

export interface ImportConformanceInstrumentationProofs {
  audits?: readonly ImportConformanceInstrumentAudit[];
  channel?: ImportConformanceDiagnosticChannel;
  fires: readonly string[];
  staysSilent: readonly string[];
}

export interface ImportConformanceScoreDeclarations {
  capabilityScopedUnknownMappings: Readonly<ImportConformanceCapabilityScopedUnknownMappings>;
  denominators: Readonly<ImportConformanceDenominators>;
  diagnosticEvidencePolicy: Readonly<ImportConformanceDiagnosticEvidencePolicy>;
}

export interface ImportConformanceCaseEvidence {
  capabilities: readonly string[];
  members: readonly Readonly<ImportConformanceCaseMember>[];
  probeState?: 'readable' | 'unreadable';
  reference: string;
}

export function buildImportConformanceCapabilityIndex(
  pack: Readonly<ImportConformancePackIdentity>,
  definitions: readonly Readonly<ImportConformanceCapabilityDefinition>[],
  evidence: readonly Readonly<ImportConformanceCaseEvidence>[],
  corpusFileCount = evidence.length,
): ImportConformanceCapabilityIndex {
  assertPackIdentity(pack);
  assertCapabilityDefinitions(definitions);
  const known = new Set(definitions.map((definition) => definition.id));
  const cases = evidence
    .map((candidate) => {
      const identity = createImportConformanceCaseIdentity(candidate.reference, candidate.members);
      const capabilities = [...new Set(candidate.capabilities)].sort();
      const probeState = candidate.probeState ?? 'readable';
      if (probeState === 'unreadable' && capabilities.length > 0) {
        throw new Error(`Unreadable case ${candidate.reference} must not contribute capability evidence`);
      }
      for (const id of capabilities) {
        if (!known.has(id)) throw new Error(`Case ${candidate.reference} emitted undeclared capability ${id}`);
      }
      return {
        capabilities,
        ...identity,
        probeState,
      };
    })
    .sort(compareCaseReference);
  assertSortedUnique(
    cases.map((candidate) => candidate.reference),
    'case references',
  );
  assertSortedUnique(cases.map((candidate) => candidate.caseHash).sort(), 'case hashes');

  const witnesses = new Map(definitions.map((definition) => [definition.id, [] as string[]]));
  for (const candidate of cases) {
    for (const id of candidate.capabilities) witnesses.get(id)!.push(candidate.reference);
  }
  return {
    capabilities: definitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      witnesses: witnesses.get(definition.id)!,
    })),
    cases,
    inventory: {
      corpusFiles: assertCorpusFileCount(corpusFileCount, cases.flatMap((candidate) => candidate.members).length),
      indexedCases: cases.length,
      unreadableCases: cases.filter((candidate) => candidate.probeState === 'unreadable').length,
    },
    pack: { ...pack },
    schemaVersion: 2,
  };
}

export function createImportConformanceCacheKey(caseHash: string, importerSourceHash: string): string {
  assertSha256(caseHash, 'case hash');
  assertSha256(importerSourceHash, 'importer source hash');
  return hashText(`import-conformance-result-v4\0${caseHash}\0${importerSourceHash}`);
}

export function assertImportConformanceFrozenCapabilityPartition(
  score: Readonly<ImportConformanceScore>,
  definitions: readonly Readonly<ImportConformanceCapabilityDefinition>[],
): void {
  assertCapabilityDefinitions(definitions);
  const expected = definitions.map((definition) => definition.id);
  for (const pack of score.packs) {
    const actual = pack.capabilities.map((capability) => capability.id);
    if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
      throw new Error(
        `Generated score capability ids must exactly equal the frozen capability partition; expected [${expected.join(', ')}], received [${actual.join(', ')}]`,
      );
    }
  }
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
    oracleAssurance: createImportConformanceOracleAssurance(),
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
        fixtureOutcomes: null,
        importerSourceHash,
        oracleOutcomes: null,
        outcomes: null,
        reason: 'pack-unavailable',
        sharding: null,
        state: 'not-run',
        summary: null,
      },
    ],
    provenance: { ...provenance },
    schemaVersion: 2,
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
  declarations: Readonly<ImportConformanceScoreDeclarations>,
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
      oracleAssurance: createImportConformanceOracleAssurance(),
      packs: [
        {
          capabilities,
          ...index.pack,
          fixtureOutcomes: null,
          importerSourceHash,
          oracleOutcomes: null,
          outcomes: null,
          reason: 'missing-shard',
          sharding,
          state: 'not-run',
          summary: null,
        },
      ],
      provenance: { ...provenance },
      schemaVersion: 2,
    };
  }

  assertInstrumentationProofs(instrumentationProofs, index);
  assertLossPaths(lossPathByCapability, index);
  assertScoreDeclarations(declarations, instrumentationProofs, lossPathByCapability, index);
  const capabilityIds = new Set(index.capabilities.map((capability) => capability.id));
  for (const result of results) {
    for (const diagnostic of result.probeUnreadableEvidence?.diagnostics ?? []) {
      parseImportConformanceRetainedDiagnostic(diagnostic, capabilityIds, declarations.diagnosticEvidencePolicy);
    }
  }
  const capabilityScopedUnknownEvidence = new Map(
    deriveImportConformanceCapabilityScopedUnknownEvidence(
      index.capabilities.map((capability) => capability.id),
      declarations.capabilityScopedUnknownMappings,
    ).map((evidence) => [evidence.capabilityId, evidence]),
  );
  for (const id of instrumentationProofs.keys()) {
    if (lossPathByCapability.get(id)?.state !== 'identified') {
      throw new Error(`Instrumentation proof for ${id} requires an identified loss path`);
    }
  }
  const capabilities: ImportConformanceScoreCapability[] = [];
  for (const capability of index.capabilities) {
    const capabilityInstrumentationProofs = instrumentationProofs.get(capability.id) ?? {
      audits: [],
      channel: 'none',
      fires: [],
      staysSilent: [],
    };
    const audits = [...(capabilityInstrumentationProofs.audits ?? [])];
    const channel =
      capabilityInstrumentationProofs.channel ??
      (capabilityInstrumentationProofs.fires.length > 0 || capabilityInstrumentationProofs.staysSilent.length > 0
        ? 'structured-crumb'
        : 'none');
    const instrumentation = {
      audits,
      channel,
      fires: createScoreInstrumentationRole(capabilityInstrumentationProofs.fires),
      staysSilent: createScoreInstrumentationRole(capabilityInstrumentationProofs.staysSilent),
    };
    const lossPath = cloneLossPath(lossPathByCapability.get(capability.id)!);
    if (capability.witnesses.length === 0) {
      capabilities.push({ id: capability.id, instrumentation, lossPath, state: 'unmeasured' });
      continue;
    }
    const derivedUnknownEvidence = capabilityScopedUnknownEvidence.get(capability.id)!;
    const configurationLimits = cloneConfigurationLimits(derivedUnknownEvidence.configurationLimits);
    const outcomes = emptyOutcomeCounts();
    const unknownObservations = createCapabilityScopedUnknownObservations(
      capability.id,
      instrumentation,
      lossPath,
      derivedUnknownEvidence.unknownObservations,
    );
    const hasCapabilityScopedUnknown = unknownObservations.length > 0;
    for (const reference of capability.witnesses) {
      const result = resultByReference.get(reference);
      if (result === undefined) throw new Error(`Completed shard has no result for ${reference}`);
      const capabilityOutcome = result.capabilityOutcomes.find((candidate) => candidate.id === capability.id)!;
      if (capabilityOutcome.diagnosticCause === 'unknown') {
        if (!hasCapabilityScopedUnknown) {
          unknownObservations.push({ reason: 'diagnostic-cause-unknown', reference });
        }
        continue;
      }
      const { outcome } = capabilityOutcome;
      if (outcome === 'threw' || outcome === 'importedWrong') {
        outcomes[outcome]++;
        continue;
      }
      if (hasCapabilityScopedUnknown && (outcome === 'passed' || outcome === 'unsupportedClean')) continue;
      if (lossPath.state === 'audited-none') {
        if (outcome !== 'passed') outcomes[outcome]++;
        continue;
      }
      const proofRole =
        outcome === 'unsupportedClean'
          ? capabilityInstrumentationProofs.staysSilent
          : capabilityInstrumentationProofs.fires;
      if (proofRole.length === 0) {
        if (!hasCapabilityScopedUnknown) {
          unknownObservations.push({
            reason:
              outcome === 'unsupportedClean' ? 'silence-proof-missing-for-crumb' : 'fire-proof-missing-for-no-crumb',
            reference,
          });
        }
        continue;
      }
      if (outcome !== 'passed') outcomes[outcome]++;
    }
    const failed = outcomes.threw + outcomes.importedWrong + outcomes.silentlyWrong > 0;
    const fire = createLaneResult(
      failed && !hasCapabilityScopedUnknown,
      unknownObservations.length > 0,
      capabilityInstrumentationProofs.fires,
      lossPath.state !== 'audited-none',
    );
    const silence = createLaneResult(
      failed && !hasCapabilityScopedUnknown,
      unknownObservations.length > 0,
      capabilityInstrumentationProofs.staysSilent,
      lossPath.state !== 'audited-none',
    );
    capabilities.push({
      configurationLimits,
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
    capabilityConventionRevision: index.pack.capabilityConventionRevision,
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
    denominators: cloneDenominators(declarations.denominators),
    diagnosticEvidencePolicy: cloneImportConformanceDiagnosticEvidencePolicy(declarations.diagnosticEvidencePolicy),
    exercised: {
      capabilities: exercised.length,
      fireReferenced: summarizeReferencedCapabilities(fireReferenced, 'fire'),
      silenceReferenced: summarizeReferencedCapabilities(silenceReferenced, 'silence'),
      singleWitnessCapabilities: exercised.filter((capability) => capability.witnesses === 1).length,
    },
    instrumentAudited: {
      payloadCapabilities: measuredCapabilities.filter((capability) =>
        capability.instrumentation.audits.includes('payload'),
      ).length,
      scopeCapabilities: measuredCapabilities.filter((capability) =>
        capability.instrumentation.audits.includes('scope'),
      ).length,
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
    oracleAssurance: createImportConformanceOracleAssurance(),
    packs: [
      {
        ...packBase,
        fixtureOutcomes: createFixtureOutcomes(index, results, declarations.diagnosticEvidencePolicy),
        oracleOutcomes: createOracleOutcomes(results),
        state: 'measured',
        summary,
      },
    ],
    provenance: { ...provenance },
    schemaVersion: 2,
  };
}

export function createImportConformanceShardPlan(
  cases: readonly Readonly<ImportConformanceCaseIdentity>[],
  shardCount: number,
): ImportConformanceShardPlan {
  if (!Number.isSafeInteger(shardCount) || shardCount < 1) throw new Error('Shard count must be a positive integer');
  const identities = cases.map(({ caseHash, reference }) => ({ caseHash, reference })).sort(compareCaseReference);
  assertSortedUnique(
    identities.map((candidate) => candidate.reference),
    'case references',
  );
  assertSortedUnique(identities.map((candidate) => candidate.caseHash).sort(), 'case hashes');
  for (const identity of identities) assertSha256(identity.caseHash, `case ${identity.reference} hash`);
  const assignments = identities.map((identity, index) => ({ ...identity, shardId: index % shardCount }));
  const canonical = assignments
    .map((assignment) => `${assignment.reference}\0${assignment.caseHash}\0${assignment.shardId}`)
    .join('\n');
  return {
    algorithm: 'case-count-v2',
    assignments,
    planHash: hashText(`case-count-v2\0${shardCount}\n${canonical}`),
    shardCount,
  };
}

export function parseImportConformanceCapabilityDefinitions(
  value: unknown,
): readonly ImportConformanceCapabilityDefinition[] {
  if (!isRecord(value) || !Array.isArray(value.capabilities) || value.count !== value.capabilities.length) {
    throw new Error('Invalid import capability artifact root');
  }
  const definitions = value.capabilities.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || typeof candidate.label !== 'string') {
      throw new Error(`Invalid import capability artifact row ${index}`);
    }
    return { id: candidate.id, label: candidate.label };
  });
  assertCapabilityDefinitions(definitions);
  return definitions;
}

function assertCapabilityDefinitions(definitions: readonly Readonly<ImportConformanceCapabilityDefinition>[]): void {
  for (const definition of definitions) {
    if (!/^[a-z0-9]+(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/.test(definition.id) || definition.label === '') {
      throw new Error(`Invalid capability definition ${definition.id}`);
    }
  }
  assertSortedUnique(
    definitions.map((definition) => definition.id),
    'capability ids',
  );
}

function assertCorpusFileCount(corpusFileCount: number, indexedMemberFiles: number): number {
  if (!Number.isSafeInteger(corpusFileCount) || corpusFileCount < indexedMemberFiles) {
    throw new Error('Corpus file count must be an integer no smaller than the indexed member-file count');
  }
  return corpusFileCount;
}

function assertExhaustiveProvenance(provenance: Readonly<ImportConformanceProvenance>): void {
  if (provenance.mode !== 'exhaustive' || provenance.runId.trim() === '' || provenance.runUrl.trim() === '') {
    throw new Error('A score requires the non-empty exhaustive full-index runId and runUrl');
  }
}

function assertPackIdentity(pack: Readonly<ImportConformancePackIdentity>): void {
  if (pack.capabilityConventionRevision === '' || pack.id === '' || pack.release === '' || pack.variant === '') {
    throw new Error('Pack capability convention revision, id, release, and variant must be non-empty');
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
    const audits = capabilityProofs.audits ?? [];
    assertSortedUnique(audits, `instrument audits for ${id}`);
    if (audits.some((audit) => audit !== 'payload' && audit !== 'scope')) {
      throw new Error(`Instrumentation audits for ${id} must name payload or scope`);
    }
    const channel =
      capabilityProofs.channel ??
      (capabilityProofs.fires.length > 0 || capabilityProofs.staysSilent.length > 0 ? 'structured-crumb' : 'none');
    if (
      channel !== 'structured-crumb' &&
      (audits.length > 0 || capabilityProofs.fires.length > 0 || capabilityProofs.staysSilent.length > 0)
    ) {
      throw new Error(`Instrumentation evidence for ${id} requires a structured diagnostic crumb`);
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
    if (lossPath.state === 'unaudited' || lossPath.state === 'unidentified') continue;
    assertLossPathAudit(lossPath.audit, id);
  }
}

function assertLossPathAudit(audit: Readonly<ImportConformanceLossPathAudit>, id: string): void {
  if (audit.auditId.trim() === '' || audit.auditor.trim() === '' || audit.subjectHash.trim() === '') {
    throw new Error(`Loss-path audit for ${id} requires non-empty auditId, auditor, and subjectHash`);
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

function assertScoreDeclarations(
  declarations: Readonly<ImportConformanceScoreDeclarations>,
  instrumentationProofs: ReadonlyMap<string, Readonly<ImportConformanceInstrumentationProofs>>,
  lossPaths: ReadonlyMap<string, Readonly<ImportConformanceLossPath>>,
  index: Readonly<ImportConformanceCapabilityIndex>,
): void {
  assertImportConformanceDenominators(declarations.denominators, index.capabilities.length);
  assertImportConformanceDiagnosticEvidencePolicy(declarations.diagnosticEvidencePolicy);
  const declared = new Set(index.capabilities.map((capability) => capability.id));
  const capabilityScopedUnknownEvidence = new Map(
    deriveImportConformanceCapabilityScopedUnknownEvidence(
      index.capabilities.map((capability) => capability.id),
      declarations.capabilityScopedUnknownMappings,
    ).map((evidence) => [evidence.capabilityId, evidence]),
  );

  for (const id of declared) {
    const proofs = instrumentationProofs.get(id);
    const channel =
      proofs?.channel ??
      (proofs !== undefined && (proofs.fires.length > 0 || proofs.staysSilent.length > 0)
        ? 'structured-crumb'
        : 'none');
    const lossPath = lossPaths.get(id)!;
    const unwiredLosses = capabilityScopedUnknownEvidence
      .get(id)!
      .unknownObservations.filter(
        (observation): observation is ImportConformanceUnwiredLossObservation =>
          observation.reason === 'loss-path-known-not-wired',
      );
    if (unwiredLosses.length > 0 && (lossPath.state !== 'identified' || channel === 'structured-crumb')) {
      throw new Error(`Unwired loss declarations for ${id} require an identified loss path without a structured crumb`);
    }
    if (lossPath.state === 'identified' && channel !== 'structured-crumb' && unwiredLosses.length === 0) {
      throw new Error(`Identified loss path for ${id} without a structured crumb requires its raw unwired family`);
    }
  }
}

function assertPlanMatchesIndex(
  plan: Readonly<ImportConformanceShardPlan>,
  index: Readonly<ImportConformanceCapabilityIndex>,
): void {
  const expected = createImportConformanceShardPlan(index.cases, plan.shardCount);
  if (plan.algorithm !== expected.algorithm || plan.planHash !== expected.planHash) {
    throw new Error('Shard plan does not match the exhaustive capability index');
  }
}

function assertResultMatchesIndex(
  result: Readonly<ImportConformanceResult>,
  index: Readonly<ImportConformanceCapabilityIndex>,
): void {
  const candidate = index.cases.find((indexed) => indexed.reference === result.reference);
  if (candidate === undefined) throw new Error(`Result names unknown case ${result.reference}`);
  if (candidate.caseHash !== result.caseHash) throw new Error(`Result case hash is stale for ${result.reference}`);
  assertImportConformanceOracleOutcomes(result.oracleOutcomes, `result ${result.reference} oracle outcomes`);
  const expectedOutcome = applyImportConformanceOracleOutcomes(result.importOutcome, result.oracleOutcomes);
  if (result.outcome !== expectedOutcome) {
    throw new Error(
      `Result ${result.reference} outcome must equal its import and oracle evidence (${expectedOutcome})`,
    );
  }
  if (candidate.probeState === 'unreadable' && result.probeUnreadableEvidence === undefined) {
    throw new Error(`Probe-unreadable result ${result.reference} must retain its import observation evidence`);
  }
  if (candidate.probeState === 'readable' && result.probeUnreadableEvidence !== undefined) {
    throw new Error(`Probe-readable result ${result.reference} must not carry probe-unreadable evidence`);
  }
  const expected = candidate.capabilities.join('\0');
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

function compareCaseReference(
  a: Readonly<Pick<ImportConformanceCaseIdentity, 'reference'>>,
  b: Readonly<Pick<ImportConformanceCaseIdentity, 'reference'>>,
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

function createImportConformanceOracleAssurance(): ImportConformanceOracleAssurance {
  return {
    firstCaptureDefects: 'detectable-by-declared-oracles',
    formatDerivedProperties: 'first-class-case-outcomes',
    ratchet: 'recorded-run-regression-only',
    unmeasuredCapabilityCause: 'no-fixture-vs-upstream-unreachable-not-distinguished',
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

function cloneDenominators(denominators: Readonly<ImportConformanceDenominators>): ImportConformanceDenominators {
  const producer = denominators.producerDeclared;
  return {
    format: { ...denominators.format },
    producerDeclared:
      producer.state === 'not-applicable'
        ? { ...producer }
        : { ...producer, readings: producer.readings.map((reading) => ({ ...reading })) },
  };
}

function cloneLossPath(lossPath: Readonly<ImportConformanceLossPath>): ImportConformanceLossPath {
  return lossPath.state === 'unaudited' || lossPath.state === 'unidentified'
    ? { state: lossPath.state }
    : { audit: { ...lossPath.audit }, state: lossPath.state };
}

function cloneConfigurationLimits(
  configurationLimits: Readonly<ImportConformanceConfigurationLimits>,
): ImportConformanceConfigurationLimits {
  return configurationLimits.state === 'not-applicable'
    ? { state: 'not-applicable' }
    : {
        limits: configurationLimits.limits.map((limit) => ({ ...limit })) as [
          ImportConformanceConfigurationLimit,
          ...ImportConformanceConfigurationLimit[],
        ],
        state: 'declared',
      };
}

function createOracleOutcomes(results: readonly Readonly<ImportConformanceResult>[]): ImportConformanceOracleOutcomes {
  const populations = { failed: 0, notRun: 0, passed: 0 };
  const cases = results
    .filter((result) => result.oracleOutcomes.length > 0)
    .map((result) => {
      for (const outcome of result.oracleOutcomes) {
        if (outcome.state === 'not-run') populations.notRun++;
        else populations[outcome.state]++;
      }
      return {
        caseHash: result.caseHash,
        outcomes: result.oracleOutcomes.map((outcome) => ({ ...outcome })),
        reference: result.reference,
      };
    })
    .sort(compareCaseReference);
  return { cases, populations };
}

function createFixtureOutcomes(
  index: Readonly<ImportConformanceCapabilityIndex>,
  results: readonly Readonly<ImportConformanceResult>[],
  diagnosticEvidencePolicy: Readonly<ImportConformanceDiagnosticEvidencePolicy>,
): ImportConformanceFixtureOutcomes {
  const resultByReference = new Map(results.map((result) => [result.reference, result]));
  const populations = emptyFixtureOutcomePopulations();
  const silentlyWrongFixtures: string[] = [];
  for (const result of results) {
    populations[result.outcome]++;
    if (result.outcome === 'silentlyWrong') silentlyWrongFixtures.push(result.reference);
  }
  silentlyWrongFixtures.sort();

  const outcomePopulations = emptyFixtureOutcomePopulations();
  const diagnosticExplanationPopulations = {
    absent: 0,
    documentFailureNamed: 0,
    presentWithoutDocumentFailure: 0,
  };
  const fixtures = index.cases
    .filter((candidate) => candidate.probeState === 'unreadable')
    .map((candidate) => {
      const result = resultByReference.get(candidate.reference);
      if (result === undefined) throw new Error(`Measured run has no result for ${candidate.reference}`);
      const evidence = result.probeUnreadableEvidence;
      if (evidence === undefined) {
        throw new Error(`Probe-unreadable result ${candidate.reference} must retain its import observation evidence`);
      }
      const expectedOutcome = classifyRetainedProbeEvidence(evidence, diagnosticEvidencePolicy);
      if (result.outcome !== expectedOutcome) {
        throw new Error(
          `Probe-unreadable result ${candidate.reference} outcome must equal retained evidence (${expectedOutcome})`,
        );
      }
      outcomePopulations[result.outcome]++;
      if (evidence.diagnostics.length === 0) diagnosticExplanationPopulations.absent++;
      else if (evidence.diagnostics.some((diagnostic) => diagnostic.severity === 'Reject')) {
        diagnosticExplanationPopulations.documentFailureNamed++;
      } else diagnosticExplanationPopulations.presentWithoutDocumentFailure++;
      return {
        capabilityOutcomeCount: result.capabilityOutcomes.length,
        diagnostics: evidence.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          ...(diagnostic.detail === undefined ? {} : { detail: { ...diagnostic.detail } }),
        })),
        imported: evidence.imported,
        outcome: result.outcome,
        reference: result.reference,
        threw: evidence.threw,
      };
    });

  return {
    capabilityProbeUnreadable: { diagnosticExplanationPopulations, fixtures, outcomePopulations },
    definitions: IMPORT_CONFORMANCE_FIXTURE_OUTCOME_DEFINITIONS,
    populations,
    silentlyWrongFixtures,
  };
}

function classifyRetainedProbeEvidence(
  evidence: Readonly<NonNullable<ImportConformanceResult['probeUnreadableEvidence']>>,
  diagnosticEvidencePolicy: Readonly<ImportConformanceDiagnosticEvidencePolicy>,
): ImportConformanceFixtureOutcome {
  if (evidence.threw) return 'threw';
  if (
    evidence.diagnostics.some((diagnostic) =>
      diagnosticEvidencePolicy.unsupportedDiagnosticKinds.includes(diagnostic.kind),
    )
  ) {
    return 'unsupportedClean';
  }
  if (
    evidence.diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === 'Drop' || diagnostic.severity === 'Recover' || diagnostic.severity === 'Reject',
    )
  ) {
    return 'importedWrong';
  }
  if (evidence.diagnostics.some((diagnostic) => diagnostic.severity === 'Skip')) return 'unsupportedClean';
  return evidence.imported ? 'passed' : 'silentlyWrong';
}

function emptyFixtureOutcomePopulations(): ImportConformanceFixtureOutcomePopulations {
  return { importedWrong: 0, passed: 0, silentlyWrong: 0, threw: 0, unsupportedClean: 0 };
}

function createCapabilityScopedUnknownObservations(
  capabilityId: string,
  instrumentation: Readonly<ImportConformanceScoreCapabilityExercised['instrumentation']>,
  lossPath: Readonly<ImportConformanceLossPath>,
  derivedObservations: readonly Readonly<ImportConformanceUnknownObservation>[],
): ImportConformanceUnknownObservation[] {
  const observations: ImportConformanceUnknownObservation[] = derivedObservations.map((observation) => ({
    ...observation,
  }));
  if (lossPath.state === 'unaudited') {
    observations.push({ reason: 'loss-path-not-identified', reference: capabilityId });
  } else if (lossPath.state === 'unidentified') {
    observations.push({ reason: 'loss-path-audit-unidentified', reference: capabilityId });
  } else if (
    lossPath.state === 'identified' &&
    instrumentation.channel === 'structured-crumb' &&
    (!instrumentation.audits.includes('payload') || !instrumentation.audits.includes('scope'))
  ) {
    observations.push({ reason: 'instrument-audit-incomplete', reference: capabilityId });
  }
  observations.sort((a, b) => (a.reference < b.reference ? -1 : a.reference > b.reference ? 1 : 0));
  assertSortedUnique(
    observations.map((observation) => observation.reference),
    `capability-scoped UNKNOWN references for ${capabilityId}`,
  );
  return observations;
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
  const unidentifiedAuditCapabilities = capabilities.filter(
    (capability) => capability.lossPath.state === 'unidentified',
  ).length;
  return {
    auditedCapabilities: capabilities.length - unauditedCapabilities - unidentifiedAuditCapabilities,
    auditedNoLossPathCapabilities,
    auditState: unauditedCapabilities === 0 && unidentifiedAuditCapabilities === 0 ? 'complete' : 'partial',
    canSilentlyLoseCapabilities: capabilities.filter((capability) => capability.lossPath.state === 'identified').length,
    unidentifiedAuditCapabilities,
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
    [
      summary.denominators.producerDeclared.declaredRows,
      capabilities.length,
      'denominators.producerDeclared.declaredRows',
    ],
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
      summary.instrumentAudited.payloadCapabilities,
      measured.filter((capability) => capability.instrumentation.audits.includes('payload')).length,
      'instrumentAudited.payloadCapabilities',
    ],
    [
      summary.instrumentAudited.scopeCapabilities,
      measured.filter((capability) => capability.instrumentation.audits.includes('scope')).length,
      'instrumentAudited.scopeCapabilities',
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
