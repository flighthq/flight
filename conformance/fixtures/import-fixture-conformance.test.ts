import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

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
});
