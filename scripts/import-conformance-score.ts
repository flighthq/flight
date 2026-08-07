export interface ImportConformanceOutcomeCounts {
  importedWrong: number;
  silentlyWrong: number;
  threw: number;
  unsupportedClean: number;
}

export type ImportConformanceUnknownObservationReason =
  | 'diagnostic-cause-unknown'
  | 'fire-proof-missing-for-no-crumb'
  | 'instrument-audit-incomplete'
  | 'loop-bounded-configuration-limit'
  | 'loss-path-audit-unidentified'
  | 'loss-path-known-not-wired'
  | 'loss-path-not-identified'
  | 'silence-proof-missing-for-crumb';

/** Ordered by the check defeated (existence, count, content), never by severity or user harm. */
export type ImportConformanceContentFidelity = 'diminished' | 'missing' | 'substituted';

export interface ImportConformanceUnwiredLossObservation {
  contentFidelity: ImportConformanceContentFidelity;
  reason: 'loss-path-known-not-wired';
  reference: string;
}

export interface ImportConformanceOtherUnknownObservation {
  reason: Exclude<ImportConformanceUnknownObservationReason, 'loss-path-known-not-wired'>;
  reference: string;
}

export type ImportConformanceUnknownObservation =
  | ImportConformanceOtherUnknownObservation
  | ImportConformanceUnwiredLossObservation;

export interface ImportConformanceReferencedInstrumentation {
  /**
   * Declared test references. This parser proves only that the field contains nonempty, sorted, unique strings;
   * producer-side resolution can additionally prove that each reference names a real test. Neither check can
   * establish that the test assertions validate the recorded payload or exhaust the capability's loss paths.
   * A proof identifier certifies that the producer asserted something, not that the assertion was the right one.
   */
  proofs: [string, ...string[]];
  state: 'referenced';
}

export interface ImportConformanceUnreferencedInstrumentation {
  state: 'unreferenced';
}

export type ImportConformanceInstrumentation =
  | ImportConformanceReferencedInstrumentation
  | ImportConformanceUnreferencedInstrumentation;

export type ImportConformanceInstrumentAudit = 'payload' | 'scope';

export type ImportConformanceDiagnosticChannel = 'human-log-only' | 'none' | 'structured-crumb';

export interface ImportConformanceLaneResult {
  state: 'fail' | 'pass' | 'unknown';
}

export interface ImportConformanceConfigurationLimit {
  /** Repeated on every affected capability row when one importer limit governs more than one capability. */
  id: string;
  /** Structured reporting can distinguish this limit from a successful complete import, or it cannot. */
  reporting: 'structured' | 'unobservable';
}

export interface ImportConformanceConfigurationLimitCapabilityMapping {
  /** Provisional capability ids affected by this one canonical producer limit. */
  readonly capabilityIds: readonly [string, ...string[]];
  readonly id: string;
  readonly reporting: ImportConformanceConfigurationLimit['reporting'];
}

export type ImportConformanceConfigurationLimits =
  | {
      limits: [ImportConformanceConfigurationLimit, ...ImportConformanceConfigurationLimit[]];
      state: 'declared';
    }
  | { state: 'not-applicable' };

export interface ImportConformanceUnwiredLossFamilyCapabilityMapping {
  /** Provisional capability ids affected by this one audited, unwired loss family. */
  readonly capabilityIds: readonly [string, ...string[]];
  readonly contentFidelity: ImportConformanceContentFidelity;
  /** Stable loss-family reference from the producer's capability-keyed audit artifact. */
  readonly reference: string;
}

export interface ImportConformanceCapabilityScopedUnknownMappings {
  /**
   * The producer's sole capability-scope input. Populate it from declared configuration and the
   * capability-keyed loss audit, never from diagnostic crumbs or source-read exclusion notes.
   */
  readonly configurationLimits: readonly ImportConformanceConfigurationLimitCapabilityMapping[];
  readonly unwiredLossFamilies: readonly ImportConformanceUnwiredLossFamilyCapabilityMapping[];
}

export interface ImportConformanceDerivedCapabilityScopedUnknownEvidence {
  capabilityId: string;
  configurationLimits: ImportConformanceConfigurationLimits;
  /** Non-null means this evidence forces both scored lanes to UNKNOWN. */
  forcedResults: ImportConformanceExercisedCapability['results'] | null;
  unknownObservations: ImportConformanceUnknownObservation[];
}

export interface ImportConformanceLossPathAudit {
  /** Stable audit record; the parser validates structure and time syntax, not the audit's substantive judgment. */
  auditId: string;
  /** Person or independent system that performed the audit. */
  auditor: string;
  /** Canonical UTC instant at which this capability member was audited. */
  auditedAt: string;
  /** Hash of the exact capability subject the audit examined, preventing later members from inheriting it silently. */
  subjectHash: string;
}

export interface ImportConformanceAuditedLossPath {
  audit: ImportConformanceLossPathAudit;
  state: 'audited-none' | 'identified';
}

export interface ImportConformanceUnauditedLossPath {
  /** No loss-path audit declaration covers this capability. */
  state: 'unaudited';
}

export interface ImportConformanceUnidentifiedLossPathAudit {
  /** An audit covered this capability, but its identity, time, auditor, or subject binding could not be recovered. */
  state: 'unidentified';
}

export type ImportConformanceLossPath =
  | ImportConformanceAuditedLossPath
  | ImportConformanceUnauditedLossPath
  | ImportConformanceUnidentifiedLossPathAudit;

export interface ImportConformanceCapabilityWithInstrumentation {
  id: string;
  /**
   * Proof directions stay independent: diagnostic silence is interpretable only with `fires`, while a
   * diagnostic crumb is interpretable only with `staysSilent`. Each unlicensed observation remains keyed
   * in `unknownObservations`; it must never be inferred as passing or collapsed into an aggregate count.
   * A proof reference is a producer claim about a tested case, not parser verification of the test's semantics
   * or recorded payload. Proof presence also does not claim that the case exhausts every way the capability can
   * silently lose information. Payload truth and claim scope remain audit concerns.
   */
  instrumentation: {
    /** Hand-maintained declarations of which external audits reached this exact capability member. */
    audits: ImportConformanceInstrumentAudit[];
    /** A warning log is observable to a person, but only a structured crumb can support scored evidence. */
    channel: ImportConformanceDiagnosticChannel;
    fires: ImportConformanceInstrumentation;
    staysSilent: ImportConformanceInstrumentation;
  };
  lossPath: ImportConformanceLossPath;
}

export interface ImportConformanceExercisedCapability extends ImportConformanceCapabilityWithInstrumentation {
  configurationLimits: ImportConformanceConfigurationLimits;
  outcomes: ImportConformanceOutcomeCounts;
  results: {
    fire: ImportConformanceLaneResult;
    silence: ImportConformanceLaneResult;
  };
  state: 'exercised';
  unknownObservations: ImportConformanceUnknownObservation[];
  witnesses: number;
}

export interface ImportConformanceUnmeasuredCapability extends ImportConformanceCapabilityWithInstrumentation {
  state: 'unmeasured';
}

export type ImportConformanceNotRunCapabilityReason = 'missing-shard' | 'pack-unavailable';

export type ImportConformanceNotRunReason = ImportConformanceNotRunCapabilityReason | 'instrumentation-incomplete';

export interface ImportConformanceNotRunCapability {
  completedWitnesses: number;
  expectedWitnesses: number;
  id: string;
  reason: ImportConformanceNotRunCapabilityReason;
  state: 'not-run';
}

export type ImportConformanceCapability =
  | ImportConformanceExercisedCapability
  | ImportConformanceNotRunCapability
  | ImportConformanceUnmeasuredCapability;

export interface ImportConformanceMeasuredShard {
  id: number;
  state: 'measured';
}

export interface ImportConformanceNotRunShard {
  id: number;
  reason: string;
  state: 'not-run';
}

export type ImportConformanceShard = ImportConformanceMeasuredShard | ImportConformanceNotRunShard;

export interface ImportConformanceSharding {
  algorithm: 'fixture-count-v1';
  planHash: string;
  shards: ImportConformanceShard[];
}

export interface ImportConformanceLaneResultSummary {
  failedCapabilities: number;
  passedCapabilities: number;
  unknownCapabilities: number;
}

export interface ImportConformanceReferencedSummary {
  capabilities: number;
  results: ImportConformanceLaneResultSummary;
}

export interface ImportConformanceExercisedSummary {
  capabilities: number;
  /** Independent reference populations, not progress numerators over all exercised or declared capabilities. */
  fireReferenced: ImportConformanceReferencedSummary;
  silenceReferenced: ImportConformanceReferencedSummary;
  singleWitnessCapabilities: number;
}

export interface ImportConformanceProofReferencedSummary {
  fireCapabilities: number;
  silenceCapabilities: number;
}

export interface ImportConformanceInstrumentAuditedSummary {
  payloadCapabilities: number;
  scopeCapabilities: number;
}

export interface ImportConformanceLossPathPopulationSummary {
  auditedCapabilities: number;
  auditedNoLossPathCapabilities: number;
  auditState: 'complete' | 'partial';
  canSilentlyLoseCapabilities: number;
  unidentifiedAuditCapabilities: number;
  unauditedCapabilities: number;
}

export interface ImportConformanceDenominators {
  importerDeclared: {
    census: {
      basis: 'single-artifact-cross-check';
      candidateHits: number;
      falsePositiveHits: number;
      provenance: 'single-author';
      reference: string;
      state: 'provisional';
    };
    declaredRows: number;
    individuationMargin: {
      behaviorPreservingRefactorRows: number;
      discriminatedSourceRows: number;
      frozenDeclaredRows: number;
      rejectedCircularCandidate: 'corpus-differential-behavior';
      sameDispatchArmRows: number;
      state: 'frozen-no-election';
    };
    limitation: 'individuation-rule-not-operational';
    state: 'unresolved';
  };
  swfFormat: { state: 'unmeasured' };
}

export interface ImportConformanceSummary {
  denominators: ImportConformanceDenominators;
  exercised: ImportConformanceExercisedSummary;
  instrumentAudited: ImportConformanceInstrumentAuditedSummary;
  lossPathPopulation: ImportConformanceLossPathPopulationSummary;
  proofReferenced: ImportConformanceProofReferencedSummary;
}

interface ImportConformancePackIdentity {
  /** Opaque producer-owned stamp; the current unresolved convention uses `unresolved-individuation-v1`. */
  capabilityConventionRevision: string;
  capabilities: ImportConformanceCapability[];
  id: string;
  importerSourceHash: string;
  release: string;
  variant: string;
}

export interface ImportConformanceMeasuredPack extends ImportConformancePackIdentity {
  sharding: ImportConformanceSharding;
  state: 'measured';
  summary: ImportConformanceSummary;
}

export interface ImportConformanceNotRunPack extends ImportConformancePackIdentity {
  outcomes: null;
  reason: ImportConformanceNotRunReason;
  sharding: ImportConformanceSharding | null;
  state: 'not-run';
  summary: null;
}

export type ImportConformancePack = ImportConformanceMeasuredPack | ImportConformanceNotRunPack;

export interface ImportConformanceProvenance {
  mode: 'exhaustive';
  runId: string;
  runUrl: string;
}

export interface ImportConformanceInstrumentAssurance {
  payloadValidity: 'external-audit-required';
  triggerCorrectness: 'proof-reference-presence';
  triggerScope: 'external-audit-required';
  triggerSpecificity: 'proof-reference-presence';
}

export interface ImportConformanceOracleAssurance {
  firstCaptureDefects: 'undetectable';
  formatDerivedProperties: 'required-not-implemented';
  ratchet: 'recorded-run-regression-only';
  unmeasuredCapabilityCause: 'no-fixture-vs-upstream-unreachable-not-distinguished';
}

export interface ImportConformanceScore {
  instrumentAssurance: ImportConformanceInstrumentAssurance;
  oracleAssurance: ImportConformanceOracleAssurance;
  packs: ImportConformancePack[];
  provenance: ImportConformanceProvenance;
  schemaVersion: 1;
}

export function deriveImportConformanceCapabilityScopedUnknownEvidence(
  capabilityIds: readonly string[],
  mappings: Readonly<ImportConformanceCapabilityScopedUnknownMappings>,
): ImportConformanceDerivedCapabilityScopedUnknownEvidence[] {
  const declaredCapabilityIds = capabilityIds.map((id, index) =>
    expectNonemptyString(id, `capabilityScopedUnknown.capabilityIds[${index}]`),
  );
  expectSortedUnique(declaredCapabilityIds, 'capabilityScopedUnknown.capabilityIds', 'capability id');
  const declaredCapabilityIdSet = new Set(declaredCapabilityIds);
  const configurationLimits = mappings.configurationLimits.map((mapping, index) => {
    const path = `capabilityScopedUnknown.configurationLimits[${index}]`;
    const id = expectNonemptyString(mapping.id, `${path}.id`);
    if (mapping.reporting !== 'structured' && mapping.reporting !== 'unobservable') {
      fail(`${path}.reporting`, "must be 'structured' or 'unobservable'");
    }
    return {
      capabilityIds: parseMappedCapabilityIds(mapping.capabilityIds, declaredCapabilityIdSet, `${path}.capabilityIds`),
      id,
      reporting: mapping.reporting,
    };
  });
  expectSortedUnique(
    configurationLimits.map((limit) => limit.id),
    'capabilityScopedUnknown.configurationLimits',
    'configuration limit id',
  );
  const unwiredLossFamilies = mappings.unwiredLossFamilies.map((mapping, index) => {
    const path = `capabilityScopedUnknown.unwiredLossFamilies[${index}]`;
    if (
      mapping.contentFidelity !== 'diminished' &&
      mapping.contentFidelity !== 'missing' &&
      mapping.contentFidelity !== 'substituted'
    ) {
      fail(`${path}.contentFidelity`, "must be 'diminished', 'missing', or 'substituted'");
    }
    return {
      capabilityIds: parseMappedCapabilityIds(mapping.capabilityIds, declaredCapabilityIdSet, `${path}.capabilityIds`),
      contentFidelity: mapping.contentFidelity,
      reference: expectNonemptyString(mapping.reference, `${path}.reference`),
    };
  });
  expectSortedUnique(
    unwiredLossFamilies.map((family) => family.reference),
    'capabilityScopedUnknown.unwiredLossFamilies',
    'unwired loss-family reference',
  );

  return declaredCapabilityIds.map((capabilityId) => {
    const limits = configurationLimits
      .filter((limit) => limit.capabilityIds.includes(capabilityId))
      .map(({ id, reporting }) => ({ id, reporting }));
    const unknownObservations: ImportConformanceUnknownObservation[] = [
      ...limits.flatMap((limit): ImportConformanceUnknownObservation[] =>
        limit.reporting === 'unobservable' ? [{ reason: 'loop-bounded-configuration-limit', reference: limit.id }] : [],
      ),
      ...unwiredLossFamilies.flatMap((family): ImportConformanceUnknownObservation[] =>
        family.capabilityIds.includes(capabilityId)
          ? [
              {
                contentFidelity: family.contentFidelity,
                reason: 'loss-path-known-not-wired',
                reference: family.reference,
              },
            ]
          : [],
      ),
    ].sort((left, right) => (left.reference < right.reference ? -1 : left.reference > right.reference ? 1 : 0));
    expectSortedUnique(
      unknownObservations.map((observation) => observation.reference),
      `capabilityScopedUnknown.${capabilityId}.unknownObservations`,
      'observation reference',
    );
    return {
      capabilityId,
      configurationLimits:
        limits.length === 0
          ? { state: 'not-applicable' }
          : {
              limits: limits as [ImportConformanceConfigurationLimit, ...ImportConformanceConfigurationLimit[]],
              state: 'declared',
            },
      forcedResults:
        unknownObservations.length === 0 ? null : { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
      unknownObservations,
    };
  });
}

export function parseImportConformanceScore(value: unknown, source = 'score'): ImportConformanceScore {
  const root = expectRecord(value, source);
  expectKeys(root, ['instrumentAssurance', 'oracleAssurance', 'packs', 'provenance', 'schemaVersion'], source);
  if (root.schemaVersion !== 1) fail(`${source}.schemaVersion`, 'must be exactly 1');
  if (!Array.isArray(root.packs)) fail(`${source}.packs`, 'must be an array');

  const packs = root.packs.map((pack, index) => parsePack(pack, `${source}.packs[${index}]`));
  expectSortedUnique(
    packs.map((pack) => pack.id),
    `${source}.packs`,
    'pack id',
  );
  return {
    instrumentAssurance: parseInstrumentAssurance(root.instrumentAssurance, `${source}.instrumentAssurance`),
    oracleAssurance: parseOracleAssurance(root.oracleAssurance, `${source}.oracleAssurance`),
    packs,
    provenance: parseProvenance(root.provenance, `${source}.provenance`),
    schemaVersion: 1,
  };
}

function parseOracleAssurance(value: unknown, path: string): ImportConformanceOracleAssurance {
  const assurance = expectRecord(value, path);
  expectKeys(
    assurance,
    ['firstCaptureDefects', 'formatDerivedProperties', 'ratchet', 'unmeasuredCapabilityCause'],
    path,
  );
  if (assurance.firstCaptureDefects !== 'undetectable') {
    fail(`${path}.firstCaptureDefects`, "must be exactly 'undetectable'");
  }
  if (assurance.formatDerivedProperties !== 'required-not-implemented') {
    fail(`${path}.formatDerivedProperties`, "must be exactly 'required-not-implemented'");
  }
  if (assurance.ratchet !== 'recorded-run-regression-only') {
    fail(`${path}.ratchet`, "must be exactly 'recorded-run-regression-only'");
  }
  if (assurance.unmeasuredCapabilityCause !== 'no-fixture-vs-upstream-unreachable-not-distinguished') {
    fail(`${path}.unmeasuredCapabilityCause`, "must be exactly 'no-fixture-vs-upstream-unreachable-not-distinguished'");
  }
  return {
    firstCaptureDefects: assurance.firstCaptureDefects,
    formatDerivedProperties: assurance.formatDerivedProperties,
    ratchet: assurance.ratchet,
    unmeasuredCapabilityCause: assurance.unmeasuredCapabilityCause,
  };
}

function parseInstrumentAssurance(value: unknown, path: string): ImportConformanceInstrumentAssurance {
  const assurance = expectRecord(value, path);
  expectKeys(assurance, ['payloadValidity', 'triggerCorrectness', 'triggerScope', 'triggerSpecificity'], path);
  if (assurance.payloadValidity !== 'external-audit-required') {
    fail(`${path}.payloadValidity`, "must be exactly 'external-audit-required'");
  }
  if (assurance.triggerCorrectness !== 'proof-reference-presence') {
    fail(`${path}.triggerCorrectness`, "must be exactly 'proof-reference-presence'");
  }
  if (assurance.triggerScope !== 'external-audit-required') {
    fail(`${path}.triggerScope`, "must be exactly 'external-audit-required'");
  }
  if (assurance.triggerSpecificity !== 'proof-reference-presence') {
    fail(`${path}.triggerSpecificity`, "must be exactly 'proof-reference-presence'");
  }
  return {
    payloadValidity: 'external-audit-required',
    triggerCorrectness: 'proof-reference-presence',
    triggerScope: 'external-audit-required',
    triggerSpecificity: 'proof-reference-presence',
  };
}

function parseProvenance(value: unknown, path: string): ImportConformanceProvenance {
  const provenance = expectRecord(value, path);
  expectKeys(provenance, ['mode', 'runId', 'runUrl'], path);
  if (provenance.mode !== 'exhaustive') fail(`${path}.mode`, "must be exactly 'exhaustive'");
  return {
    mode: 'exhaustive',
    runId: expectNonemptyString(provenance.runId, `${path}.runId`),
    runUrl: expectNonemptyString(provenance.runUrl, `${path}.runUrl`),
  };
}

function parsePack(value: unknown, path: string): ImportConformancePack {
  const pack = expectRecord(value, path);
  const state = expectString(pack.state, `${path}.state`);
  const commonKeys = [
    'capabilities',
    'capabilityConventionRevision',
    'id',
    'importerSourceHash',
    'release',
    'sharding',
    'state',
    'summary',
    'variant',
  ];
  if (state === 'measured') {
    expectKeys(pack, commonKeys, path);
  } else if (state === 'not-run') {
    expectKeys(pack, [...commonKeys, 'outcomes', 'reason'], path);
  } else {
    fail(`${path}.state`, "must be 'measured' or 'not-run'");
  }

  const capabilities = parseCapabilities(pack.capabilities, `${path}.capabilities`);
  if (capabilities.length === 0) fail(`${path}.capabilities`, 'must retain at least one stable capability id');
  const identity = {
    capabilityConventionRevision: expectNonemptyString(
      pack.capabilityConventionRevision,
      `${path}.capabilityConventionRevision`,
    ),
    capabilities,
    id: expectNonemptyString(pack.id, `${path}.id`),
    importerSourceHash: expectNonemptyString(pack.importerSourceHash, `${path}.importerSourceHash`),
    release: expectNonemptyString(pack.release, `${path}.release`),
    variant: expectNonemptyString(pack.variant, `${path}.variant`),
  };

  if (state === 'measured') {
    if (capabilities.some((capability) => capability.state === 'not-run')) {
      fail(`${path}.capabilities`, "a measured pack cannot contain a 'not-run' capability");
    }
    const sharding = parseSharding(pack.sharding, `${path}.sharding`);
    if (sharding.shards.some((shard) => shard.state === 'not-run')) {
      fail(`${path}.sharding.shards`, "a measured pack cannot contain a 'not-run' shard");
    }
    const summary = parseSummary(pack.summary, `${path}.summary`);
    assertSummaryMatches(summary, capabilities, `${path}.summary`);
    return {
      ...identity,
      sharding,
      state,
      summary,
    };
  }

  if (pack.outcomes !== null) fail(`${path}.outcomes`, "must be null when the pack is 'not-run'");
  if (pack.summary !== null) fail(`${path}.summary`, "must be null when the pack is 'not-run'");
  const reason = parseNotRunReason(pack.reason, `${path}.reason`);
  const sharding = pack.sharding === null ? null : parseSharding(pack.sharding, `${path}.sharding`);
  assertNotRunPack(reason, capabilities, sharding, path);
  return { ...identity, outcomes: null, reason, sharding, state, summary: null };
}

function parseCapabilities(value: unknown, path: string): ImportConformanceCapability[] {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  const capabilities = value.map((capability, index) => parseCapability(capability, `${path}[${index}]`));
  expectSortedUnique(
    capabilities.map((capability) => capability.id),
    path,
    'capability id',
  );
  return capabilities;
}

function parseCapability(value: unknown, path: string): ImportConformanceCapability {
  const capability = expectRecord(value, path);
  const state = expectString(capability.state, `${path}.state`);
  const id = expectNonemptyString(capability.id, `${path}.id`);
  if (state === 'unmeasured') {
    expectKeys(capability, ['id', 'instrumentation', 'lossPath', 'state'], path);
    const instrumentation = parseInstrumentation(capability.instrumentation, `${path}.instrumentation`);
    const lossPath = parseLossPath(capability.lossPath, `${path}.lossPath`);
    assertLossPathMatchesInstrumentation(lossPath, instrumentation, [], path);
    return { id, instrumentation, lossPath, state };
  }
  if (state === 'exercised') {
    expectKeys(
      capability,
      [
        'configurationLimits',
        'id',
        'instrumentation',
        'lossPath',
        'outcomes',
        'results',
        'state',
        'unknownObservations',
        'witnesses',
      ],
      path,
    );
    const witnesses = expectInteger(capability.witnesses, `${path}.witnesses`, 1);
    const instrumentation = parseInstrumentation(capability.instrumentation, `${path}.instrumentation`);
    const lossPath = parseLossPath(capability.lossPath, `${path}.lossPath`);
    const configurationLimits = parseConfigurationLimits(capability.configurationLimits, `${path}.configurationLimits`);
    const outcomes = parseOutcomes(capability.outcomes, `${path}.outcomes`);
    const unknownObservations = parseUnknownObservations(capability.unknownObservations, `${path}.unknownObservations`);
    const results = parseLaneResults(capability.results, `${path}.results`);
    assertObservationsAreLicensed(
      configurationLimits,
      lossPath,
      instrumentation,
      outcomes,
      results,
      unknownObservations,
      witnesses,
      path,
    );
    return {
      configurationLimits,
      id,
      instrumentation,
      lossPath,
      outcomes,
      results,
      state,
      unknownObservations,
      witnesses,
    };
  }
  if (state === 'not-run') {
    expectKeys(capability, ['completedWitnesses', 'expectedWitnesses', 'id', 'reason', 'state'], path);
    const completedWitnesses = expectInteger(capability.completedWitnesses, `${path}.completedWitnesses`, 0);
    const expectedWitnesses = expectInteger(capability.expectedWitnesses, `${path}.expectedWitnesses`, 0);
    if (completedWitnesses > expectedWitnesses) {
      fail(`${path}.completedWitnesses`, 'cannot exceed expectedWitnesses');
    }
    return {
      completedWitnesses,
      expectedWitnesses,
      id,
      reason: parseNotRunCapabilityReason(capability.reason, `${path}.reason`),
      state,
    };
  }
  return fail(`${path}.state`, "must be 'exercised', 'unmeasured', or 'not-run'");
}

function parseConfigurationLimits(value: unknown, path: string): ImportConformanceConfigurationLimits {
  const limits = expectRecord(value, path);
  const state = expectString(limits.state, `${path}.state`);
  if (state === 'not-applicable') {
    expectKeys(limits, ['state'], path);
    return { state };
  }
  if (state !== 'declared') return fail(`${path}.state`, "must be 'declared' or 'not-applicable'");
  expectKeys(limits, ['limits', 'state'], path);
  if (!Array.isArray(limits.limits) || limits.limits.length === 0) {
    fail(`${path}.limits`, 'must be a non-empty array');
  }
  const declared = limits.limits.map((entry, index) => {
    const limit = expectRecord(entry, `${path}.limits[${index}]`);
    expectKeys(limit, ['id', 'reporting'], `${path}.limits[${index}]`);
    const reporting = expectString(limit.reporting, `${path}.limits[${index}].reporting`);
    if (reporting !== 'structured' && reporting !== 'unobservable') {
      fail(`${path}.limits[${index}].reporting`, "must be 'structured' or 'unobservable'");
    }
    return { id: expectNonemptyString(limit.id, `${path}.limits[${index}].id`), reporting };
  });
  expectSortedUnique(
    declared.map((limit) => limit.id),
    `${path}.limits`,
    'configuration limit id',
  );
  return {
    limits: declared as [ImportConformanceConfigurationLimit, ...ImportConformanceConfigurationLimit[]],
    state,
  };
}

function parseOutcomes(value: unknown, path: string): ImportConformanceOutcomeCounts {
  const outcomes = expectRecord(value, path);
  expectKeys(outcomes, ['importedWrong', 'silentlyWrong', 'threw', 'unsupportedClean'], path);
  return {
    importedWrong: expectInteger(outcomes.importedWrong, `${path}.importedWrong`, 0),
    silentlyWrong: expectInteger(outcomes.silentlyWrong, `${path}.silentlyWrong`, 0),
    threw: expectInteger(outcomes.threw, `${path}.threw`, 0),
    unsupportedClean: expectInteger(outcomes.unsupportedClean, `${path}.unsupportedClean`, 0),
  };
}

function parseInstrumentation(
  value: unknown,
  path: string,
): ImportConformanceCapabilityWithInstrumentation['instrumentation'] {
  const instrumentation = expectRecord(value, path);
  expectKeys(instrumentation, ['audits', 'channel', 'fires', 'staysSilent'], path);
  return {
    audits: parseInstrumentAudits(instrumentation.audits, `${path}.audits`),
    channel: parseDiagnosticChannel(instrumentation.channel, `${path}.channel`),
    fires: parseInstrumentationState(instrumentation.fires, `${path}.fires`),
    staysSilent: parseInstrumentationState(instrumentation.staysSilent, `${path}.staysSilent`),
  };
}

function parseDiagnosticChannel(value: unknown, path: string): ImportConformanceDiagnosticChannel {
  if (value !== 'human-log-only' && value !== 'none' && value !== 'structured-crumb') {
    fail(path, "must be 'human-log-only', 'none', or 'structured-crumb'");
  }
  return value;
}

function parseInstrumentAudits(value: unknown, path: string): ImportConformanceInstrumentAudit[] {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  const audits = value.map((audit, index) => {
    if (audit !== 'payload' && audit !== 'scope') {
      fail(`${path}[${index}]`, "must be 'payload' or 'scope'");
    }
    return audit;
  });
  expectSortedUnique(audits, path, 'instrument audit');
  return audits;
}

function parseLossPath(value: unknown, path: string): ImportConformanceLossPath {
  const lossPath = expectRecord(value, path);
  const state = expectString(lossPath.state, `${path}.state`);
  if (state === 'unaudited' || state === 'unidentified') {
    expectKeys(lossPath, ['state'], path);
    return { state };
  }
  if (state !== 'audited-none' && state !== 'identified') {
    return fail(`${path}.state`, "must be 'audited-none', 'identified', 'unaudited', or 'unidentified'");
  }
  expectKeys(lossPath, ['audit', 'state'], path);
  return { audit: parseLossPathAudit(lossPath.audit, `${path}.audit`), state };
}

function parseLossPathAudit(value: unknown, path: string): ImportConformanceLossPathAudit {
  const audit = expectRecord(value, path);
  expectKeys(audit, ['auditId', 'auditedAt', 'auditor', 'subjectHash'], path);
  const auditedAt = expectNonemptyString(audit.auditedAt, `${path}.auditedAt`);
  const timestamp = Date.parse(auditedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(auditedAt) ||
    Number.isNaN(timestamp) ||
    new Date(timestamp).toISOString() !== auditedAt
  ) {
    fail(`${path}.auditedAt`, 'must be a canonical UTC instant with millisecond precision');
  }
  return {
    auditId: expectNonemptyString(audit.auditId, `${path}.auditId`),
    auditedAt,
    auditor: expectNonemptyString(audit.auditor, `${path}.auditor`),
    subjectHash: expectNonemptyString(audit.subjectHash, `${path}.subjectHash`),
  };
}

function parseInstrumentationState(value: unknown, path: string): ImportConformanceInstrumentation {
  const instrumentation = expectRecord(value, path);
  const state = expectString(instrumentation.state, `${path}.state`);
  if (state === 'unreferenced') {
    expectKeys(instrumentation, ['state'], path);
    return { state };
  }
  if (state === 'referenced') {
    expectKeys(instrumentation, ['proofs', 'state'], path);
    return { proofs: parseInstrumentationProofIds(instrumentation.proofs, `${path}.proofs`), state };
  }
  return fail(`${path}.state`, "must be 'referenced' or 'unreferenced'");
}

function parseInstrumentationProofIds(value: unknown, path: string): [string, ...string[]] {
  if (!Array.isArray(value) || value.length === 0) fail(path, 'must be a non-empty array');
  const proofs = value.map((proof, index) => expectNonemptyString(proof, `${path}[${index}]`));
  expectSortedUnique(proofs, path, 'instrumentation proof id');
  return proofs as [string, ...string[]];
}

function parseLaneResults(value: unknown, path: string): ImportConformanceExercisedCapability['results'] {
  const results = expectRecord(value, path);
  expectKeys(results, ['fire', 'silence'], path);
  return {
    fire: parseLaneResult(results.fire, `${path}.fire`),
    silence: parseLaneResult(results.silence, `${path}.silence`),
  };
}

function parseLaneResult(value: unknown, path: string): ImportConformanceLaneResult {
  const result = expectRecord(value, path);
  expectKeys(result, ['state'], path);
  const state = expectString(result.state, `${path}.state`);
  if (state !== 'fail' && state !== 'pass' && state !== 'unknown') {
    fail(`${path}.state`, "must be 'fail', 'pass', or 'unknown'");
  }
  return { state };
}

function parseUnknownObservations(value: unknown, path: string): ImportConformanceUnknownObservation[] {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  const observations: ImportConformanceUnknownObservation[] = value.map((entry, index) => {
    const observation = expectRecord(entry, `${path}[${index}]`);
    const reason = parseUnknownObservationReason(observation.reason, `${path}[${index}].reason`);
    const reference = expectNonemptyString(observation.reference, `${path}[${index}].reference`);
    if (reason === 'loss-path-known-not-wired') {
      expectKeys(observation, ['contentFidelity', 'reason', 'reference'], `${path}[${index}]`);
      const contentFidelity = expectString(observation.contentFidelity, `${path}[${index}].contentFidelity`);
      if (contentFidelity !== 'diminished' && contentFidelity !== 'missing' && contentFidelity !== 'substituted') {
        fail(`${path}[${index}].contentFidelity`, "must be 'diminished', 'missing', or 'substituted'");
      }
      return { contentFidelity, reason, reference };
    }
    expectKeys(observation, ['reason', 'reference'], `${path}[${index}]`);
    return {
      reason,
      reference,
    };
  });
  expectSortedUnique(
    observations.map((observation) => observation.reference),
    path,
    'observation reference',
  );
  return observations;
}

function parseUnknownObservationReason(value: unknown, path: string): ImportConformanceUnknownObservationReason {
  if (
    value !== 'diagnostic-cause-unknown' &&
    value !== 'fire-proof-missing-for-no-crumb' &&
    value !== 'instrument-audit-incomplete' &&
    value !== 'loop-bounded-configuration-limit' &&
    value !== 'loss-path-audit-unidentified' &&
    value !== 'loss-path-known-not-wired' &&
    value !== 'loss-path-not-identified' &&
    value !== 'silence-proof-missing-for-crumb'
  ) {
    fail(
      path,
      "must be 'diagnostic-cause-unknown', 'fire-proof-missing-for-no-crumb', 'instrument-audit-incomplete', 'loop-bounded-configuration-limit', 'loss-path-audit-unidentified', 'loss-path-known-not-wired', 'loss-path-not-identified', or 'silence-proof-missing-for-crumb'",
    );
  }
  return value;
}

function assertObservationsAreLicensed(
  configurationLimits: Readonly<ImportConformanceConfigurationLimits>,
  lossPath: Readonly<ImportConformanceLossPath>,
  instrumentation: Readonly<ImportConformanceExercisedCapability['instrumentation']>,
  outcomes: Readonly<ImportConformanceOutcomeCounts>,
  results: Readonly<ImportConformanceExercisedCapability['results']>,
  unknownObservations: readonly Readonly<ImportConformanceUnknownObservation>[],
  witnesses: number,
  path: string,
): void {
  assertLossPathMatchesInstrumentation(lossPath, instrumentation, unknownObservations, path);
  assertConfigurationLimitEvidence(configurationLimits, unknownObservations, path);
  if (
    lossPath.state === 'identified' &&
    instrumentation.channel !== 'structured-crumb' &&
    !unknownObservations.some((observation) => observation.reason === 'loss-path-known-not-wired')
  ) {
    fail(
      `${path}.instrumentation.channel`,
      'an exercised identified loss path without a structured crumb requires a keyed loss-path-known-not-wired UNKNOWN observation',
    );
  }
  const capabilityScopedUnknowns = unknownObservations.filter((observation) =>
    isCapabilityScopedUnknownReason(observation.reason),
  );
  const fileScopedUnknowns = unknownObservations.filter(
    (observation) => !isCapabilityScopedUnknownReason(observation.reason),
  );
  const classified =
    outcomes.importedWrong +
    outcomes.silentlyWrong +
    outcomes.threw +
    outcomes.unsupportedClean +
    fileScopedUnknowns.length;
  if (classified > witnesses) {
    fail(`${path}.witnesses`, `cannot be smaller than the ${classified} classified observations`);
  }
  const implicitPasses = capabilityScopedUnknowns.length > 0 ? 0 : witnesses - classified;
  if (capabilityScopedUnknowns.length > 0 && outcomes.unsupportedClean > 0) {
    fail(`${path}.outcomes.unsupportedClean`, 'cannot be classified while the whole capability is UNKNOWN');
  }
  const instrumentAuditIncomplete =
    lossPath.state !== 'audited-none' &&
    (!instrumentation.audits.includes('payload') || !instrumentation.audits.includes('scope'));
  if (instrumentAuditIncomplete && (implicitPasses > 0 || outcomes.unsupportedClean > 0)) {
    fail(
      `${path}.outcomes`,
      'otherwise-clean and unsupported observations require both member audit declarations or keyed instrument-audit-incomplete observations',
    );
  }
  if (
    lossPath.state !== 'audited-none' &&
    instrumentation.fires.state === 'unreferenced' &&
    (implicitPasses > 0 || outcomes.silentlyWrong > 0)
  ) {
    fail(`${path}.outcomes`, 'no-crumb pass or silently-wrong outcomes require referenced firing instrumentation');
  }
  if (
    lossPath.state !== 'audited-none' &&
    instrumentation.staysSilent.state === 'unreferenced' &&
    outcomes.unsupportedClean > 0
  ) {
    fail(`${path}.outcomes.unsupportedClean`, 'requires referenced silence instrumentation');
  }
  for (let index = 0; index < unknownObservations.length; index++) {
    const observation = unknownObservations[index];
    if (
      (observation.reason === 'loss-path-known-not-wired' || observation.reason === 'loss-path-not-identified') &&
      (instrumentation.fires.state === 'referenced' || instrumentation.staysSilent.state === 'referenced')
    ) {
      fail(
        `${path}.unknownObservations[${index}].reason`,
        'requires both instrumentation directions to be unreferenced',
      );
    }
    if (observation.reason === 'loss-path-known-not-wired' && instrumentation.channel === 'structured-crumb') {
      fail(
        `${path}.unknownObservations[${index}].reason`,
        "cannot be used when instrumentation channel is 'structured-crumb'",
      );
    }
    if (
      observation.reason === 'instrument-audit-incomplete' &&
      instrumentation.audits.includes('payload') &&
      instrumentation.audits.includes('scope')
    ) {
      fail(
        `${path}.unknownObservations[${index}].reason`,
        'cannot be used when both member audit declarations are present',
      );
    }
    if (observation.reason === 'fire-proof-missing-for-no-crumb' && instrumentation.fires.state === 'referenced') {
      fail(`${path}.unknownObservations[${index}].reason`, 'cannot be used with referenced firing instrumentation');
    }
    if (
      observation.reason === 'silence-proof-missing-for-crumb' &&
      instrumentation.staysSilent.state === 'referenced'
    ) {
      fail(`${path}.unknownObservations[${index}].reason`, 'cannot be used with referenced silence instrumentation');
    }
  }

  const hasDefect = outcomes.threw + outcomes.importedWrong + outcomes.silentlyWrong > 0;
  const hasUnknown = unknownObservations.length > 0;
  const expectedFire =
    capabilityScopedUnknowns.length > 0
      ? 'unknown'
      : hasDefect
        ? 'fail'
        : hasUnknown || (lossPath.state !== 'audited-none' && instrumentation.fires.state === 'unreferenced')
          ? 'unknown'
          : 'pass';
  const expectedSilence =
    capabilityScopedUnknowns.length > 0
      ? 'unknown'
      : hasDefect
        ? 'fail'
        : hasUnknown || (lossPath.state !== 'audited-none' && instrumentation.staysSilent.state === 'unreferenced')
          ? 'unknown'
          : 'pass';
  if (results.fire.state !== expectedFire) {
    fail(`${path}.results.fire.state`, `must equal the licensed observations ('${expectedFire}')`);
  }
  if (results.silence.state !== expectedSilence) {
    fail(`${path}.results.silence.state`, `must equal the licensed observations ('${expectedSilence}')`);
  }
}

function assertConfigurationLimitEvidence(
  configurationLimits: Readonly<ImportConformanceConfigurationLimits>,
  unknownObservations: readonly Readonly<ImportConformanceUnknownObservation>[],
  path: string,
): void {
  const unobservableIds =
    configurationLimits.state === 'declared'
      ? configurationLimits.limits.filter((limit) => limit.reporting === 'unobservable').map((limit) => limit.id)
      : [];
  const loopBoundedReferences = unknownObservations
    .filter((observation) => observation.reason === 'loop-bounded-configuration-limit')
    .map((observation) => observation.reference);
  if (
    unobservableIds.length !== loopBoundedReferences.length ||
    unobservableIds.some((id, index) => id !== loopBoundedReferences[index])
  ) {
    fail(
      `${path}.configurationLimits`,
      'unobservable limit ids must exactly match the capability-scoped loop-bounded-configuration-limit UNKNOWN references',
    );
  }
}

function isCapabilityScopedUnknownReason(reason: ImportConformanceUnknownObservationReason): boolean {
  return (
    reason === 'instrument-audit-incomplete' ||
    reason === 'loop-bounded-configuration-limit' ||
    reason === 'loss-path-audit-unidentified' ||
    reason === 'loss-path-known-not-wired' ||
    reason === 'loss-path-not-identified'
  );
}

function assertLossPathMatchesInstrumentation(
  lossPath: Readonly<ImportConformanceLossPath>,
  instrumentation: Readonly<ImportConformanceCapabilityWithInstrumentation['instrumentation']>,
  unknownObservations: readonly Readonly<ImportConformanceUnknownObservation>[],
  path: string,
): void {
  const hasStructuredEvidence =
    instrumentation.audits.length > 0 ||
    instrumentation.fires.state === 'referenced' ||
    instrumentation.staysSilent.state === 'referenced';
  if (instrumentation.channel !== 'structured-crumb' && hasStructuredEvidence) {
    fail(`${path}.instrumentation`, 'proof references and instrument audits require a structured diagnostic crumb');
  }
  if (lossPath.state !== 'identified' && hasStructuredEvidence) {
    fail(`${path}.instrumentation`, 'proof references and instrument audits require a positively identified loss path');
  }
  for (let index = 0; index < unknownObservations.length; index++) {
    const reason = unknownObservations[index].reason;
    if (reason === 'loss-path-not-identified' && lossPath.state !== 'unaudited') {
      fail(`${path}.unknownObservations[${index}].reason`, "requires lossPath state 'unaudited'");
    }
    if (reason === 'loss-path-audit-unidentified' && lossPath.state !== 'unidentified') {
      fail(`${path}.unknownObservations[${index}].reason`, "requires lossPath state 'unidentified'");
    }
    if (
      reason !== 'loss-path-not-identified' &&
      reason !== 'loss-path-audit-unidentified' &&
      reason !== 'loop-bounded-configuration-limit' &&
      lossPath.state !== 'identified'
    ) {
      fail(`${path}.unknownObservations[${index}].reason`, "requires lossPath state 'identified'");
    }
  }
}

function parseSharding(value: unknown, path: string): ImportConformanceSharding {
  const sharding = expectRecord(value, path);
  expectKeys(sharding, ['algorithm', 'planHash', 'shards'], path);
  if (sharding.algorithm !== 'fixture-count-v1') {
    fail(`${path}.algorithm`, "must be exactly 'fixture-count-v1'");
  }
  if (!Array.isArray(sharding.shards)) fail(`${path}.shards`, 'must be an array');
  if (sharding.shards.length === 0) fail(`${path}.shards`, 'must retain the complete non-empty shard plan');
  const shards = sharding.shards.map((shard, index) => parseShard(shard, `${path}.shards[${index}]`));
  expectSortedUnique(
    shards.map((shard) => shard.id),
    `${path}.shards`,
    'shard id',
  );
  return {
    algorithm: 'fixture-count-v1',
    planHash: expectNonemptyString(sharding.planHash, `${path}.planHash`),
    shards,
  };
}

function parseShard(value: unknown, path: string): ImportConformanceShard {
  const shard = expectRecord(value, path);
  const id = expectInteger(shard.id, `${path}.id`, 0);
  const state = expectString(shard.state, `${path}.state`);
  if (state === 'measured') {
    expectKeys(shard, ['id', 'state'], path);
    return { id, state };
  }
  if (state === 'not-run') {
    expectKeys(shard, ['id', 'reason', 'state'], path);
    return { id, reason: expectNonemptyString(shard.reason, `${path}.reason`), state };
  }
  return fail(`${path}.state`, "must be 'measured' or 'not-run'");
}

function parseSummary(value: unknown, path: string): ImportConformanceSummary {
  const summary = expectRecord(value, path);
  expectKeys(
    summary,
    ['denominators', 'exercised', 'instrumentAudited', 'lossPathPopulation', 'proofReferenced'],
    path,
  );
  const denominators = parseDenominators(summary.denominators, `${path}.denominators`);
  const exercised = expectRecord(summary.exercised, `${path}.exercised`);
  expectKeys(
    exercised,
    ['capabilities', 'fireReferenced', 'silenceReferenced', 'singleWitnessCapabilities'],
    `${path}.exercised`,
  );
  const proofReferenced = expectRecord(summary.proofReferenced, `${path}.proofReferenced`);
  expectKeys(proofReferenced, ['fireCapabilities', 'silenceCapabilities'], `${path}.proofReferenced`);
  const instrumentAudited = expectRecord(summary.instrumentAudited, `${path}.instrumentAudited`);
  expectKeys(instrumentAudited, ['payloadCapabilities', 'scopeCapabilities'], `${path}.instrumentAudited`);
  const lossPathPopulation = expectRecord(summary.lossPathPopulation, `${path}.lossPathPopulation`);
  expectKeys(
    lossPathPopulation,
    [
      'auditedCapabilities',
      'auditedNoLossPathCapabilities',
      'auditState',
      'canSilentlyLoseCapabilities',
      'unidentifiedAuditCapabilities',
      'unauditedCapabilities',
    ],
    `${path}.lossPathPopulation`,
  );
  const auditState = expectString(lossPathPopulation.auditState, `${path}.lossPathPopulation.auditState`);
  if (auditState !== 'complete' && auditState !== 'partial') {
    fail(`${path}.lossPathPopulation.auditState`, "must be 'complete' or 'partial'");
  }
  return {
    denominators,
    exercised: {
      capabilities: expectInteger(exercised.capabilities, `${path}.exercised.capabilities`, 0),
      fireReferenced: parseReferencedSummary(exercised.fireReferenced, `${path}.exercised.fireReferenced`),
      silenceReferenced: parseReferencedSummary(exercised.silenceReferenced, `${path}.exercised.silenceReferenced`),
      singleWitnessCapabilities: expectInteger(
        exercised.singleWitnessCapabilities,
        `${path}.exercised.singleWitnessCapabilities`,
        0,
      ),
    },
    instrumentAudited: {
      payloadCapabilities: expectInteger(
        instrumentAudited.payloadCapabilities,
        `${path}.instrumentAudited.payloadCapabilities`,
        0,
      ),
      scopeCapabilities: expectInteger(
        instrumentAudited.scopeCapabilities,
        `${path}.instrumentAudited.scopeCapabilities`,
        0,
      ),
    },
    lossPathPopulation: {
      auditedCapabilities: expectInteger(
        lossPathPopulation.auditedCapabilities,
        `${path}.lossPathPopulation.auditedCapabilities`,
        0,
      ),
      auditedNoLossPathCapabilities: expectInteger(
        lossPathPopulation.auditedNoLossPathCapabilities,
        `${path}.lossPathPopulation.auditedNoLossPathCapabilities`,
        0,
      ),
      auditState,
      canSilentlyLoseCapabilities: expectInteger(
        lossPathPopulation.canSilentlyLoseCapabilities,
        `${path}.lossPathPopulation.canSilentlyLoseCapabilities`,
        0,
      ),
      unidentifiedAuditCapabilities: expectInteger(
        lossPathPopulation.unidentifiedAuditCapabilities,
        `${path}.lossPathPopulation.unidentifiedAuditCapabilities`,
        0,
      ),
      unauditedCapabilities: expectInteger(
        lossPathPopulation.unauditedCapabilities,
        `${path}.lossPathPopulation.unauditedCapabilities`,
        0,
      ),
    },
    proofReferenced: {
      fireCapabilities: expectInteger(proofReferenced.fireCapabilities, `${path}.proofReferenced.fireCapabilities`, 0),
      silenceCapabilities: expectInteger(
        proofReferenced.silenceCapabilities,
        `${path}.proofReferenced.silenceCapabilities`,
        0,
      ),
    },
  };
}

function parseDenominators(value: unknown, path: string): ImportConformanceDenominators {
  const denominators = expectRecord(value, path);
  expectKeys(denominators, ['importerDeclared', 'swfFormat'], path);
  const importerDeclared = expectRecord(denominators.importerDeclared, `${path}.importerDeclared`);
  expectKeys(
    importerDeclared,
    ['census', 'declaredRows', 'individuationMargin', 'limitation', 'state'],
    `${path}.importerDeclared`,
  );
  if (importerDeclared.limitation !== 'individuation-rule-not-operational') {
    fail(`${path}.importerDeclared.limitation`, "must be exactly 'individuation-rule-not-operational'");
  }
  if (importerDeclared.state !== 'unresolved') {
    fail(`${path}.importerDeclared.state`, "must be exactly 'unresolved'");
  }
  const census = expectRecord(importerDeclared.census, `${path}.importerDeclared.census`);
  expectKeys(
    census,
    ['basis', 'candidateHits', 'falsePositiveHits', 'provenance', 'reference', 'state'],
    `${path}.importerDeclared.census`,
  );
  if (census.basis !== 'single-artifact-cross-check') {
    fail(`${path}.importerDeclared.census.basis`, "must be exactly 'single-artifact-cross-check'");
  }
  if (census.provenance !== 'single-author') {
    fail(`${path}.importerDeclared.census.provenance`, "must be exactly 'single-author'");
  }
  if (census.state !== 'provisional') {
    fail(`${path}.importerDeclared.census.state`, "must be exactly 'provisional'");
  }
  const candidateHits = expectInteger(census.candidateHits, `${path}.importerDeclared.census.candidateHits`, 0);
  const falsePositiveHits = expectInteger(
    census.falsePositiveHits,
    `${path}.importerDeclared.census.falsePositiveHits`,
    0,
  );
  if (falsePositiveHits > candidateHits) {
    fail(`${path}.importerDeclared.census.falsePositiveHits`, 'cannot exceed candidateHits');
  }
  const declaredRows = expectInteger(importerDeclared.declaredRows, `${path}.importerDeclared.declaredRows`, 0);
  const individuationMargin = parseIndividuationMargin(
    importerDeclared.individuationMargin,
    `${path}.importerDeclared.individuationMargin`,
  );
  if (individuationMargin.frozenDeclaredRows !== declaredRows) {
    fail(
      `${path}.importerDeclared.individuationMargin.frozenDeclaredRows`,
      `must equal declaredRows (${declaredRows})`,
    );
  }
  const swfFormat = expectRecord(denominators.swfFormat, `${path}.swfFormat`);
  expectKeys(swfFormat, ['state'], `${path}.swfFormat`);
  if (swfFormat.state !== 'unmeasured') {
    fail(`${path}.swfFormat.state`, "must be exactly 'unmeasured'");
  }
  return {
    importerDeclared: {
      census: {
        basis: census.basis,
        candidateHits,
        falsePositiveHits,
        provenance: census.provenance,
        reference: expectNonemptyString(census.reference, `${path}.importerDeclared.census.reference`),
        state: census.state,
      },
      declaredRows,
      individuationMargin,
      limitation: importerDeclared.limitation,
      state: importerDeclared.state,
    },
    swfFormat: { state: swfFormat.state },
  };
}

function parseIndividuationMargin(
  value: unknown,
  path: string,
): ImportConformanceDenominators['importerDeclared']['individuationMargin'] {
  const margin = expectRecord(value, path);
  expectKeys(
    margin,
    [
      'behaviorPreservingRefactorRows',
      'discriminatedSourceRows',
      'frozenDeclaredRows',
      'rejectedCircularCandidate',
      'sameDispatchArmRows',
      'state',
    ],
    path,
  );
  if (margin.rejectedCircularCandidate !== 'corpus-differential-behavior') {
    fail(`${path}.rejectedCircularCandidate`, "must be exactly 'corpus-differential-behavior'");
  }
  if (margin.state !== 'frozen-no-election') {
    fail(`${path}.state`, "must be exactly 'frozen-no-election'");
  }
  return {
    behaviorPreservingRefactorRows: expectInteger(
      margin.behaviorPreservingRefactorRows,
      `${path}.behaviorPreservingRefactorRows`,
      0,
    ),
    discriminatedSourceRows: expectInteger(margin.discriminatedSourceRows, `${path}.discriminatedSourceRows`, 0),
    frozenDeclaredRows: expectInteger(margin.frozenDeclaredRows, `${path}.frozenDeclaredRows`, 0),
    rejectedCircularCandidate: margin.rejectedCircularCandidate,
    sameDispatchArmRows: expectInteger(margin.sameDispatchArmRows, `${path}.sameDispatchArmRows`, 0),
    state: margin.state,
  };
}

function parseReferencedSummary(value: unknown, path: string): ImportConformanceReferencedSummary {
  const summary = expectRecord(value, path);
  expectKeys(summary, ['capabilities', 'results'], path);
  const results = expectRecord(summary.results, `${path}.results`);
  expectKeys(results, ['failedCapabilities', 'passedCapabilities', 'unknownCapabilities'], `${path}.results`);
  return {
    capabilities: expectInteger(summary.capabilities, `${path}.capabilities`, 0),
    results: {
      failedCapabilities: expectInteger(results.failedCapabilities, `${path}.results.failedCapabilities`, 0),
      passedCapabilities: expectInteger(results.passedCapabilities, `${path}.results.passedCapabilities`, 0),
      unknownCapabilities: expectInteger(results.unknownCapabilities, `${path}.results.unknownCapabilities`, 0),
    },
  };
}

function assertSummaryMatches(
  summary: Readonly<ImportConformanceSummary>,
  capabilities: readonly Readonly<ImportConformanceCapability>[],
  path: string,
): void {
  const exercised = capabilities.filter(
    (capability): capability is ImportConformanceExercisedCapability => capability.state === 'exercised',
  );
  const proofReferenced = capabilities.filter(
    (capability): capability is ImportConformanceExercisedCapability | ImportConformanceUnmeasuredCapability =>
      capability.state !== 'not-run',
  );
  const canSilentlyLose = proofReferenced.filter((capability) => capability.lossPath.state === 'identified');
  const auditedNoLossPath = proofReferenced.filter((capability) => capability.lossPath.state === 'audited-none');
  const unidentifiedAudit = proofReferenced.filter((capability) => capability.lossPath.state === 'unidentified');
  const unaudited = proofReferenced.filter((capability) => capability.lossPath.state === 'unaudited');
  const fireReferenced = exercised.filter((capability) => capability.instrumentation.fires.state === 'referenced');
  const silenceReferenced = exercised.filter(
    (capability) => capability.instrumentation.staysSilent.state === 'referenced',
  );
  const expected: ImportConformanceSummary = {
    denominators: {
      ...summary.denominators,
      importerDeclared: {
        ...summary.denominators.importerDeclared,
        declaredRows: capabilities.length,
      },
    },
    exercised: {
      capabilities: exercised.length,
      fireReferenced: summarizeReferenced(fireReferenced, 'fire'),
      silenceReferenced: summarizeReferenced(silenceReferenced, 'silence'),
      singleWitnessCapabilities: exercised.filter((capability) => capability.witnesses === 1).length,
    },
    instrumentAudited: {
      payloadCapabilities: proofReferenced.filter((capability) => capability.instrumentation.audits.includes('payload'))
        .length,
      scopeCapabilities: proofReferenced.filter((capability) => capability.instrumentation.audits.includes('scope'))
        .length,
    },
    lossPathPopulation: {
      auditedCapabilities: canSilentlyLose.length + auditedNoLossPath.length,
      auditedNoLossPathCapabilities: auditedNoLossPath.length,
      auditState: unaudited.length === 0 && unidentifiedAudit.length === 0 ? 'complete' : 'partial',
      canSilentlyLoseCapabilities: canSilentlyLose.length,
      unidentifiedAuditCapabilities: unidentifiedAudit.length,
      unauditedCapabilities: unaudited.length,
    },
    proofReferenced: {
      fireCapabilities: proofReferenced.filter((capability) => capability.instrumentation.fires.state === 'referenced')
        .length,
      silenceCapabilities: proofReferenced.filter(
        (capability) => capability.instrumentation.staysSilent.state === 'referenced',
      ).length,
    },
  };
  assertSummaryNumber(
    summary.denominators.importerDeclared.declaredRows,
    expected.denominators.importerDeclared.declaredRows,
    `${path}.denominators.importerDeclared.declaredRows`,
  );
  assertSummaryNumber(
    summary.exercised.capabilities,
    expected.exercised.capabilities,
    `${path}.exercised.capabilities`,
  );
  assertReferencedSummary(
    summary.exercised.fireReferenced,
    expected.exercised.fireReferenced,
    `${path}.exercised.fireReferenced`,
  );
  assertReferencedSummary(
    summary.exercised.silenceReferenced,
    expected.exercised.silenceReferenced,
    `${path}.exercised.silenceReferenced`,
  );
  assertSummaryNumber(
    summary.exercised.singleWitnessCapabilities,
    expected.exercised.singleWitnessCapabilities,
    `${path}.exercised.singleWitnessCapabilities`,
  );
  assertSummaryNumber(
    summary.instrumentAudited.payloadCapabilities,
    expected.instrumentAudited.payloadCapabilities,
    `${path}.instrumentAudited.payloadCapabilities`,
  );
  assertSummaryNumber(
    summary.instrumentAudited.scopeCapabilities,
    expected.instrumentAudited.scopeCapabilities,
    `${path}.instrumentAudited.scopeCapabilities`,
  );
  assertSummaryNumber(
    summary.lossPathPopulation.auditedCapabilities,
    expected.lossPathPopulation.auditedCapabilities,
    `${path}.lossPathPopulation.auditedCapabilities`,
  );
  assertSummaryNumber(
    summary.lossPathPopulation.auditedNoLossPathCapabilities,
    expected.lossPathPopulation.auditedNoLossPathCapabilities,
    `${path}.lossPathPopulation.auditedNoLossPathCapabilities`,
  );
  if (summary.lossPathPopulation.auditState !== expected.lossPathPopulation.auditState) {
    fail(
      `${path}.lossPathPopulation.auditState`,
      `must equal the capability rows ('${expected.lossPathPopulation.auditState}')`,
    );
  }
  assertSummaryNumber(
    summary.lossPathPopulation.canSilentlyLoseCapabilities,
    expected.lossPathPopulation.canSilentlyLoseCapabilities,
    `${path}.lossPathPopulation.canSilentlyLoseCapabilities`,
  );
  assertSummaryNumber(
    summary.lossPathPopulation.unidentifiedAuditCapabilities,
    expected.lossPathPopulation.unidentifiedAuditCapabilities,
    `${path}.lossPathPopulation.unidentifiedAuditCapabilities`,
  );
  assertSummaryNumber(
    summary.lossPathPopulation.unauditedCapabilities,
    expected.lossPathPopulation.unauditedCapabilities,
    `${path}.lossPathPopulation.unauditedCapabilities`,
  );
  assertSummaryNumber(
    summary.proofReferenced.fireCapabilities,
    expected.proofReferenced.fireCapabilities,
    `${path}.proofReferenced.fireCapabilities`,
  );
  assertSummaryNumber(
    summary.proofReferenced.silenceCapabilities,
    expected.proofReferenced.silenceCapabilities,
    `${path}.proofReferenced.silenceCapabilities`,
  );
}

function summarizeReferenced(
  capabilities: readonly Readonly<ImportConformanceExercisedCapability>[],
  lane: keyof ImportConformanceExercisedCapability['results'],
): ImportConformanceReferencedSummary {
  return {
    capabilities: capabilities.length,
    results: {
      failedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'fail').length,
      passedCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'pass').length,
      unknownCapabilities: capabilities.filter((capability) => capability.results[lane].state === 'unknown').length,
    },
  };
}

function assertReferencedSummary(
  actual: Readonly<ImportConformanceReferencedSummary>,
  expected: Readonly<ImportConformanceReferencedSummary>,
  path: string,
): void {
  assertSummaryNumber(actual.capabilities, expected.capabilities, `${path}.capabilities`);
  assertSummaryNumber(
    actual.results.failedCapabilities,
    expected.results.failedCapabilities,
    `${path}.results.failedCapabilities`,
  );
  assertSummaryNumber(
    actual.results.passedCapabilities,
    expected.results.passedCapabilities,
    `${path}.results.passedCapabilities`,
  );
  assertSummaryNumber(
    actual.results.unknownCapabilities,
    expected.results.unknownCapabilities,
    `${path}.results.unknownCapabilities`,
  );
}

function assertSummaryNumber(actual: number, expected: number, path: string): void {
  if (actual !== expected) fail(path, `must equal the capability rows (${expected})`);
}

function assertNotRunPack(
  reason: ImportConformanceNotRunReason,
  capabilities: readonly Readonly<ImportConformanceCapability>[],
  sharding: Readonly<ImportConformanceSharding> | null,
  path: string,
): void {
  if (reason === 'pack-unavailable') {
    if (capabilities.some((capability) => capability.state !== 'not-run' || capability.reason !== reason)) {
      fail(
        `${path}.capabilities`,
        "a pack-unavailable pack must retain every capability as pack-unavailable 'not-run'",
      );
    }
    if (sharding?.shards.some((shard) => shard.state !== 'not-run')) {
      fail(`${path}.sharding.shards`, 'a pack-unavailable pack cannot contain a measured shard');
    }
    return;
  }

  if (reason === 'instrumentation-incomplete') {
    if (sharding === null) {
      fail(`${path}.sharding`, 'an instrumentation-incomplete pack must retain its complete shard plan');
    }
    if (sharding.shards.some((shard) => shard.state !== 'measured')) {
      fail(`${path}.sharding.shards`, 'an instrumentation-incomplete pack cannot contain a not-run shard');
    }
    if (capabilities.some((capability) => capability.state === 'not-run')) {
      fail(`${path}.capabilities`, 'an instrumentation-incomplete pack cannot contain a not-run capability');
    }
    if (
      capabilities.every(
        (capability) =>
          capability.state !== 'exercised' ||
          (capability.unknownObservations.length === 0 &&
            (capability.lossPath.state === 'audited-none' ||
              (capability.instrumentation.audits.includes('payload') &&
                capability.instrumentation.audits.includes('scope') &&
                capability.instrumentation.fires.state === 'referenced' &&
                capability.instrumentation.staysSilent.state === 'referenced'))),
      )
    ) {
      fail(`${path}.capabilities`, 'an instrumentation-incomplete pack must contain unlicensed observations');
    }
    return;
  }

  if (sharding === null) fail(`${path}.sharding`, 'a missing-shard pack must retain its complete shard plan');
  if (sharding.shards.every((shard) => shard.state === 'measured')) {
    fail(`${path}.sharding.shards`, "a missing-shard pack must contain at least one 'not-run' shard");
  }
  const notRunCapabilities = capabilities.filter(
    (capability): capability is ImportConformanceNotRunCapability => capability.state === 'not-run',
  );
  if (notRunCapabilities.length === 0) {
    fail(`${path}.capabilities`, "a missing-shard pack must contain at least one 'not-run' capability");
  }
  for (const capability of notRunCapabilities) {
    if (capability.reason !== reason) {
      fail(`${path}.capabilities`, "a missing-shard pack can only contain missing-shard 'not-run' capabilities");
    }
    if (capability.completedWitnesses >= capability.expectedWitnesses) {
      fail(
        `${path}.capabilities`,
        'a missing-shard capability must have fewer completed witnesses than expected witnesses',
      );
    }
  }
}

function parseNotRunReason(value: unknown, path: string): ImportConformanceNotRunReason {
  if (value !== 'instrumentation-incomplete' && value !== 'missing-shard' && value !== 'pack-unavailable') {
    fail(path, "must be 'instrumentation-incomplete', 'missing-shard', or 'pack-unavailable'");
  }
  return value;
}

function parseNotRunCapabilityReason(value: unknown, path: string): ImportConformanceNotRunCapabilityReason {
  if (value !== 'missing-shard' && value !== 'pack-unavailable') {
    fail(path, "must be 'missing-shard' or 'pack-unavailable'");
  }
  return value;
}

function parseMappedCapabilityIds(value: unknown, declaredCapabilityIds: ReadonlySet<string>, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) fail(path, 'must be a non-empty array');
  const capabilityIds = value.map((id, index) => expectNonemptyString(id, `${path}[${index}]`));
  expectSortedUnique(capabilityIds, path, 'capability id');
  for (const capabilityId of capabilityIds) {
    if (!declaredCapabilityIds.has(capabilityId)) {
      fail(path, `references undeclared capability id '${capabilityId}'`);
    }
  }
  return capabilityIds;
}

function expectInteger(value: unknown, path: string, minimum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    fail(path, `must be an integer greater than or equal to ${minimum}`);
  }
  return value as number;
}

function expectKeys(record: Readonly<Record<string, unknown>>, expected: readonly string[], path: string): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(path, `must contain exactly: ${wanted.join(', ')}`);
  }
}

function expectNonemptyString(value: unknown, path: string): string {
  const string = expectString(value, path);
  if (string.trim() === '') fail(path, 'must be non-empty');
  return string;
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  return value as Record<string, unknown>;
}

function expectSortedUnique(values: readonly (number | string)[], path: string, label: string): void {
  for (let index = 1; index < values.length; index++) {
    if (values[index - 1] >= values[index]) {
      fail(path, `${label}s must be unique and sorted in ascending order`);
    }
  }
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'must be a string');
  return value;
}

function fail(path: string, message: string): never {
  throw new Error(`Invalid import-conformance score at ${path}: ${message}`);
}
