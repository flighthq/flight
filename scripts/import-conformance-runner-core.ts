import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import { parseImportConformanceOracleOutcomes } from './import-conformance-case';
import type {
  ImportConformanceIndexedCase,
  ImportConformanceResult,
  ImportConformanceShardPlan,
} from './import-conformance-core';
import { applyImportConformanceOracleOutcomes, createImportConformanceCacheKey } from './import-conformance-core';
import { parseImportConformanceRetainedDiagnostic } from './import-conformance-diagnostic-evidence';

export interface ImportConformanceShardResults {
  completedShardIds: Set<number>;
  results: ImportConformanceResult[];
}

export function hashImportConformanceImporterSource(sourceDirectory: string, importerId: string): string {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(importerId)) throw new Error('Importer id must be a stable identifier');
  const paths = listFiles(sourceDirectory).filter(
    (path) => !path.endsWith('.test.ts') && !path.endsWith('TestHelper.ts'),
  );
  const hash = createHash('sha256');
  hash.update('import-conformance-importer-source-v2\0');
  hash.update(importerId);
  hash.update('\0');
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
  candidate: Readonly<ImportConformanceIndexedCase>,
  importerSourceHash: string,
): ImportConformanceResult | null {
  const path = getResultCachePath(cacheDirectory, candidate.caseHash, importerSourceHash);
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(value) || value.schemaVersion !== 4) return null;
    if (value.caseHash !== candidate.caseHash || value.importerSourceHash !== importerSourceHash) return null;
    return parseCachedResult(value.result, candidate);
  } catch {
    return null;
  }
}

export function readImportConformanceShardResults(
  shardDirectory: string,
  plan: Readonly<ImportConformanceShardPlan>,
  cases: readonly Readonly<ImportConformanceIndexedCase>[],
  importerSourceHash: string,
): ImportConformanceShardResults {
  const caseByReference = new Map(cases.map((candidate) => [candidate.reference, candidate]));
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
      if (!isRecord(value) || value.schemaVersion !== 4 || value.planHash !== plan.planHash) continue;
      if (value.importerSourceHash !== importerSourceHash || value.shardId !== id || !Array.isArray(value.results)) {
        continue;
      }
      const expected = expectedByShard.get(id)!;
      const parsed = value.results.map((result, index) => {
        const reference = expected[index];
        if (reference === undefined) throw new Error('extra result');
        const candidate = caseByReference.get(reference);
        if (candidate === undefined) throw new Error('unknown case result');
        return parseCachedResult(result, candidate);
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
  const path = getResultCachePath(cacheDirectory, result.caseHash, importerSourceHash);
  writeJsonAtomically(path, {
    importerSourceHash,
    result,
    caseHash: result.caseHash,
    schemaVersion: 4,
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
    throw new Error(`Shard ${shardId} results do not match its complete case assignment`);
  }
  writeJsonAtomically(getShardPath(shardDirectory, plan.planHash, shardId), {
    importerSourceHash,
    planHash: plan.planHash,
    results,
    schemaVersion: 4,
    shardId,
  });
}

function getResultCachePath(cacheDirectory: string, caseHash: string, importerSourceHash: string): string {
  return join(cacheDirectory, 'results', `${createImportConformanceCacheKey(caseHash, importerSourceHash)}.json`);
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

function parseCachedResult(value: unknown, candidate: Readonly<ImportConformanceIndexedCase>): ImportConformanceResult {
  if (!isRecord(value) || value.reference !== candidate.reference || value.caseHash !== candidate.caseHash) {
    throw new Error('stale case result');
  }
  if (!isOutcome(value.importOutcome) || !isOutcome(value.outcome) || !Array.isArray(value.capabilityOutcomes)) {
    throw new Error('invalid case result');
  }
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
  if (capabilityOutcomes.map((outcome) => outcome.id).join('\0') !== candidate.capabilities.join('\0')) {
    throw new Error('stale capability result');
  }
  const oracleOutcomes = parseImportConformanceOracleOutcomes(value.oracleOutcomes, 'cached oracle outcomes');
  if (value.outcome !== applyImportConformanceOracleOutcomes(value.importOutcome, oracleOutcomes)) {
    throw new Error('case outcome does not match import and oracle evidence');
  }
  const probeUnreadableEvidence = parseProbeUnreadableEvidence(value.probeUnreadableEvidence, candidate);
  return {
    caseHash: candidate.caseHash,
    capabilityOutcomes,
    importOutcome: value.importOutcome,
    oracleOutcomes,
    outcome: value.outcome,
    ...(probeUnreadableEvidence === undefined ? {} : { probeUnreadableEvidence }),
    reference: candidate.reference,
  };
}

function parseProbeUnreadableEvidence(
  value: unknown,
  candidate: Readonly<ImportConformanceIndexedCase>,
): ImportConformanceResult['probeUnreadableEvidence'] {
  if (candidate.probeState === 'readable') {
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
    diagnostics: value.diagnostics.map(parseImportConformanceRetainedDiagnostic),
    imported: value.imported,
    threw: value.threw,
  };
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
