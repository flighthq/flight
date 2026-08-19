// Reports whether committed capture provenance still names the current scene-source bytes.
//
// SOURCE OF TRUTH — do not re-derive this resolution rule from sample filenames:
//   - getCaptureSceneSourceHash in packages/tool-capture/src/captureSourceHash.ts hashes the bytes;
//   - functionalScene3DFile in packages/tool-capture/src/functionalScene3Ds.ts resolves
//     `<name>.<backend>.ts`, falling back to `<name>.ts`;
//   - discoverEntries in packages/tool-capture/src/captureEntries.ts defines the live built-in targets.
// Importing those helpers keeps this census on the same predicate as capture validation.
//
// READ THE OUTPUT CORRECTLY. A sourceHash mismatch means the scene file changed after capture, so the
// recorded provenance can no longer verify the current source. It does NOT mean the rendered baseline is
// bad: a comment, import reorder, or formatting pass changes the file hash without moving one pixel.
//
// With no report argument the denominator is every committed fingerprint column in the selected suite(s),
// including columns that no live target resolves. That global census must NOT be compared with a scoped
// validator run. Pass that run's validation report to slice the census to the regression columns it
// actually gated; CLI selection alone cannot know which pages loaded and reached the gate.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { discoverEntries } from '../packages/tool-capture/src/captureEntries';
import type { Entry } from '../packages/tool-capture/src/captureEntries';
import { CAPTURE_PROTOCOL_VERSION } from '../packages/tool-capture/src/captureProtocol';
import { CAPTURE_REPORT_VERSION } from '../packages/tool-capture/src/captureReport';
import { getCaptureSceneSourceHash } from '../packages/tool-capture/src/captureSourceHash';

export type CaptureProvenanceSubject = 'examples' | 'functional';

export interface CaptureProvenanceColumn {
  currentSourceHash: string | null;
  entry: string;
  fingerprintProvenanceStatus: 'full' | 'partial' | 'missing';
  fingerprintSourceHash: string | null;
  renderer: string;
  sha256SourceHash: string | null;
  subject: CaptureProvenanceSubject;
}

export interface CaptureProvenanceAxisCensus {
  currentUnavailable: number;
  exact: number;
  mismatched: number;
  missing: number;
}

export interface CaptureProvenanceCensusRow {
  fingerprint: CaptureProvenanceAxisCensus;
  fingerprintColumns: number;
  fingerprintProvenanceFull: number;
  fingerprintProvenancePartial: number;
  freshnessGap: number;
  mismatchedScenes: number;
  sha256Provenance: CaptureProvenanceAxisCensus;
  subject: CaptureProvenanceSubject | 'total';
}

export interface CaptureProvenanceCensus {
  rows: CaptureProvenanceCensusRow[];
  total: CaptureProvenanceCensusRow;
}

interface CaptureProvenanceCliOptions {
  help: boolean;
  subject?: CaptureProvenanceSubject;
  validationReport?: string;
}

const SUBJECTS: readonly CaptureProvenanceSubject[] = ['examples', 'functional'];
const WARNING =
  'A sourceHash mismatch means provenance is unverifiable against the current scene; it does not mean the rendered baseline is bad.';

/** The stable identity used both by committed columns and validation-report regression checks. */
export function captureProvenanceColumnKey(entry: string, renderer: string): string {
  return `${entry}\0${renderer}`;
}

/**
 * Reads the exact population a validation run gated. Skips, parity checks, and `--report`-only rows did
 * not gate regression, so including any of them would recreate the global-versus-run category error this
 * script exists to prevent.
 */
export function readGatedValidationIdentities(text: string): Set<string> {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid validation report JSON: ${describeError(error)}`);
  }
  if (
    !isRecord(envelope) ||
    envelope.protocolVersion !== CAPTURE_PROTOCOL_VERSION ||
    envelope.reportVersion !== CAPTURE_REPORT_VERSION ||
    envelope.kind !== 'validation' ||
    !isRecord(envelope.result)
  ) {
    throw new Error(`expected validation report protocol=${CAPTURE_PROTOCOL_VERSION} report=${CAPTURE_REPORT_VERSION}`);
  }
  const checks = envelope.result.checks;
  if (!Array.isArray(checks)) throw new Error('validation report has no checks array');

  const identities = new Set<string>();
  for (const check of checks) {
    if (
      !isRecord(check) ||
      check.kind !== 'regression' ||
      (check.status !== 'passed' && check.status !== 'failed') ||
      typeof check.entry !== 'string' ||
      !Array.isArray(check.renderers) ||
      check.renderers.length !== 1 ||
      typeof check.renderers[0] !== 'string'
    ) {
      continue;
    }
    identities.add(captureProvenanceColumnKey(check.entry, check.renderers[0]));
  }
  if (identities.size === 0) {
    throw new Error('validation report gated no regression columns; there is no run population to census');
  }
  return identities;
}

/** Loads committed fingerprint columns, optionally sliced to identities proven gated by one run. */
export function loadCaptureProvenanceColumns(
  repositoryRoot: string,
  subject: CaptureProvenanceSubject,
  gatedIdentities?: ReadonlySet<string>,
): CaptureProvenanceColumn[] {
  const entries = new Map(discoverEntries(subject, repositoryRoot).map((entry) => [entry.name, entry]));
  const directory = join(repositoryRoot, subject, 'baselines');
  if (!existsSync(directory)) return [];

  const found = new Set<string>();
  const columns: CaptureProvenanceColumn[] = [];
  for (const file of readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, file.name);
    const entryName = basename(file.name, '.json');
    const baseline = parseBaseline(path);
    const entry = entries.get(entryName);
    for (const [renderer, value] of Object.entries(baseline)) {
      if (!isRecord(value) || typeof value.fingerprint !== 'string') continue;
      const identity = captureProvenanceColumnKey(entryName, renderer);
      if (gatedIdentities !== undefined && !gatedIdentities.has(identity)) continue;
      found.add(identity);
      const fingerprintProvenance = readFingerprintProvenance(value, path, renderer);
      const legacySourceHash = nonEmptyString(value.sourceHash);
      columns.push({
        currentSourceHash: resolvesLiveTarget(entry, renderer)
          ? getCaptureSceneSourceHash(repositoryRoot, subject, entry, renderer)
          : null,
        entry: entryName,
        // Mixed is the steady-state migration shape. Prefer the full record whenever present; the
        // legacy field is a labelled partial fallback, never a peer value to merge with it.
        fingerprintProvenanceStatus:
          fingerprintProvenance !== null ? 'full' : legacySourceHash !== null ? 'partial' : 'missing',
        fingerprintSourceHash:
          fingerprintProvenance !== null ? nonEmptyString(fingerprintProvenance.sourceHash) : legacySourceHash,
        renderer,
        sha256SourceHash: isRecord(value.sha256Provenance) ? nonEmptyString(value.sha256Provenance.sourceHash) : null,
        subject,
      });
    }
  }

  if (gatedIdentities !== undefined) {
    const missing = [...gatedIdentities].filter((identity) => !found.has(identity));
    if (missing.length > 0) {
      throw new Error(
        `validation report names ${missing.length} gated regression column${missing.length === 1 ? '' : 's'} with no committed fingerprint: ${missing.map(formatIdentity).join(', ')}`,
      );
    }
  }
  return columns;
}

export function censusCaptureProvenance(
  columns: readonly CaptureProvenanceColumn[],
  subjects: readonly CaptureProvenanceSubject[] = SUBJECTS,
): CaptureProvenanceCensus {
  const rows = subjects.map((subject) =>
    censusRow(
      columns.filter((column) => column.subject === subject),
      subject,
    ),
  );
  return { rows, total: censusRow(columns, 'total') };
}

export function formatCaptureProvenanceCensus(census: Readonly<CaptureProvenanceCensus>, scope: string): string {
  const lines = [
    pc.bold('Capture baseline provenance census'),
    `${pc.yellow('WARNING:')} ${WARNING}`,
    `Scope: ${scope}`,
    'Source rule: packages/tool-capture/src/captureSourceHash.ts#getCaptureSceneSourceHash + functionalScene3Ds.ts#functionalScene3DFile',
  ];
  for (const row of census.rows) lines.push('', ...formatRow(row));
  if (census.rows.length > 1) lines.push('', ...formatRow(census.total));
  const gaps = [
    ...census.rows.map((row) => `${row.subject}=${signed(row.freshnessGap)}`),
    `total=${signed(census.total.freshnessGap)}`,
  ];
  lines.push(
    '',
    `Fingerprint mismatch reach: ${census.total.fingerprint.mismatched} column${census.total.fingerprint.mismatched === 1 ? '' : 's'} across ${census.total.mismatchedScenes} scene${census.total.mismatchedScenes === 1 ? '' : 's'}`,
    `Exact-vs-fingerprint freshness gap (sha256 exact - fingerprint exact): ${gaps.join('  ')}`,
  );
  return lines.join('\n');
}

function censusRow(
  columns: readonly CaptureProvenanceColumn[],
  subject: CaptureProvenanceSubject | 'total',
): CaptureProvenanceCensusRow {
  const fingerprint = emptyAxis();
  const sha256Provenance = emptyAxis();
  const mismatchedScenes = new Set<string>();
  let fingerprintProvenanceFull = 0;
  let fingerprintProvenancePartial = 0;
  for (const column of columns) {
    if (column.fingerprintProvenanceStatus === 'full') fingerprintProvenanceFull++;
    else if (column.fingerprintProvenanceStatus === 'partial') fingerprintProvenancePartial++;
    const fingerprintState = addAxis(fingerprint, column.fingerprintSourceHash, column.currentSourceHash);
    addAxis(sha256Provenance, column.sha256SourceHash, column.currentSourceHash);
    if (fingerprintState === 'mismatched') mismatchedScenes.add(`${column.subject}/${column.entry}`);
  }
  return {
    fingerprint,
    fingerprintColumns: columns.length,
    fingerprintProvenanceFull,
    fingerprintProvenancePartial,
    freshnessGap: sha256Provenance.exact - fingerprint.exact,
    mismatchedScenes: mismatchedScenes.size,
    sha256Provenance,
    subject,
  };
}

function addAxis(
  census: CaptureProvenanceAxisCensus,
  recorded: string | null,
  current: string | null,
): keyof CaptureProvenanceAxisCensus {
  if (recorded === null) {
    census.missing++;
    return 'missing';
  }
  if (current === null) {
    census.currentUnavailable++;
    return 'currentUnavailable';
  }
  if (recorded === current) {
    census.exact++;
    return 'exact';
  }
  census.mismatched++;
  return 'mismatched';
}

function emptyAxis(): CaptureProvenanceAxisCensus {
  return { currentUnavailable: 0, exact: 0, mismatched: 0, missing: 0 };
}

function formatRow(row: Readonly<CaptureProvenanceCensusRow>): string[] {
  return [
    `${row.subject} (${row.fingerprintColumns} fingerprint columns)`,
    `  fingerprint provenance       full=${pad(row.fingerprintProvenanceFull)}  PROVENANCE-PARTIAL=${pad(row.fingerprintProvenancePartial)}  absent=${pad(row.fingerprintColumns - row.fingerprintProvenanceFull - row.fingerprintProvenancePartial)}`,
    `  fingerprint sourceHash       exact=${pad(row.fingerprint.exact)}  mismatch=${pad(row.fingerprint.mismatched)}  absent=${pad(row.fingerprint.missing)}  current-unavailable=${pad(row.fingerprint.currentUnavailable)}`,
    `  sha256Provenance.sourceHash  exact=${pad(row.sha256Provenance.exact)}  mismatch=${pad(row.sha256Provenance.mismatched)}  absent=${pad(row.sha256Provenance.missing)}  current-unavailable=${pad(row.sha256Provenance.currentUnavailable)}`,
  ];
}

function readFingerprintProvenance(
  column: Readonly<Record<string, unknown>>,
  path: string,
  renderer: string,
): Record<string, unknown> | null {
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
    throw new Error(`${path}:${renderer}: malformed fingerprintProvenance`);
  }
  return value;
}

function resolvesLiveTarget(entry: Entry | undefined, renderer: string): entry is Entry {
  return entry !== undefined && entry.renderers.includes(renderer);
}

function parseBaseline(path: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path}: invalid baseline JSON: ${describeError(error)}`);
  }
  if (!isRecord(value)) throw new Error(`${path}: baseline root must be an object`);
  return value;
}

function parseCliOptions(argv: readonly string[]): CaptureProvenanceCliOptions {
  const options: CaptureProvenanceCliOptions = { help: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    const [flag, inlineValue] = argument.split('=', 2);
    if (flag !== '--tool' && flag !== '--validation-report') throw new Error(`unknown option: ${argument}`);
    const value = inlineValue ?? argv[++index];
    if (value === undefined || value === '' || value.startsWith('-')) throw new Error(`${flag} requires a value`);
    if (flag === '--tool') {
      if (value !== 'examples' && value !== 'functional') throw new Error(`unknown built-in tool: ${value}`);
      options.subject = value;
    } else {
      options.validationReport = value;
    }
  }
  if (options.validationReport !== undefined && options.subject === undefined) {
    throw new Error('--validation-report requires --tool so report identities resolve in the correct suite');
  }
  return options;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatIdentity(identity: string): string {
  return identity.replace('\0', '/');
}

function pad(value: number): string {
  return value.toString().padStart(4);
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function printUsage(): void {
  console.log(`usage:
  npm run capture:provenance
  npm run capture:provenance -- --tool <examples|functional>
  npm run capture:provenance -- --tool <examples|functional> --validation-report <path>

No report: census every committed fingerprint column in the selected suite(s).
With a report: census only passed/failed regression columns that run actually gated.`);
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  const subjects = options.subject === undefined ? SUBJECTS : [options.subject];
  let gatedIdentities: ReadonlySet<string> | undefined;
  let scope = `all committed ${subjects.join(' + ')} fingerprint columns`;
  if (options.validationReport !== undefined) {
    const reportPath = resolve(process.cwd(), options.validationReport);
    gatedIdentities = readGatedValidationIdentities(readFileSync(reportPath, 'utf8'));
    scope = `actual gated regression columns from ${reportPath} (${options.subject})`;
  }
  const columns = subjects.flatMap((subject) => loadCaptureProvenanceColumns(root, subject, gatedIdentities));
  console.log(formatCaptureProvenanceCensus(censusCaptureProvenance(columns, subjects), scope));
}

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
