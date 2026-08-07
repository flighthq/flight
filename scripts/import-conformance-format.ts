import type {
  ImportConformanceScore,
  ImportConformanceScoreCapability,
  ImportConformanceScoreCapabilityExercised,
  ImportConformanceScorePackMeasured,
  ImportConformanceUnknownObservation,
} from './import-conformance-core';

export function formatImportConformanceScore(score: Readonly<ImportConformanceScore>): string {
  const assurance = score.instrumentAssurance;
  const oracle = score.oracleAssurance;
  const lines = [
    `instrument-assurance: payload-validity=${assurance.payloadValidity} trigger-correctness=${assurance.triggerCorrectness} trigger-scope=${assurance.triggerScope} trigger-specificity=${assurance.triggerSpecificity}`,
    `oracle-assurance: ratchet=${oracle.ratchet} first-capture-defects=${oracle.firstCaptureDefects} format-derived-properties=${oracle.formatDerivedProperties}`,
  ];
  for (const pack of score.packs) {
    lines.push(`${pack.id} ${pack.release} [${pack.variant}]`);
    if (pack.state === 'not-run') {
      lines.push(`NOT RUN: ${pack.reason ?? 'unspecified'}`);
      continue;
    }
    const { exercised, instrumentAudited, proofReferenced } = pack.summary;
    lines.push(
      `importer-capability-evidence: ${formatExercisedDenominator(pack, oracle)}`,
      `configuration-limits: ${formatConfigurationLimits(pack)}`,
      `loss-path-audit: ${formatLossPathPopulation(pack)}`,
      `diagnostic-channels: ${formatDiagnosticChannels(pack)}`,
      `instrument-payload-audited: ${instrumentAudited.payloadCapabilities} ${formatInstrumentAuditMembers(pack, 'payload')}`,
      `instrument-scope-audited: ${instrumentAudited.scopeCapabilities} ${formatInstrumentAuditMembers(pack, 'scope')}`,
      `fire-proof-referenced-all: ${proofReferenced.fireCapabilities} ${formatProofReferences(pack, 'fires')}`,
      `fire-proof-referenced-and-exercised: ${exercised.fireReferenced.capabilities} ${formatProofReferences(pack, 'fires', true)}`,
      `fire-results: ${formatLaneResults(pack, 'fire')}`,
      `silence-proof-referenced-all: ${proofReferenced.silenceCapabilities} ${formatProofReferences(pack, 'staysSilent')}`,
      `silence-proof-referenced-and-exercised: ${exercised.silenceReferenced.capabilities} ${formatProofReferences(pack, 'staysSilent', true)}`,
      `silence-results: ${formatLaneResults(pack, 'silence')}`,
      `witness-depth: ${exercised.singleWitnessCapabilities} single-witness ${formatSingleWitnessMembers(pack)}`,
      `unknown-observations: ${formatUnknownObservations(pack)}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function formatExercisedDenominator(
  pack: Readonly<ImportConformanceScorePackMeasured>,
  oracle: Readonly<ImportConformanceScore['oracleAssurance']>,
): string {
  const denominator = pack.summary.denominators.importerDeclared;
  const census = denominator.census;
  return `exercised importer-declared capability rows ${pack.summary.exercised.capabilities} ${formatExercisedMembers(pack)}; declared capability row tally ${denominator.declaredRows}; importer-declared capability denominator UNRESOLVED (${denominator.limitation}); provisional census from one artifact cross-check ${census.reference} (${census.falsePositiveHits} false positives in ${census.candidateHits} candidate hits; single author); SWF-format capability denominator UNMEASURED; ratchet honest limit ${oracle.ratchet}: detects regression from a recorded run and cannot see a defect present at first capture; format-derived property oracles ${oracle.formatDerivedProperties}`;
}

function formatLaneResults(pack: Readonly<ImportConformanceScorePackMeasured>, lane: 'fire' | 'silence'): string {
  const instrumentationLane = lane === 'fire' ? 'fires' : 'staysSilent';
  const summary = pack.summary.exercised[lane === 'fire' ? 'fireReferenced' : 'silenceReferenced'];
  const members = pack.capabilities.filter(
    (capability): capability is ImportConformanceScoreCapabilityExercised =>
      capability.state === 'exercised' && capability.instrumentation[instrumentationLane].state === 'referenced',
  );
  const ids = (state: 'fail' | 'pass' | 'unknown'): string =>
    `[${members
      .filter((capability) => capability.results[lane].state === state)
      .map((capability) => capability.id)
      .join(', ')}]`;
  return `pass ${summary.results.passedCapabilities}/${summary.capabilities} ${ids('pass')}, fail ${summary.results.failedCapabilities}/${summary.capabilities} ${ids('fail')}, unknown ${summary.results.unknownCapabilities}/${summary.capabilities} ${ids('unknown')}`;
}

function formatExercisedMembers(pack: Readonly<ImportConformanceScorePackMeasured>): string {
  const exercised = pack.capabilities
    .filter((capability) => capability.state === 'exercised')
    .map((capability) => capability.id);
  return `[exercised: ${exercised.join(', ')}; importer-declared: ${pack.capabilities.map((capability) => capability.id).join(', ')}]`;
}

function formatConfigurationLimits(pack: Readonly<ImportConformanceScorePackMeasured>): string {
  const members = pack.capabilities.flatMap((capability) => {
    if (capability.state !== 'exercised' || capability.configurationLimits.state === 'not-applicable') return [];
    return capability.configurationLimits.limits.map((limit) => `${capability.id}@${limit.id}=${limit.reporting}`);
  });
  return `${members.length} [${members.join(', ')}]`;
}

function formatSingleWitnessMembers(pack: Readonly<ImportConformanceScorePackMeasured>): string {
  const members = pack.capabilities
    .filter((capability) => capability.state === 'exercised' && capability.witnesses === 1)
    .map((capability) => capability.id);
  return `[${members.join(', ')}]`;
}

function formatLossPathPopulation(pack: Readonly<ImportConformanceScorePackMeasured>): string {
  const auditedMembers = pack.capabilities.flatMap((capability) => {
    if (capability.state === 'not-run' || capability.lossPath.state === 'unaudited') return [];
    return [
      `${capability.id}@${capability.lossPath.audit.auditId} by ${capability.lossPath.audit.auditor} at ${capability.lossPath.audit.auditedAt} subject ${capability.lossPath.audit.subjectHash}: ${capability.lossPath.state}`,
    ];
  });
  const unauditedMembers = pack.capabilities
    .filter(
      (capability): capability is Exclude<ImportConformanceScoreCapability, { state: 'not-run' }> =>
        capability.state !== 'not-run' && capability.lossPath.state === 'unaudited',
    )
    .map((capability) => capability.id);
  const summary = pack.summary.lossPathPopulation;
  return `${summary.auditState}; audited ${summary.auditedCapabilities} [${auditedMembers.join(', ')}]; can-silently-lose ${summary.canSilentlyLoseCapabilities}; audited-none ${summary.auditedNoLossPathCapabilities}; unaudited ${summary.unauditedCapabilities} [${unauditedMembers.join(', ')}]`;
}

function formatDiagnosticChannels(pack: Readonly<ImportConformanceScorePackMeasured>): string {
  const lane = (channel: 'human-log-only' | 'none' | 'structured-crumb'): string => {
    const members = pack.capabilities
      .filter((capability) => capability.state !== 'not-run' && capability.instrumentation.channel === channel)
      .map((capability) => capability.id);
    return `${channel} ${members.length} [${members.join(', ')}]`;
  };
  return `${lane('structured-crumb')}; ${lane('human-log-only')}; ${lane('none')}`;
}

function formatInstrumentAuditMembers(
  pack: Readonly<ImportConformanceScorePackMeasured>,
  audit: 'payload' | 'scope',
): string {
  const members = pack.capabilities
    .filter((capability) => capability.state !== 'not-run' && capability.instrumentation.audits.includes(audit))
    .map((capability) => capability.id);
  return `[${members.join(', ')}]`;
}

function formatProofReferences(
  pack: Readonly<ImportConformanceScorePackMeasured>,
  lane: 'fires' | 'staysSilent',
  exercisedOnly = false,
): string {
  const members = pack.capabilities.flatMap((capability) => {
    if (capability.state === 'not-run' || (exercisedOnly && capability.state !== 'exercised')) return [];
    const instrumentation = capability.instrumentation[lane];
    return instrumentation.state === 'referenced' ? [`${capability.id} [${instrumentation.proofs.join(', ')}]`] : [];
  });
  return `[${members.join('; ')}]`;
}

function formatUnknownObservations(pack: Readonly<ImportConformanceScorePackMeasured>): string {
  const observations = pack.capabilities
    .filter((capability): capability is ImportConformanceScoreCapabilityExercised => capability.state === 'exercised')
    .flatMap((capability) =>
      capability.unknownObservations.map((observation) => ({ capabilityId: capability.id, ...observation })),
    );
  const lane = (reason: ImportConformanceUnknownObservation['reason']): string => {
    const members = observations
      .filter((observation) => observation.reason === reason)
      .map((observation) => {
        const scope = isCapabilityScopedUnknownReason(observation.reason) ? 'capability-scoped' : 'file-scoped';
        const fidelity =
          observation.reason === 'loss-path-known-not-wired' ? ` content-fidelity=${observation.contentFidelity}` : '';
        return `${observation.capabilityId}@${observation.reference} (${scope}${fidelity})`;
      });
    return `${members.length} [${members.join(', ')}]`;
  };
  return `configuration-limit ${lane('loop-bounded-configuration-limit')}, cause-unknown ${lane('diagnostic-cause-unknown')}, instrument-audit-incomplete ${lane('instrument-audit-incomplete')}, known-unwired ${lane('loss-path-known-not-wired')}, loss-path-unidentified ${lane('loss-path-not-identified')}, no-fire ${lane('fire-proof-missing-for-no-crumb')}, no-silence ${lane('silence-proof-missing-for-crumb')}`;
}

function isCapabilityScopedUnknownReason(reason: ImportConformanceUnknownObservation['reason']): boolean {
  return (
    reason === 'instrument-audit-incomplete' ||
    reason === 'loop-bounded-configuration-limit' ||
    reason === 'loss-path-known-not-wired' ||
    reason === 'loss-path-not-identified'
  );
}
