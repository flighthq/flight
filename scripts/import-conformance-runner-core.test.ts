import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createImportConformanceSingleMemberCaseIdentity } from './import-conformance-case';
import type { ImportConformanceIndexedFixture, ImportConformanceResult } from './import-conformance-core';
import { createImportConformanceShardPlan } from './import-conformance-core';
import {
  hashImportConformanceImporterSource,
  readImportConformanceCachedResult,
  readImportConformanceShardResults,
  writeImportConformanceCachedResult,
  writeImportConformanceShardResult,
} from './import-conformance-runner-core';

describe('hashImportConformanceImporterSource', () => {
  it('hashes production SWF source while excluding tests', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-importer-source-'));
    writeFileSync(join(root, 'reader.ts'), 'export const value = 1;');
    writeFileSync(join(root, 'reader.test.ts'), 'test version 1');
    const original = hashImportConformanceImporterSource(root, 'swf');
    writeFileSync(join(root, 'reader.test.ts'), 'test version 2');
    expect(hashImportConformanceImporterSource(root, 'swf')).toBe(original);
    writeFileSync(join(root, 'reader.ts'), 'export const value = 2;');
    expect(hashImportConformanceImporterSource(root, 'swf')).not.toBe(original);
    expect(hashImportConformanceImporterSource(root, 'md5')).not.toBe(hashImportConformanceImporterSource(root, 'swf'));
  });
});

describe('import conformance result cache', () => {
  it('round-trips only the matching fixture and importer source hashes', () => {
    const cache = mkdtempSync(join(tmpdir(), 'flight-import-cache-'));
    const fixture = makeFixture('a.swf');
    const result = makeResult(fixture);
    const importerHash = hash('importer-a');
    writeImportConformanceCachedResult(cache, result, importerHash);
    expect(readImportConformanceCachedResult(cache, fixture, importerHash)).toEqual(result);
    expect(readImportConformanceCachedResult(cache, fixture, hash('importer-b'))).toBeNull();
    expect(
      readImportConformanceCachedResult(
        cache,
        {
          ...fixture,
          ...createImportConformanceSingleMemberCaseIdentity(fixture.reference, hash('changed')),
        },
        importerHash,
      ),
    ).toBeNull();
  });

  it('rejects a cache payload that omits diagnostic cause attribution', () => {
    const cache = mkdtempSync(join(tmpdir(), 'flight-import-cache-'));
    const fixture = makeFixture('a.swf');
    const importerHash = hash('importer-a');
    writeImportConformanceCachedResult(cache, makeResult(fixture), importerHash);
    const resultsDirectory = join(cache, 'results');
    const path = join(resultsDirectory, readdirSync(resultsDirectory)[0]!);
    const payload = JSON.parse(readFileSync(path, 'utf8')) as {
      result: { capabilityOutcomes: { diagnosticCause?: string }[] };
    };
    delete payload.result.capabilityOutcomes[0]!.diagnosticCause;
    writeFileSync(path, `${JSON.stringify(payload)}\n`);

    expect(readImportConformanceCachedResult(cache, fixture, importerHash)).toBeNull();
  });

  it('keeps readable legacy cache rows but reruns only unreadable rows without retained evidence', () => {
    const cache = mkdtempSync(join(tmpdir(), 'flight-import-cache-'));
    const importerHash = hash('importer-a');
    const readable = makeFixture('readable.swf');
    const unreadable = { ...makeFixture('unreadable.swf'), capabilities: [], probeState: 'unreadable' as const };
    writeImportConformanceCachedResult(cache, makeResult(readable), importerHash);
    writeImportConformanceCachedResult(
      cache,
      {
        caseHash: unreadable.caseHash,
        capabilityOutcomes: [],
        importOutcome: 'silentlyWrong',
        oracleOutcomes: [],
        outcome: 'silentlyWrong',
        reference: unreadable.reference,
      },
      importerHash,
    );

    expect(readImportConformanceCachedResult(cache, readable, importerHash)).toEqual(makeResult(readable));
    expect(readImportConformanceCachedResult(cache, unreadable, importerHash)).toBeNull();

    const retained: ImportConformanceResult = {
      caseHash: unreadable.caseHash,
      capabilityOutcomes: [],
      importOutcome: 'unsupportedClean',
      oracleOutcomes: [],
      outcome: 'unsupportedClean',
      probeUnreadableEvidence: {
        diagnostics: [
          {
            detail: { compression: 'lzma' },
            kind: 'swf.no-decompressor-registered',
            origin: 'uncompressSwfSource',
            severity: 'Reject',
          },
        ],
        imported: false,
        threw: false,
      },
      reference: unreadable.reference,
    };
    writeImportConformanceCachedResult(cache, retained, importerHash);
    expect(readImportConformanceCachedResult(cache, unreadable, importerHash)).toEqual(retained);
  });
});

describe('import conformance shard results', () => {
  it('retains missing shards instead of accepting a smaller result denominator', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-import-shards-'));
    const fixtures = [makeFixture('a.swf'), makeFixture('b.swf')];
    const plan = createImportConformanceShardPlan(fixtures, 2);
    writeImportConformanceShardResult(directory, plan, 0, [makeResult(fixtures[0]!)], hash('importer'));

    const loaded = readImportConformanceShardResults(directory, plan, fixtures, hash('importer'));
    expect([...loaded.completedShardIds]).toEqual([0]);
    expect(loaded.results.map((result) => result.reference)).toEqual(['a.swf']);
  });

  it('ignores stale or malformed shard artifacts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-import-shards-'));
    const fixtures = [makeFixture('a.swf')];
    const plan = createImportConformanceShardPlan(fixtures, 1);
    const path = join(directory, plan.planHash, '0.json');
    mkdirSync(join(directory, plan.planHash));
    writeFileSync(path, '{"schemaVersion":1,"planHash":"stale"}');
    expect(readImportConformanceShardResults(directory, plan, fixtures, hash('importer')).results).toEqual([]);
  });
});

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeFixture(reference: string): ImportConformanceIndexedFixture {
  return {
    capabilities: ['swf.fill.solid'],
    ...createImportConformanceSingleMemberCaseIdentity(reference, hash(reference)),
    probeState: 'readable',
  };
}

function makeResult(fixture: Readonly<ImportConformanceIndexedFixture>): ImportConformanceResult {
  return {
    caseHash: fixture.caseHash,
    capabilityOutcomes: [
      { diagnosticCause: 'separable', diagnosticReported: false, id: 'swf.fill.solid', outcome: 'passed' },
    ],
    importOutcome: 'passed',
    oracleOutcomes: [],
    outcome: 'passed',
    reference: fixture.reference,
  };
}
