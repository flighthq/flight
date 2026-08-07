import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { parseImportConformanceScore } from './import-conformance-score';
import type {
  ImportConformanceCapability,
  ImportConformanceCapabilityWithInstrumentation,
  ImportConformanceExercisedCapability,
  ImportConformanceLaneResult,
  ImportConformanceMeasuredPack,
  ImportConformanceOracleAssurance,
  ImportConformanceScore,
  ImportConformanceUnknownObservation,
} from './import-conformance-score';

export type ImportConformanceRatchetState = 'incomparable' | 'not-run' | 'pass' | 'regression';

export interface ImportConformanceRatchetPolicy {
  unknownBaseline: 'allow' | 'reject';
}

export interface ImportConformanceRatchetFinding {
  capabilityId: string | null;
  code: string;
  detail: string;
}

export interface ImportConformancePackComparison {
  baseline: ImportConformanceMeasuredPack | null;
  current: ImportConformanceMeasuredPack | null;
  findings: ImportConformanceRatchetFinding[];
  id: string;
  state: ImportConformanceRatchetState;
}

export interface ImportConformanceRatchetReport {
  baseline: Readonly<ImportConformanceScore>;
  current: Readonly<ImportConformanceScore>;
  packs: ImportConformancePackComparison[];
  state: ImportConformanceRatchetState;
}

export const IMPORT_CONFORMANCE_BASELINE_PATH = 'scripts/import-conformance-baseline.json';
export const IMPORT_CONFORMANCE_CURRENT_PATH = '.artifacts/import-conformance/score.json';

export function compareImportConformanceScores(
  baseline: Readonly<ImportConformanceScore>,
  current: Readonly<ImportConformanceScore>,
  policy: Readonly<ImportConformanceRatchetPolicy> = { unknownBaseline: 'reject' },
): ImportConformanceRatchetReport {
  const comparisons: ImportConformancePackComparison[] = [];
  const currentById = new Map(current.packs.map((pack) => [pack.id, pack]));

  for (const baselinePack of baseline.packs) {
    const currentPack = currentById.get(baselinePack.id);
    currentById.delete(baselinePack.id);
    if (baselinePack.state !== 'measured') {
      comparisons.push({
        baseline: null,
        current: currentPack?.state === 'measured' ? currentPack : null,
        findings: [finding('baseline-not-measured', 'the baseline pack is not measured and cannot seed a ratchet')],
        id: baselinePack.id,
        state: 'incomparable',
      });
      continue;
    }
    if (policy.unknownBaseline === 'reject' && baselinePack.capabilities.some(hasUnknownEvidence)) {
      comparisons.push({
        baseline: baselinePack,
        current: currentPack?.state === 'measured' ? currentPack : null,
        findings: [
          finding(
            'baseline-contains-unknown',
            'the caller policy rejects a baseline with instrumentation-unknown exercised capabilities',
          ),
        ],
        id: baselinePack.id,
        state: 'incomparable',
      });
      continue;
    }
    if (currentPack === undefined) {
      comparisons.push({
        baseline: baselinePack,
        current: null,
        findings: [finding('missing-pack', 'the baseline pack is absent from the current score; the pack is NOT RUN')],
        id: baselinePack.id,
        state: 'not-run',
      });
      continue;
    }

    const identityFindings = comparePackIdentity(baselinePack, currentPack);
    if (identityFindings.length > 0) {
      comparisons.push({
        baseline: baselinePack,
        current: currentPack.state === 'measured' ? currentPack : null,
        findings: identityFindings,
        id: baselinePack.id,
        state: 'incomparable',
      });
      continue;
    }
    if (currentPack.state === 'not-run') {
      const details = [`the complete pack is NOT RUN (${currentPack.reason}); no score was computed`];
      if (currentPack.reason === 'missing-shard' && currentPack.sharding !== null) {
        const deadShards = currentPack.sharding.shards
          .filter((shard) => shard.state === 'not-run')
          .map((shard) => shard.id)
          .join(', ');
        details.push(`planned shard${deadShards.includes(',') ? 's' : ''} ${deadShards} did not complete`);
      }
      comparisons.push({
        baseline: baselinePack,
        current: null,
        findings: details.map((detail) => finding('pack-not-run', detail)),
        id: baselinePack.id,
        state: 'not-run',
      });
      continue;
    }

    const findings = compareCapabilities(baselinePack.capabilities, currentPack.capabilities);
    comparisons.push({
      baseline: baselinePack,
      current: currentPack,
      findings,
      id: baselinePack.id,
      state: findings.length === 0 ? 'pass' : 'regression',
    });
  }

  for (const currentPack of currentById.values()) {
    comparisons.push({
      baseline: null,
      current: currentPack.state === 'measured' ? currentPack : null,
      findings: [
        finding('new-pack', 'the current score has no baseline for this pack; seed it from a full run before gating'),
      ],
      id: currentPack.id,
      state: 'incomparable',
    });
  }
  comparisons.sort((left, right) => left.id.localeCompare(right.id));

  let state = combineStates(comparisons.map((comparison) => comparison.state));
  if (
    baseline.provenance.runId === current.provenance.runId &&
    baseline.provenance.runUrl === current.provenance.runUrl
  ) {
    state = 'incomparable';
    comparisons.unshift({
      baseline: null,
      current: null,
      findings: [
        finding(
          'reused-run',
          'the current score names the baseline run itself; a fresh exhaustive run was not demonstrated',
        ),
      ],
      id: '(score provenance)',
      state: 'incomparable',
    });
  }
  if (baseline.packs.length === 0) {
    state = 'incomparable';
    comparisons.unshift({
      baseline: null,
      current: null,
      findings: [finding('empty-baseline', 'an empty score cannot seed a ratchet')],
      id: '(baseline)',
      state: 'incomparable',
    });
  }
  return { baseline, current, packs: comparisons, state };
}

export function formatImportConformanceRatchetReport(report: Readonly<ImportConformanceRatchetReport>): string {
  const lines = [
    `${stateMark(report.state)} ${pc.bold('Import conformance ratchet')} ${stateLabel(report.state)}`,
    `  baseline run: ${report.baseline.provenance.runId} (${report.baseline.provenance.runUrl})`,
    `  current run: ${report.current.provenance.runId} (${report.current.provenance.runUrl})`,
    `  instrument assurance observed: trigger correctness ${report.current.instrumentAssurance.triggerCorrectness}; trigger specificity ${report.current.instrumentAssurance.triggerSpecificity}; trigger scope ${report.current.instrumentAssurance.triggerScope}; payload validity ${report.current.instrumentAssurance.payloadValidity}`,
  ];
  for (const pack of report.packs) {
    lines.push('', `  ${stateMark(pack.state)} ${pc.bold(pack.id)} ${stateLabel(pack.state)}`);
    if (pack.baseline !== null && pack.current !== null) {
      lines.push(`    ${formatScoreNumbers(pack.baseline, pack.current, report.current.oracleAssurance)}`);
    } else if (pack.current !== null) {
      lines.push(`    ${formatScoreNumbers(null, pack.current, report.current.oracleAssurance)}`);
    }
    for (const entry of pack.findings) {
      const capability = entry.capabilityId === null ? '' : ` [${entry.capabilityId}]`;
      lines.push(`    - ${entry.code}${capability}: ${entry.detail}`);
    }
  }
  return lines.join('\n');
}

export function getImportConformanceRatchetExitCode(report: Readonly<ImportConformanceRatchetReport>): 0 | 1 | 2 {
  if (report.state === 'pass') return 0;
  if (report.state === 'regression') return 1;
  return 2;
}

export function runImportConformanceRatchet(
  args: readonly string[],
  write: (message: string) => void = console.log,
  writeError: (message: string) => void = console.error,
): 0 | 1 | 2 {
  try {
    const paths = parseArguments(args);
    const baseline = readScore(paths.baseline, 'baseline');
    const current = readScore(paths.current, 'current');
    const report = compareImportConformanceScores(baseline, current, {
      unknownBaseline: paths.allowUnknownBaseline ? 'allow' : 'reject',
    });
    write(formatImportConformanceRatchetReport(report));
    return getImportConformanceRatchetExitCode(report);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    writeError(`${pc.red('✗')} ${pc.bold('Import conformance ratchet')} ${pc.red('INVALID')}\n  ${detail}`);
    return 2;
  }
}

function comparePackIdentity(
  baseline: Readonly<ImportConformanceMeasuredPack>,
  current: Readonly<ImportConformanceScore['packs'][number]>,
): ImportConformanceRatchetFinding[] {
  const findings: ImportConformanceRatchetFinding[] = [];
  if (baseline.release !== current.release) {
    findings.push(
      finding('fixture-release-changed', `fixture release changed from '${baseline.release}' to '${current.release}'`),
    );
  }
  if (baseline.variant !== current.variant) {
    findings.push(
      finding('fixture-variant-changed', `fixture variant changed from '${baseline.variant}' to '${current.variant}'`),
    );
  }
  if (baseline.capabilityConventionRevision !== current.capabilityConventionRevision) {
    findings.push(
      finding(
        'capability-convention-changed',
        `capability convention revision changed from '${baseline.capabilityConventionRevision}' to '${current.capabilityConventionRevision}'`,
      ),
    );
  }
  const baselineCapabilities = baseline.capabilities.map((capability) => capability.id);
  const currentCapabilities = current.capabilities.map((capability) => capability.id);
  if (!sameKeys(baselineCapabilities, currentCapabilities)) {
    findings.push(
      finding(
        'capability-set-changed',
        `capability ids changed from [${baselineCapabilities.join(', ')}] to [${currentCapabilities.join(', ')}]`,
      ),
    );
  }
  if (current.sharding === null) return findings;
  if (baseline.sharding.algorithm !== current.sharding.algorithm) {
    findings.push(
      finding(
        'shard-algorithm-changed',
        `shard algorithm changed from '${baseline.sharding.algorithm}' to '${current.sharding.algorithm}'`,
      ),
    );
  }
  if (baseline.sharding.planHash !== current.sharding.planHash) {
    findings.push(
      finding(
        'shard-plan-changed',
        `deterministic shard plan changed from '${baseline.sharding.planHash}' to '${current.sharding.planHash}'`,
      ),
    );
  }
  const baselineShards = baseline.sharding.shards.map((shard) => shard.id);
  const currentShards = current.sharding.shards.map((shard) => shard.id);
  if (!sameKeys(baselineShards, currentShards)) {
    findings.push(
      finding(
        'shard-set-changed',
        `planned shard ids changed from [${baselineShards.join(', ')}] to [${currentShards.join(', ')}]`,
      ),
    );
  }
  return findings;
}

function compareCapabilities(
  baseline: readonly Readonly<ImportConformanceCapability>[],
  current: readonly Readonly<ImportConformanceCapability>[],
): ImportConformanceRatchetFinding[] {
  const findings: ImportConformanceRatchetFinding[] = [];
  const currentById = new Map(current.map((capability) => [capability.id, capability]));
  for (const baselineCapability of baseline) {
    const currentCapability = currentById.get(baselineCapability.id);
    if (
      currentCapability === undefined ||
      baselineCapability.state === 'not-run' ||
      currentCapability.state === 'not-run'
    ) {
      continue;
    }
    compareInstrumentation(baselineCapability, currentCapability, 'fires', 'firing', baselineCapability.id, findings);
    compareDiagnosticChannel(baselineCapability, currentCapability, findings);
    compareInstrumentation(
      baselineCapability,
      currentCapability,
      'staysSilent',
      'silence',
      baselineCapability.id,
      findings,
    );
    compareLossPath(baselineCapability, currentCapability, findings);
    compareInstrumentAudits(baselineCapability, currentCapability, findings);
    if (baselineCapability.state === 'unmeasured') continue;
    if (currentCapability.state === 'unmeasured') {
      findings.push(
        finding(
          'capability-lost-witnesses',
          `had ${baselineCapability.witnesses} witness${baselineCapability.witnesses === 1 ? '' : 'es'} and is now UNMEASURED`,
          baselineCapability.id,
        ),
      );
      continue;
    }
    compareConfigurationLimits(baselineCapability, currentCapability, findings);
    if (currentCapability.witnesses < baselineCapability.witnesses) {
      findings.push(
        finding(
          'witness-depth-regressed',
          `witness depth fell from ${baselineCapability.witnesses} to ${currentCapability.witnesses}`,
          baselineCapability.id,
        ),
      );
    }
    compareLaneResult(
      baselineCapability.results.fire,
      currentCapability.results.fire,
      'fire',
      baselineCapability.id,
      findings,
    );
    compareLaneResult(
      baselineCapability.results.silence,
      currentCapability.results.silence,
      'silence',
      baselineCapability.id,
      findings,
    );
  }
  return findings;
}

function compareConfigurationLimits(
  baseline: Readonly<ImportConformanceExercisedCapability>,
  current: Readonly<ImportConformanceExercisedCapability>,
  findings: ImportConformanceRatchetFinding[],
): void {
  if (baseline.configurationLimits.state === 'not-applicable') return;
  if (current.configurationLimits.state === 'not-applicable') {
    findings.push(
      finding(
        'configuration-limit-declaration-lost',
        'configuration-limit declarations were present and are now NOT APPLICABLE without a capability identity change',
        baseline.id,
      ),
    );
    return;
  }
  const currentById = new Map(current.configurationLimits.limits.map((limit) => [limit.id, limit]));
  const lostIds = baseline.configurationLimits.limits.map((limit) => limit.id).filter((id) => !currentById.has(id));
  if (lostIds.length > 0) {
    findings.push(
      finding(
        'configuration-limit-set-regressed',
        `configuration-limit declarations were removed: [${lostIds.join(', ')}]`,
        baseline.id,
      ),
    );
  }
  for (const baselineLimit of baseline.configurationLimits.limits) {
    const currentLimit = currentById.get(baselineLimit.id);
    if (baselineLimit.reporting === 'structured' && currentLimit?.reporting === 'unobservable') {
      findings.push(
        finding(
          'configuration-limit-reporting-regressed',
          `${baselineLimit.id} changed from structured reporting to unobservable`,
          baseline.id,
        ),
      );
    }
  }
}

function compareDiagnosticChannel(
  baseline: Readonly<ImportConformanceCapabilityWithInstrumentation>,
  current: Readonly<ImportConformanceCapabilityWithInstrumentation>,
  findings: ImportConformanceRatchetFinding[],
): void {
  if (
    baseline.instrumentation.channel === 'structured-crumb' &&
    current.instrumentation.channel !== 'structured-crumb'
  ) {
    findings.push(
      finding(
        'structured-diagnostic-channel-lost',
        `structured diagnostic crumb changed to ${current.instrumentation.channel}`,
        baseline.id,
      ),
    );
  }
}

function compareInstrumentAudits(
  baseline: Readonly<ImportConformanceCapabilityWithInstrumentation>,
  current: Readonly<ImportConformanceCapabilityWithInstrumentation>,
  findings: ImportConformanceRatchetFinding[],
): void {
  for (const audit of baseline.instrumentation.audits) {
    if (!current.instrumentation.audits.includes(audit)) {
      findings.push(
        finding(
          `instrumentation-${audit}-audit-lost`,
          `${audit} audit declaration was present and is now absent`,
          baseline.id,
        ),
      );
    }
  }
  const gained = current.instrumentation.audits.filter((audit) => !baseline.instrumentation.audits.includes(audit));
  if (
    gained.length > 0 &&
    baseline.lossPath.state !== 'unaudited' &&
    current.lossPath.state !== 'unaudited' &&
    baseline.lossPath.audit.auditId === current.lossPath.audit.auditId &&
    baseline.lossPath.audit.auditedAt === current.lossPath.audit.auditedAt
  ) {
    findings.push(
      finding(
        'instrument-audit-added-without-new-audit',
        `${gained.join(', ')} audit declaration was added while member audit identity and time stayed fixed`,
        baseline.id,
      ),
    );
  }
}

function compareInstrumentation(
  baseline: Readonly<ImportConformanceCapabilityWithInstrumentation>,
  current: Readonly<ImportConformanceCapabilityWithInstrumentation>,
  key: 'fires' | 'staysSilent',
  label: string,
  capabilityId: string,
  findings: ImportConformanceRatchetFinding[],
): void {
  const baselineInstrumentation = baseline.instrumentation[key];
  const currentInstrumentation = current.instrumentation[key];
  if (baselineInstrumentation.state === 'unreferenced') return;
  if (currentInstrumentation.state === 'unreferenced') {
    findings.push(
      finding(
        `instrumentation-${label}-reference-lost`,
        `${label}-test proof references were present and are now UNREFERENCED`,
        capabilityId,
      ),
    );
    return;
  }
  if (!sameKeys(baselineInstrumentation.proofs, currentInstrumentation.proofs)) {
    findings.push(
      finding(
        `instrumentation-${label}-references-changed`,
        `${label}-test proof references changed from [${baselineInstrumentation.proofs.join(', ')}] to [${currentInstrumentation.proofs.join(', ')}]`,
        capabilityId,
      ),
    );
  }
}

function compareLossPath(
  baseline: Readonly<ImportConformanceCapabilityWithInstrumentation>,
  current: Readonly<ImportConformanceCapabilityWithInstrumentation>,
  findings: ImportConformanceRatchetFinding[],
): void {
  if (baseline.lossPath.state === 'unaudited') return;
  if (current.lossPath.state === 'unaudited') {
    findings.push(
      finding(
        'loss-path-audit-lost',
        `loss-path audit changed from ${baseline.lossPath.state.toUpperCase()} to UNAUDITED`,
        baseline.id,
      ),
    );
    return;
  }
  if (baseline.lossPath.state !== current.lossPath.state) {
    findings.push(
      finding(
        'loss-path-classification-changed',
        `loss-path audit changed from ${baseline.lossPath.state.toUpperCase()} to ${current.lossPath.state.toUpperCase()}`,
        baseline.id,
      ),
    );
    return;
  }
  const currentAudit = current.lossPath.audit;
  if (currentAudit.auditedAt < baseline.lossPath.audit.auditedAt) {
    findings.push(
      finding(
        'loss-path-audit-time-regressed',
        `loss-path audit time moved backward from ${baseline.lossPath.audit.auditedAt} to ${currentAudit.auditedAt}`,
        baseline.id,
      ),
    );
  }
  if (
    baseline.lossPath.audit.subjectHash !== currentAudit.subjectHash &&
    baseline.lossPath.audit.auditId === currentAudit.auditId &&
    baseline.lossPath.audit.auditedAt === currentAudit.auditedAt
  ) {
    findings.push(
      finding(
        'loss-path-audit-subject-changed-without-reaudit',
        `loss-path audit subject changed from ${baseline.lossPath.audit.subjectHash} to ${currentAudit.subjectHash} while audit identity and time stayed fixed`,
        baseline.id,
      ),
    );
  }
}

function compareLaneResult(
  baseline: Readonly<ImportConformanceLaneResult>,
  current: Readonly<ImportConformanceLaneResult>,
  lane: string,
  capabilityId: string,
  findings: ImportConformanceRatchetFinding[],
): void {
  if (baseline.state === 'unknown') return;
  if (current.state === 'unknown') {
    findings.push(
      finding(
        `${lane}-result-became-unknown`,
        `${lane} lane changed from ${baseline.state.toUpperCase()} to UNKNOWN because an observation is unlicensed`,
        capabilityId,
      ),
    );
  } else if (baseline.state === 'pass' && current.state === 'fail') {
    findings.push(finding(`${lane}-result-regressed`, `${lane} lane changed from passing to failing`, capabilityId));
  }
}

function hasUnknownEvidence(capability: Readonly<ImportConformanceCapability>): boolean {
  return (
    capability.state === 'exercised' &&
    ((capability.lossPath.state !== 'audited-none' &&
      (!capability.instrumentation.audits.includes('payload') ||
        !capability.instrumentation.audits.includes('scope') ||
        capability.instrumentation.channel !== 'structured-crumb' ||
        capability.instrumentation.fires.state === 'unreferenced' ||
        capability.instrumentation.staysSilent.state === 'unreferenced')) ||
      capability.results.fire.state === 'unknown' ||
      capability.results.silence.state === 'unknown' ||
      capability.unknownObservations.length > 0)
  );
}

function combineStates(states: readonly ImportConformanceRatchetState[]): ImportConformanceRatchetState {
  if (states.includes('incomparable')) return 'incomparable';
  if (states.includes('not-run')) return 'not-run';
  if (states.includes('regression')) return 'regression';
  return 'pass';
}

function finding(code: string, detail: string, capabilityId: string | null = null): ImportConformanceRatchetFinding {
  return { capabilityId, code, detail };
}

function formatScoreNumbers(
  baseline: Readonly<ImportConformanceMeasuredPack> | null,
  current: Readonly<ImportConformanceMeasuredPack>,
  oracleAssurance: Readonly<ImportConformanceOracleAssurance>,
): string {
  const currentSummary = current.summary;
  const currentNumbers = {
    diagnosticChannels: formatDiagnosticChannels(current),
    exercised: formatExercisedDenominator(current, oracleAssurance),
    configurationLimits: formatConfigurationLimits(current),
    fireProofReferenced: `${currentSummary.proofReferenced.fireCapabilities} ${formatProofReferences(current, 'fires')}`,
    fireProofReferencedAndExercised: `${currentSummary.exercised.fireReferenced.capabilities} ${formatProofReferences(current, 'fires', true)}`,
    fireResults: formatLaneResults(current, 'fire'),
    instrumentPayloadAudited: `${currentSummary.instrumentAudited.payloadCapabilities} ${formatInstrumentAuditMembers(current, 'payload')}`,
    instrumentScopeAudited: `${currentSummary.instrumentAudited.scopeCapabilities} ${formatInstrumentAuditMembers(current, 'scope')}`,
    lossPathAudit: formatLossPathPopulation(current),
    silenceProofReferenced: `${currentSummary.proofReferenced.silenceCapabilities} ${formatProofReferences(current, 'staysSilent')}`,
    silenceProofReferencedAndExercised: `${currentSummary.exercised.silenceReferenced.capabilities} ${formatProofReferences(current, 'staysSilent', true)}`,
    silenceResults: formatLaneResults(current, 'silence'),
    singleWitness: `${currentSummary.exercised.singleWitnessCapabilities} ${formatSingleWitnessMembers(current)}`,
    unknownObservations: formatUnknownObservations(current),
  };
  if (baseline === null) {
    return `exercised ${currentNumbers.exercised}; configuration limits ${currentNumbers.configurationLimits}; diagnostic channels ${currentNumbers.diagnosticChannels}; loss-path audit ${currentNumbers.lossPathAudit}; instrument payload-audited ${currentNumbers.instrumentPayloadAudited}; instrument scope-audited ${currentNumbers.instrumentScopeAudited}; fire proof-referenced all ${currentNumbers.fireProofReferenced}; fire proof-referenced and exercised ${currentNumbers.fireProofReferencedAndExercised}; fire results ${currentNumbers.fireResults}; silence proof-referenced all ${currentNumbers.silenceProofReferenced}; silence proof-referenced and exercised ${currentNumbers.silenceProofReferencedAndExercised}; silence results ${currentNumbers.silenceResults}; single-witness ${currentNumbers.singleWitness}; unknown observations ${currentNumbers.unknownObservations}`;
  }
  const baselineSummary = baseline.summary;
  return [
    `exercised ${formatExercisedDenominator(baseline, oracleAssurance)} → ${currentNumbers.exercised}`,
    `configuration limits ${formatConfigurationLimits(baseline)} → ${currentNumbers.configurationLimits}`,
    `diagnostic channels ${formatDiagnosticChannels(baseline)} → ${currentNumbers.diagnosticChannels}`,
    `loss-path audit ${formatLossPathPopulation(baseline)} → ${currentNumbers.lossPathAudit}`,
    `instrument payload-audited ${baselineSummary.instrumentAudited.payloadCapabilities} ${formatInstrumentAuditMembers(baseline, 'payload')} → ${currentNumbers.instrumentPayloadAudited}`,
    `instrument scope-audited ${baselineSummary.instrumentAudited.scopeCapabilities} ${formatInstrumentAuditMembers(baseline, 'scope')} → ${currentNumbers.instrumentScopeAudited}`,
    `fire proof-referenced all ${baselineSummary.proofReferenced.fireCapabilities} ${formatProofReferences(baseline, 'fires')} → ${currentNumbers.fireProofReferenced}`,
    `fire proof-referenced and exercised ${baselineSummary.exercised.fireReferenced.capabilities} ${formatProofReferences(baseline, 'fires', true)} → ${currentNumbers.fireProofReferencedAndExercised}`,
    `fire results ${formatLaneResults(baseline, 'fire')} → ${currentNumbers.fireResults}`,
    `silence proof-referenced all ${baselineSummary.proofReferenced.silenceCapabilities} ${formatProofReferences(baseline, 'staysSilent')} → ${currentNumbers.silenceProofReferenced}`,
    `silence proof-referenced and exercised ${baselineSummary.exercised.silenceReferenced.capabilities} ${formatProofReferences(baseline, 'staysSilent', true)} → ${currentNumbers.silenceProofReferencedAndExercised}`,
    `silence results ${formatLaneResults(baseline, 'silence')} → ${currentNumbers.silenceResults}`,
    `single-witness ${baselineSummary.exercised.singleWitnessCapabilities} ${formatSingleWitnessMembers(baseline)} → ${currentNumbers.singleWitness}`,
    `unknown observations ${formatUnknownObservations(baseline)} → ${currentNumbers.unknownObservations}`,
  ].join('; ');
}

function formatLaneResults(pack: Readonly<ImportConformanceMeasuredPack>, lane: 'fire' | 'silence'): string {
  const instrumentationLane = lane === 'fire' ? 'fires' : 'staysSilent';
  const summary = pack.summary.exercised[lane === 'fire' ? 'fireReferenced' : 'silenceReferenced'];
  const members = pack.capabilities.filter(
    (capability): capability is ImportConformanceExercisedCapability =>
      capability.state === 'exercised' && capability.instrumentation[instrumentationLane].state === 'referenced',
  );
  const ids = (state: ImportConformanceLaneResult['state']): string =>
    `[${members
      .filter((capability) => capability.results[lane].state === state)
      .map((capability) => capability.id)
      .join(', ')}]`;
  return `pass ${summary.results.passedCapabilities}/${summary.capabilities} ${ids('pass')}, fail ${summary.results.failedCapabilities}/${summary.capabilities} ${ids('fail')}, unknown ${summary.results.unknownCapabilities}/${summary.capabilities} ${ids('unknown')}`;
}

function formatExercisedMembers(pack: Readonly<ImportConformanceMeasuredPack>): string {
  const exercised = pack.capabilities
    .filter((capability) => capability.state === 'exercised')
    .map((capability) => capability.id);
  return `[exercised: ${exercised.join(', ')}; importer-declared: ${pack.capabilities.map((capability) => capability.id).join(', ')}]`;
}

function formatExercisedDenominator(
  pack: Readonly<ImportConformanceMeasuredPack>,
  oracleAssurance: Readonly<ImportConformanceOracleAssurance>,
): string {
  const denominator = pack.summary.denominators.importerDeclared;
  const census = denominator.census;
  return `importer-declared capability rows ${pack.summary.exercised.capabilities} ${formatExercisedMembers(pack)}; declared capability row tally ${denominator.declaredRows}; importer-declared capability denominator UNRESOLVED (${denominator.limitation}); provisional census from one artifact cross-check ${census.reference} (${census.falsePositiveHits} false positives in ${census.candidateHits} candidate hits; single author); SWF-format capability denominator UNMEASURED; ratchet honest limit ${oracleAssurance.ratchet}: detects regression from a recorded run and cannot see a defect present at first capture; format-derived property oracles ${oracleAssurance.formatDerivedProperties}`;
}

function formatConfigurationLimits(pack: Readonly<ImportConformanceMeasuredPack>): string {
  const members = pack.capabilities.flatMap((capability) => {
    if (capability.state !== 'exercised') return [];
    if (capability.configurationLimits.state === 'not-applicable') return [`${capability.id}: not-applicable`];
    const limits = capability.configurationLimits.limits.map((limit) => `${limit.id} ${limit.reporting}`);
    return [`${capability.id}: declared [${limits.join('; ')}]`];
  });
  return `[${members.join('; ')}]`;
}

function formatDiagnosticChannels(pack: Readonly<ImportConformanceMeasuredPack>): string {
  const members = pack.capabilities.flatMap((capability) =>
    capability.state === 'not-run' ? [] : [`${capability.id}: ${capability.instrumentation.channel}`],
  );
  return `[${members.join('; ')}]`;
}

function formatSingleWitnessMembers(pack: Readonly<ImportConformanceMeasuredPack>): string {
  const members = pack.capabilities
    .filter((capability) => capability.state === 'exercised' && capability.witnesses === 1)
    .map((capability) => capability.id);
  return `[${members.join(', ')}]`;
}

function formatLossPathPopulation(pack: Readonly<ImportConformanceMeasuredPack>): string {
  const auditedMembers = pack.capabilities.flatMap((capability) => {
    if (capability.state === 'not-run' || capability.lossPath.state === 'unaudited') return [];
    return [
      `${capability.id}@${capability.lossPath.audit.auditId} by ${capability.lossPath.audit.auditor} at ${capability.lossPath.audit.auditedAt} subject ${capability.lossPath.audit.subjectHash}: ${capability.lossPath.state}`,
    ];
  });
  const unauditedMembers = pack.capabilities
    .filter(
      (capability): capability is Extract<ImportConformanceCapability, { state: 'exercised' | 'unmeasured' }> =>
        capability.state !== 'not-run' && capability.lossPath.state === 'unaudited',
    )
    .map((capability) => capability.id);
  const summary = pack.summary.lossPathPopulation;
  return `${summary.auditState}; audited ${summary.auditedCapabilities} [${auditedMembers.join(', ')}]; can-silently-lose ${summary.canSilentlyLoseCapabilities}; audited-none ${summary.auditedNoLossPathCapabilities}; unaudited ${summary.unauditedCapabilities} [${unauditedMembers.join(', ')}]`;
}

function formatProofReferences(
  pack: Readonly<ImportConformanceMeasuredPack>,
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

function formatInstrumentAuditMembers(
  pack: Readonly<ImportConformanceMeasuredPack>,
  audit: 'payload' | 'scope',
): string {
  const members = pack.capabilities.flatMap((capability) => {
    if (capability.state === 'not-run' || !capability.instrumentation.audits.includes(audit)) return [];
    return [capability.id];
  });
  return `[${members.join(', ')}]`;
}

function formatUnknownObservations(pack: Readonly<ImportConformanceMeasuredPack>): string {
  const observations = pack.capabilities
    .filter((capability): capability is ImportConformanceExercisedCapability => capability.state === 'exercised')
    .flatMap((capability) =>
      capability.unknownObservations.map((observation) => ({ capabilityId: capability.id, ...observation })),
    );
  const lane = (reason: ImportConformanceUnknownObservation['reason']): string => {
    const members = observations
      .filter((observation) => observation.reason === reason)
      .map((observation) =>
        observation.reason === 'loss-path-known-not-wired'
          ? `${observation.capabilityId}@${observation.reference}/${observation.contentFidelity}`
          : `${observation.capabilityId}@${observation.reference}`,
      );
    const scope = isCapabilityScopedUnknownReason(reason) ? 'capability-scoped' : 'file-scoped';
    return `${scope} ${members.length} [${members.join(', ')}]`;
  };
  return `loop-bounded-limit ${lane('loop-bounded-configuration-limit')}, cause-unknown ${lane('diagnostic-cause-unknown')}, instrument-audit-incomplete ${lane('instrument-audit-incomplete')}, known-unwired ${lane('loss-path-known-not-wired')}, loss-path-unidentified ${lane('loss-path-not-identified')}, no-fire ${lane('fire-proof-missing-for-no-crumb')}, no-silence ${lane('silence-proof-missing-for-crumb')}`;
}

function isCapabilityScopedUnknownReason(reason: ImportConformanceUnknownObservation['reason']): boolean {
  return (
    reason === 'instrument-audit-incomplete' ||
    reason === 'loop-bounded-configuration-limit' ||
    reason === 'loss-path-known-not-wired' ||
    reason === 'loss-path-not-identified'
  );
}

function parseArguments(
  args: readonly string[],
): Readonly<{ allowUnknownBaseline: boolean; baseline: string; current: string }> {
  let allowUnknownBaseline = false;
  let baseline = IMPORT_CONFORMANCE_BASELINE_PATH;
  let current = IMPORT_CONFORMANCE_CURRENT_PATH;
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (option === '--allow-unknown-baseline') {
      allowUnknownBaseline = true;
      continue;
    }
    if (option !== '--baseline' && option !== '--current') {
      throw new Error(
        `Unknown argument '${option}'. Expected --allow-unknown-baseline, --baseline <path>, or --current <path>.`,
      );
    }
    const path = args[++index];
    if (path === undefined || path.trim() === '') throw new Error(`Missing path after ${option}.`);
    if (option === '--baseline') baseline = path;
    else current = path;
  }
  return { allowUnknownBaseline, baseline, current };
}

function readScore(path: string, label: string): ImportConformanceScore {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read ${label} score '${path}': ${detail}`);
  }
  return parseImportConformanceScore(value, label);
}

function sameKeys<T extends number | string>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function stateLabel(state: ImportConformanceRatchetState): string {
  if (state === 'pass') return pc.green('PASS');
  if (state === 'regression') return pc.red('REGRESSION');
  if (state === 'not-run') return pc.yellow('NOT RUN');
  return pc.yellow('INCOMPARABLE');
}

function stateMark(state: ImportConformanceRatchetState): string {
  if (state === 'pass') return pc.green('✓');
  if (state === 'regression') return pc.red('✗');
  return pc.yellow('!');
}

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) {
  process.chdir(repoRoot);
  process.exitCode = runImportConformanceRatchet(process.argv.slice(2));
}
