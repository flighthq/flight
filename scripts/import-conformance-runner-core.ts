import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import type {
  ImportConformanceIndexedFixture,
  ImportConformanceResult,
  ImportConformanceShardPlan,
} from './import-conformance-core';
import { createImportConformanceCacheKey } from './import-conformance-core';

export interface ImportConformanceShardResults {
  completedShardIds: Set<number>;
  results: ImportConformanceResult[];
}

export function hashImportConformanceImporterSource(sourceDirectory: string): string {
  const paths = listFiles(sourceDirectory).filter(
    (path) => !path.endsWith('.test.ts') && !path.endsWith('TestHelper.ts'),
  );
  const hash = createHash('sha256');
  hash.update('swf-importer-source-v1\0');
  for (const path of paths) {
    const reference = relative(sourceDirectory, path).split(sep).join('/');
    hash.update(reference);
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function readImportConformanceCachedResult(
  cacheDirectory: string,
  fixture: Readonly<ImportConformanceIndexedFixture>,
  importerSourceHash: string,
): ImportConformanceResult | null {
  const path = getResultCachePath(cacheDirectory, fixture.sourceHash, importerSourceHash);
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(value) || value.schemaVersion !== 3) return null;
    if (value.sourceHash !== fixture.sourceHash || value.importerSourceHash !== importerSourceHash) return null;
    return parseCachedResult(value.result, fixture);
  } catch {
    return null;
  }
}

export function readImportConformanceShardResults(
  shardDirectory: string,
  plan: Readonly<ImportConformanceShardPlan>,
  fixtures: readonly Readonly<ImportConformanceIndexedFixture>[],
  importerSourceHash: string,
): ImportConformanceShardResults {
  const fixtureByReference = new Map(fixtures.map((fixture) => [fixture.reference, fixture]));
  const expectedByShard = new Map<number, string[]>();
  for (let id = 0; id < plan.shardCount; id++) expectedByShard.set(id, []);
  for (const assignment of plan.assignments) expectedByShard.get(assignment.shardId)!.push(assignment.reference);

  const completedShardIds = new Set<number>();
  const results: ImportConformanceResult[] = [];
  for (let id = 0; id < plan.shardCount; id++) {
    const path = getShardPath(shardDirectory, plan.planHash, id);
    if (!existsSync(path)) continue;
    try {
      const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (!isRecord(value) || value.schemaVersion !== 3 || value.planHash !== plan.planHash) continue;
      if (value.importerSourceHash !== importerSourceHash || value.shardId !== id || !Array.isArray(value.results)) {
        continue;
      }
      const expected = expectedByShard.get(id)!;
      const parsed = value.results.map((result, index) => {
        const reference = expected[index];
        if (reference === undefined) throw new Error('extra result');
        return parseCachedResult(result, fixtureByReference.get(reference)!);
      });
      if (parsed.length !== expected.length) continue;
      completedShardIds.add(id);
      results.push(...parsed);
    } catch {
      continue;
    }
  }
  results.sort(compareResultReference);
  return { completedShardIds, results };
}

export function writeImportConformanceCachedResult(
  cacheDirectory: string,
  result: Readonly<ImportConformanceResult>,
  importerSourceHash: string,
): void {
  const path = getResultCachePath(cacheDirectory, result.sourceHash, importerSourceHash);
  writeJsonAtomically(path, {
    importerSourceHash,
    result,
    schemaVersion: 3,
    sourceHash: result.sourceHash,
  });
}

export function writeImportConformanceShardResult(
  shardDirectory: string,
  plan: Readonly<ImportConformanceShardPlan>,
  shardId: number,
  results: readonly Readonly<ImportConformanceResult>[],
  importerSourceHash: string,
): void {
  const expected = plan.assignments
    .filter((assignment) => assignment.shardId === shardId)
    .map((assignment) => assignment.reference);
  if (results.map((result) => result.reference).join('\0') !== expected.join('\0')) {
    throw new Error(`Shard ${shardId} results do not match its complete fixture assignment`);
  }
  writeJsonAtomically(getShardPath(shardDirectory, plan.planHash, shardId), {
    importerSourceHash,
    planHash: plan.planHash,
    results,
    schemaVersion: 3,
    shardId,
  });
}

function getResultCachePath(cacheDirectory: string, sourceHash: string, importerSourceHash: string): string {
  return join(cacheDirectory, 'results', `${createImportConformanceCacheKey(sourceHash, importerSourceHash)}.json`);
}

function getShardPath(shardDirectory: string, planHash: string, shardId: number): string {
  return join(shardDirectory, planHash, `${shardId}.json`);
}

function listFiles(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  return files.sort();
}

function parseCachedResult(
  value: unknown,
  fixture: Readonly<ImportConformanceIndexedFixture>,
): ImportConformanceResult {
  if (!isRecord(value) || value.reference !== fixture.reference || value.sourceHash !== fixture.sourceHash) {
    throw new Error('stale fixture result');
  }
  if (!isOutcome(value.outcome) || !Array.isArray(value.capabilityOutcomes)) throw new Error('invalid fixture result');
  const capabilityOutcomes: ImportConformanceResult['capabilityOutcomes'] = value.capabilityOutcomes.map(
    (candidate) => {
      if (
        !isRecord(candidate) ||
        (candidate.diagnosticCause !== 'separable' && candidate.diagnosticCause !== 'unknown') ||
        typeof candidate.diagnosticReported !== 'boolean' ||
        typeof candidate.id !== 'string' ||
        !isOutcome(candidate.outcome)
      ) {
        throw new Error('invalid capability result');
      }
      return {
        diagnosticCause: candidate.diagnosticCause,
        diagnosticReported: candidate.diagnosticReported,
        id: candidate.id,
        outcome: candidate.outcome,
      };
    },
  );
  if (capabilityOutcomes.map((candidate) => candidate.id).join('\0') !== fixture.capabilities.join('\0')) {
    throw new Error('stale capability result');
  }
  const probeUnreadableEvidence = parseProbeUnreadableEvidence(value.probeUnreadableEvidence, fixture);
  return {
    capabilityOutcomes,
    outcome: value.outcome,
    ...(probeUnreadableEvidence === undefined ? {} : { probeUnreadableEvidence }),
    reference: fixture.reference,
    sourceHash: fixture.sourceHash,
  };
}

function parseProbeUnreadableEvidence(
  value: unknown,
  fixture: Readonly<ImportConformanceIndexedFixture>,
): ImportConformanceResult['probeUnreadableEvidence'] {
  if (fixture.probeState === 'readable') {
    if (value !== undefined) throw new Error('probe-readable fixture carries unreadable evidence');
    return undefined;
  }
  if (!isRecord(value) || !Array.isArray(value.diagnostics)) {
    throw new Error('probe-unreadable fixture result lacks retained evidence');
  }
  if (typeof value.imported !== 'boolean' || typeof value.threw !== 'boolean') {
    throw new Error('invalid probe-unreadable fixture sentinel evidence');
  }
  return {
    diagnostics: value.diagnostics.map(parseRetainedDiagnostic),
    imported: value.imported,
    threw: value.threw,
  };
}

function parseRetainedDiagnostic(
  value: unknown,
): NonNullable<ImportConformanceResult['probeUnreadableEvidence']>['diagnostics'][number] {
  if (!isRecord(value) || typeof value.kind !== 'string' || value.kind === '') {
    throw new Error('invalid retained diagnostic kind');
  }
  if (typeof value.origin !== 'string' || value.origin === '') {
    throw new Error('invalid retained diagnostic origin');
  }
  if (
    value.severity !== 'Drop' &&
    value.severity !== 'Recover' &&
    value.severity !== 'Reject' &&
    value.severity !== 'Skip'
  ) {
    throw new Error('invalid retained diagnostic severity');
  }
  const detail = value.detail === undefined ? undefined : parseRetainedDiagnosticDetail(value.detail);
  return {
    ...(detail === undefined ? {} : { detail }),
    kind: value.kind,
    origin: value.origin,
    severity: value.severity,
  };
}

function parseRetainedDiagnosticDetail(
  value: unknown,
): NonNullable<NonNullable<ImportConformanceResult['probeUnreadableEvidence']>['diagnostics'][number]['detail']> {
  if (!isRecord(value)) throw new Error('invalid retained diagnostic detail');
  const allowed = new Set(['capability', 'characterId', 'compression', 'frame', 'length', 'sceneCount']);
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    throw new Error('retained diagnostic detail contains unruled fields');
  }
  const detail: Record<string, number | string> = {};
  if ('capability' in value) {
    if (typeof value.capability !== 'string' || value.capability === '') {
      throw new Error('invalid retained diagnostic capability');
    }
    detail.capability = value.capability;
  }
  if ('compression' in value) {
    if (value.compression !== 'deflate' && value.compression !== 'lzma') {
      throw new Error('invalid retained diagnostic compression');
    }
    detail.compression = value.compression;
  }
  for (const key of ['characterId', 'frame', 'length', 'sceneCount'] as const) {
    if (!(key in value)) continue;
    const number = value[key];
    if (!Number.isSafeInteger(number) || (number as number) < 0) {
      throw new Error(`invalid retained diagnostic ${key}`);
    }
    detail[key] = number as number;
  }
  return detail;
}

function writeJsonAtomically(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  rmSync(temporary, { force: true });
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function compareResultReference(a: Readonly<ImportConformanceResult>, b: Readonly<ImportConformanceResult>): number {
  return a.reference < b.reference ? -1 : a.reference > b.reference ? 1 : 0;
}

function isOutcome(value: unknown): value is ImportConformanceResult['outcome'] {
  return (
    value === 'passed' ||
    value === 'threw' ||
    value === 'importedWrong' ||
    value === 'unsupportedClean' ||
    value === 'silentlyWrong'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
