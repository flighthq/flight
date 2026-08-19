import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BITMAP_FINGERPRINT_COMPUTATION_ID } from '@flighthq/bitmap/contract';
import pc from 'picocolors';

export interface FingerprintBaselineInput {
  path: string;
  text: string;
}

export interface FingerprintSourceHashAllowance {
  path: string;
  reason: string;
  renderer: string;
}

export interface FingerprintSourceHashAllowanceResult extends FingerprintSourceHashAllowance {
  state: 'full' | 'partial' | 'invalid' | 'missing' | 'unavailable';
}

export interface FingerprintSourceHashReport {
  allowances: FingerprintSourceHashAllowanceResult[];
  computationMismatches: number;
  fingerprintColumns: number;
  full: number;
  partial: number;
  unavailable: number;
  violations: FingerprintSourceHashViolation[];
}

export interface FingerprintSourceHashViolation {
  detail: string;
  path: string;
  renderer?: string;
}

const UNAVAILABLE_REASON =
  'no pixel sha256 was captured for this fingerprint column, so history cannot identify the capture that wrote it; leaving sourceHash absent is more honest than manufacturing evidence';

// An entry LEAVES this list when the column stops being a fingerprint column or gains real source
// evidence — it is a record of honest gaps, not a permanent exemption. render-pass-shared-context/webgl
// left it that way: the column now carries a captured sha256 with its own provenance, and its committed
// fingerprint was uniform (one distinct cell of 256), which the repo refuses to write today because it
// matches any uniform frame and so cannot fail. Dropping that fingerprint left real evidence behind and
// removed the gap this list existed to name.
export const FINGERPRINT_SOURCE_HASH_ALLOWANCES: readonly FingerprintSourceHashAllowance[] = [
  allowance('functional/baselines/bitmap-perbitmap-smoothing.json', 'webgpu'),
  allowance('functional/baselines/shape-stroke-joints.json', 'webgl'),
  allowance('functional/baselines/shape-stroke-joints.json', 'webgpu'),
  allowance('functional/baselines/text-strikethrough.json', 'webgl'),
  allowance('functional/baselines/text-strikethrough.json', 'webgpu'),
];

/** Checks that every fingerprint column carries write-time scene-source evidence or a named honest gap. */
export function checkFingerprintSourceHashes(
  inputs: readonly FingerprintBaselineInput[],
  allowances: readonly FingerprintSourceHashAllowance[],
): FingerprintSourceHashReport {
  const violations: FingerprintSourceHashViolation[] = [];
  const states = new Map<string, FingerprintSourceHashAllowanceResult['state']>(
    allowances.map((entry) => [allowanceKey(entry.path, entry.renderer), 'missing']),
  );
  let computationMismatches = 0;
  let full = 0;
  let fingerprintColumns = 0;
  let partial = 0;
  let unavailable = 0;

  for (const input of inputs) {
    let baseline: unknown;
    try {
      baseline = JSON.parse(input.text);
    } catch (error) {
      violations.push({ detail: `invalid JSON: ${describeError(error)}`, path: input.path });
      continue;
    }
    if (!isRecord(baseline)) {
      violations.push({ detail: 'baseline root must be an object', path: input.path });
      continue;
    }

    for (const [renderer, value] of Object.entries(baseline)) {
      if (!isRecord(value) || typeof value.fingerprint !== 'string') continue;
      fingerprintColumns++;
      const key = allowanceKey(input.path, renderer);
      const namedAllowance = allowances.find((entry) => allowanceKey(entry.path, entry.renderer) === key);
      const fingerprintProvenance = readFingerprintProvenance(value);
      if (fingerprintProvenance === 'malformed') {
        if (namedAllowance) states.set(key, 'invalid');
        violations.push({ detail: 'fingerprintProvenance is malformed', path: input.path, renderer });
        continue;
      }
      if (
        fingerprintProvenance !== null &&
        typeof fingerprintProvenance.computationId === 'string' &&
        fingerprintProvenance.computationId !== BITMAP_FINGERPRINT_COMPUTATION_ID
      ) {
        computationMismatches++;
        violations.push({
          detail: `fingerprint computationId mismatch: baseline has '${fingerprintProvenance.computationId}', current is '${BITMAP_FINGERPRINT_COMPUTATION_ID}'`,
          path: input.path,
          renderer,
        });
      }
      const fullProvenance = fingerprintProvenance !== null;
      const sourceHashPresent = fullProvenance
        ? typeof fingerprintProvenance.sourceHash === 'string' && fingerprintProvenance.sourceHash.trim() !== ''
        : typeof value.sourceHash === 'string' && value.sourceHash.trim() !== '';
      if (fullProvenance) full++;
      if (sourceHashPresent) {
        if (!fullProvenance) partial++;
        if (namedAllowance) states.set(key, fullProvenance ? 'full' : 'partial');
        continue;
      }

      const sourceHashAbsent = fullProvenance
        ? fingerprintProvenance.sourceHash === null
        : !Object.hasOwn(value, 'sourceHash');
      const sha256Absent = !Object.hasOwn(value, 'sha256');
      if (namedAllowance && sourceHashAbsent && sha256Absent) {
        unavailable++;
        states.set(key, 'unavailable');
        continue;
      }

      if (namedAllowance) states.set(key, 'invalid');
      violations.push({
        detail: namedAllowance
          ? 'named unavailability is valid only when both sourceHash and sha256 are absent'
          : 'fingerprint column has no non-empty sourceHash and is not a named unavailable case',
        path: input.path,
        renderer,
      });
    }
  }

  const allowanceResults = allowances.map<FingerprintSourceHashAllowanceResult>((entry) => ({
    ...entry,
    state: states.get(allowanceKey(entry.path, entry.renderer)) ?? 'missing',
  }));
  for (const entry of allowanceResults) {
    if (entry.state === 'missing') {
      violations.push({
        detail: 'named unavailability no longer identifies a fingerprint column; remove or correct the allowance',
        path: entry.path,
        renderer: entry.renderer,
      });
    }
  }

  return {
    allowances: allowanceResults,
    computationMismatches,
    fingerprintColumns,
    full,
    partial,
    unavailable,
    violations,
  };
}

export function formatFingerprintSourceHashReport(report: Readonly<FingerprintSourceHashReport>): string {
  const passed = report.violations.length === 0;
  const summary = `full provenance ${report.full}; PROVENANCE-PARTIAL ${report.partial}; ${report.unavailable} honest gap${report.unavailable === 1 ? '' : 's'}`;
  const lines = [
    `${passed ? pc.green('OK') : pc.yellow('!')} ${pc.bold('Fingerprint scene-source evidence')} ${pc.dim(`(${summary})`)}`,
    '',
    '  Named sourceHash-unavailable cases:',
  ];
  for (const entry of report.allowances) {
    lines.push(`  - ${entry.path}:${entry.renderer} [${allowanceStateLabel(entry.state)}] — ${entry.reason}`);
  }
  if (!passed) {
    lines.push('', `  ${report.violations.length} violation${report.violations.length === 1 ? '' : 's'}:`);
    for (const violation of report.violations) {
      const column = violation.renderer ? `:${violation.renderer}` : '';
      lines.push(`  - ${violation.path}${column} — ${violation.detail}`);
    }
  }
  return lines.join('\n');
}

function allowance(path: string, renderer: string): FingerprintSourceHashAllowance {
  return { path, reason: UNAVAILABLE_REASON, renderer };
}

function allowanceKey(path: string, renderer: string): string {
  return `${path}:${renderer}`;
}

function allowanceStateLabel(state: FingerprintSourceHashAllowanceResult['state']): string {
  switch (state) {
    case 'full':
      return 'full provenance recorded; allowance ready';
    case 'partial':
      return 'PROVENANCE-PARTIAL sourceHash recorded; allowance ready';
    case 'unavailable':
      return 'unavailable by design';
    case 'invalid':
      return 'invalid missing-value shape';
    case 'missing':
      return 'allowance target missing';
  }
}

function readFingerprintProvenance(
  column: Readonly<Record<string, unknown>>,
): Record<string, unknown> | 'malformed' | null {
  if (!Object.hasOwn(column, 'fingerprintProvenance')) return null;
  const value = column.fingerprintProvenance;
  if (
    !isRecord(value) ||
    (value.computationId !== null && value.computationId !== undefined && typeof value.computationId !== 'string') ||
    typeof value.frames !== 'number' ||
    (value.sourceHash !== null && typeof value.sourceHash !== 'string') ||
    (value.targetKind !== null && typeof value.targetKind !== 'string') ||
    typeof value.verifyPublished !== 'boolean' ||
    typeof value.warmupFrames !== 'number'
  ) {
    return 'malformed';
  }
  return value;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getBaselineInputs(repositoryRoot: string): FingerprintBaselineInput[] {
  const inputs: FingerprintBaselineInput[] = [];
  for (const suite of ['examples', 'functional']) {
    const directory = join(repositoryRoot, suite, 'baselines');
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      inputs.push({
        path: `${suite}/baselines/${entry.name}`,
        text: readFileSync(join(directory, entry.name), 'utf8'),
      });
    }
  }
  return inputs.sort((a, b) => a.path.localeCompare(b.path));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function main(): void {
  const report = checkFingerprintSourceHashes(getBaselineInputs(root), FINGERPRINT_SOURCE_HASH_ALLOWANCES);
  console.log(formatFingerprintSourceHashReport(report));
  if (report.violations.length > 0) process.exitCode = 1;
}

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
