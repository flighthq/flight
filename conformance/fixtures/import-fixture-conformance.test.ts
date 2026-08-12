import { describe, expect, it } from 'vitest';

import { parseImportFixtureConformanceArguments } from './import-fixture-conformance';

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
