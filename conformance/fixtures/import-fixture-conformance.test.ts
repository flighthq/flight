import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FIXTURE_RELEASE_TAG, writeFixtureTreeStamp } from '../../scripts/fixtures';
import { parseImportFixtureConformanceArguments, runImportFixtureConformance } from './import-fixture-conformance';

let fixtureCache = '';

afterEach(() => {
  if (fixtureCache !== '') rmSync(fixtureCache, { force: true, recursive: true });
  fixtureCache = '';
  delete process.env['FLIGHT_FIXTURES_DIR'];
});

describe('parseImportFixtureConformanceArguments', () => {
  it('keeps repeatable selections stable and deduplicated', () => {
    expect(
      parseImportFixtureConformanceArguments([
        '--pack=spine-fixtures',
        '--pack',
        'spine-fixtures',
        '--adapter',
        'skeleton2d-json',
        '--variant=full',
        '--limit',
        '20',
        '--concurrency=3',
      ]),
    ).toMatchObject({
      adapters: ['skeleton2d-json'],
      concurrency: 3,
      limit: 20,
      packs: ['spine-fixtures'],
      variant: 'full',
    });
  });

  it('rejects missing values, unknown options, and non-positive limits', () => {
    expect(() => parseImportFixtureConformanceArguments(['--pack'])).toThrow('--pack requires a value');
    expect(() => parseImportFixtureConformanceArguments(['--limit=0'])).toThrow('positive integer');
    expect(() => parseImportFixtureConformanceArguments(['--unknown'])).toThrow('Unknown fixture conformance');
  });
});

describe('runImportFixtureConformance', () => {
  it('fails loudly when no verified corpus is available', async () => {
    fixtureCache = mkdtempSync(join(tmpdir(), 'flight-fixture-conformance-absent-'));
    process.env['FLIGHT_FIXTURES_DIR'] = fixtureCache;
    const args = parseImportFixtureConformanceArguments([]);

    await expect(runImportFixtureConformance(args)).rejects.toThrow('No verified fixture trees are available');
  });

  it('names a specifically requested pack that is unavailable', async () => {
    fixtureCache = mkdtempSync(join(tmpdir(), 'flight-fixture-conformance-absent-'));
    process.env['FLIGHT_FIXTURES_DIR'] = fixtureCache;
    const args = parseImportFixtureConformanceArguments(['--pack', 'spine-fixtures']);

    await expect(runImportFixtureConformance(args)).rejects.toThrow(
      'Verified fixture pack unavailable: spine-fixtures',
    );
  });

  it('records an unavailable Flight implementation as a zero implementation score rather than failing', async () => {
    const directory = makeTree('model-fixtures', 1);
    write(directory, 'source.fbx', 'fixture');
    const args = parseImportFixtureConformanceArguments(['--pack', 'model-fixtures', '--adapter', 'fbx']);

    const report = await runImportFixtureConformance(args);

    expect(report.results).toMatchObject([
      { adapter: 'fbx', notRunReason: 'flight-importer-unavailable', state: 'not-run' },
    ]);
    expect(report.schemaVersion).toBe(4);
    expect(report.score.files).toMatchObject({
      acceptedCoverage: { denominator: 1, numerator: 0, state: 'measured', value: 0 },
      attemptedFiles: 1,
      completedFiles: 0,
      corpusFiles: 1,
    });
    expect(report.score.implementationCoverage).toEqual({
      denominator: 1,
      numerator: 0,
      state: 'measured',
      value: 0,
    });
    expect(report.score.executionCoverage).toEqual({
      denominator: 0,
      numerator: 0,
      state: 'not-measured',
      value: null,
    });
  });

  it('records a verified tree with no matching family as a not-measured score', async () => {
    const directory = makeTree('future-fixtures', 1);
    write(directory, 'source.future', 'fixture');
    const args = parseImportFixtureConformanceArguments(['--pack', 'future-fixtures']);

    const report = await runImportFixtureConformance(args);

    expect(report.results).toEqual([]);
    expect(report.score.selectionCoverage).toEqual({
      denominator: 0,
      numerator: 0,
      state: 'not-measured',
      value: null,
    });
    expect(report.score.files.selectionCoverage).toEqual({
      denominator: 1,
      numerator: 0,
      state: 'measured',
      value: 0,
    });
    expect(report.score.features.workingAsExpected).toEqual({
      denominator: 0,
      numerator: 0,
      state: 'not-measured',
      value: null,
    });
    expect(report.trees).toMatchObject([{ candidateRuns: 0, fixtureFiles: 1, matchedFixtureFiles: 0 }]);
  });

  it('rejects a tree whose live fixture count differs from its verified stamp', async () => {
    const directory = makeTree('model-fixtures', 2);
    write(directory, 'source.fbx', 'fixture');
    const args = parseImportFixtureConformanceArguments(['--pack', 'model-fixtures']);

    await expect(runImportFixtureConformance(args)).rejects.toThrow('no longer matches its verified stamp');
  });
});

function makeTree(pack: string, verifiedFixtureFiles: number): string {
  fixtureCache = mkdtempSync(join(tmpdir(), 'flight-fixture-conformance-present-'));
  process.env['FLIGHT_FIXTURES_DIR'] = fixtureCache;
  const directory = join(fixtureCache, 'extracted', 'full', pack);
  writeFixtureTreeStamp(directory, {
    packs: [
      {
        file: `${pack}-full-${FIXTURE_RELEASE_TAG}.tar.gz`,
        metadataFiles: 0,
        pack,
        sha256: 'a'.repeat(64),
        verifiedFixtureFiles,
      },
    ],
    tag: FIXTURE_RELEASE_TAG,
    variant: 'full',
  });
  return directory;
}

function write(root: string, reference: string, text: string): void {
  const path = join(root, ...reference.split('/'));
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text, 'utf8');
}
