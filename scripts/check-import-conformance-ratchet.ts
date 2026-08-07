import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { parseImportConformanceScore } from './import-conformance-score';
import type {
  ImportConformanceCapability,
  ImportConformanceMeasuredPack,
  ImportConformanceScore,
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
    if (
      policy.unknownBaseline === 'reject' &&
      baselinePack.capabilities.some((capability) => capability.state === 'unknown')
    ) {
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
  ];
  for (const pack of report.packs) {
    lines.push('', `  ${stateMark(pack.state)} ${pc.bold(pack.id)} ${stateLabel(pack.state)}`);
    if (pack.baseline !== null && pack.current !== null) {
      lines.push(`    ${formatScoreNumbers(pack.baseline, pack.current)}`);
    } else if (pack.current !== null) {
      lines.push(`    ${formatScoreNumbers(null, pack.current)}`);
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
      baselineCapability.state === 'unmeasured'
    ) {
      continue;
    }
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
    if (currentCapability.state === 'not-run') continue;
    if (currentCapability.witnesses < baselineCapability.witnesses) {
      findings.push(
        finding(
          'witness-depth-regressed',
          `witness depth fell from ${baselineCapability.witnesses} to ${currentCapability.witnesses}`,
          baselineCapability.id,
        ),
      );
    }
    if (baselineCapability.state === 'unknown') continue;
    if (currentCapability.state === 'unknown') {
      findings.push(
        finding(
          'capability-instrumentation-regressed',
          'was measured and is now UNKNOWN because diagnostic instrumentation is missing',
          baselineCapability.id,
        ),
      );
      continue;
    }
    if (!sameKeys(baselineCapability.instrumentationProofs, currentCapability.instrumentationProofs)) {
      findings.push(
        finding(
          'instrumentation-proof-changed',
          `firing-test proofs changed from [${baselineCapability.instrumentationProofs.join(', ')}] to [${currentCapability.instrumentationProofs.join(', ')}]`,
          baselineCapability.id,
        ),
      );
    }
    if (baselineCapability.result === 'pass' && currentCapability.result === 'fail') {
      findings.push(finding('capability-regressed', 'changed from passing to failing', baselineCapability.id));
    }
  }
  return findings;
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
): string {
  const currentSummary = current.summary;
  const currentNumbers = [
    `${currentSummary.exercised.capabilities}/${currentSummary.totalCapabilities}`,
    `${currentSummary.exercised.instrumented.capabilities}/${currentSummary.exercised.capabilities}`,
    `${currentSummary.exercised.instrumented.passedCapabilities}/${currentSummary.exercised.instrumented.capabilities}`,
    `${currentSummary.exercised.singleWitnessCapabilities}`,
  ];
  if (baseline === null) {
    return `exercised ${currentNumbers[0]}; instrumented ${currentNumbers[1]}; pass ${currentNumbers[2]}; single-witness ${currentNumbers[3]}`;
  }
  const baselineSummary = baseline.summary;
  return [
    `exercised ${baselineSummary.exercised.capabilities}/${baselineSummary.totalCapabilities} → ${currentNumbers[0]}`,
    `instrumented ${baselineSummary.exercised.instrumented.capabilities}/${baselineSummary.exercised.capabilities} → ${currentNumbers[1]}`,
    `pass ${baselineSummary.exercised.instrumented.passedCapabilities}/${baselineSummary.exercised.instrumented.capabilities} → ${currentNumbers[2]}`,
    `single-witness ${baselineSummary.exercised.singleWitnessCapabilities} → ${currentNumbers[3]}`,
  ].join('; ');
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
