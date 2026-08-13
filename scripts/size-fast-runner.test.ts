import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  compareFastSizes,
  getChangedFastSizes,
  getFastSizeGroupKey,
  getFastSizeNoiseThreshold,
  groupFastSizeCases,
  hashFastSizeTree,
  isFastSizeNoise,
  readFastSizeBaseline,
  readFastSizeCache,
  selectFastSizeUnit,
  stubFlightDiagnostics,
  writeFastSizeBaseline,
  writeFastSizeCache,
} from './size-fast-runner';
import type { SizeCase } from './size-runner';

function createCase(overrides: Partial<SizeCase> = {}): SizeCase {
  return { name: 'sample', render: 'canvas', root: '/repo/examples/packages/sample', variant: null, ...overrides };
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), 'flight-size-fast-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('compareFastSizes', () => {
  test('reports a delta for every key on either side', () => {
    expect(compareFastSizes({ 'a:canvas': 100, 'gone:dom': 50 }, { 'a:canvas': 125, 'new:webgl': 10 })).toEqual([
      { key: 'a:canvas', before: 100, after: 125, deltaBytes: 25, deltaPercent: 25 },
      { key: 'gone:dom', before: 50, after: null, deltaBytes: -50, deltaPercent: null },
      { key: 'new:webgl', before: null, after: 10, deltaBytes: 10, deltaPercent: null },
    ]);
  });

  test('leaves the percentage null when one side is missing rather than dividing by zero', () => {
    const [delta] = compareFastSizes({}, { 'new:canvas': 400 });
    expect(delta).toMatchObject({ before: null, deltaBytes: 400, deltaPercent: null });
  });
});

describe('getChangedFastSizes', () => {
  test('drops a delta inside the noise band', () => {
    const deltas = compareFastSizes({ same: 1000, jittered: 1000 }, { same: 1000, jittered: 1010 });
    expect(getChangedFastSizes(deltas)).toEqual([]);
  });

  test('keeps a delta that clears the band', () => {
    const deltas = compareFastSizes({ same: 1000, grew: 1000 }, { same: 1000, grew: 1400 });
    expect(getChangedFastSizes(deltas).map((delta) => delta.key)).toEqual(['grew']);
  });

  test('keeps a shrink, so a stale baseline is detectable in both directions', () => {
    const deltas = compareFastSizes({ shrank: 1000 }, { shrank: 600 });
    expect(getChangedFastSizes(deltas).map((delta) => delta.key)).toEqual(['shrank']);
  });
});

describe('getFastSizeNoiseThreshold', () => {
  test('floors at the byte constant for bundles too small for the percentage', () => {
    expect(getFastSizeNoiseThreshold(1000)).toBe(32);
  });

  test('lets the percentage take over once the bundle is large enough', () => {
    expect(getFastSizeNoiseThreshold(51000)).toBeCloseTo(127.5);
  });
});

describe('getFastSizeGroupKey', () => {
  test('separates renderers, since the ./render alias is build-wide', () => {
    expect(getFastSizeGroupKey(createCase({ render: 'canvas' }))).not.toBe(
      getFastSizeGroupKey(createCase({ render: 'webgl' })),
    );
  });

  test('separates the diagnostics variant, which keeps the call the others stub', () => {
    expect(getFastSizeGroupKey(createCase({ variant: 'diagnostics' }))).toBe('canvas|diagnostics|console');
    expect(getFastSizeGroupKey(createCase())).toBe('canvas|stubbed|dropped');
  });

  test('keeps console for the log-console sample, which exists to measure it', () => {
    expect(getFastSizeGroupKey(createCase({ root: '/repo/tools/size/fixtures/log-console' }))).toBe(
      'canvas|stubbed|console',
    );
  });
});

describe('groupFastSizeCases', () => {
  test('collects every case sharing a build configuration into one group', () => {
    const groups = groupFastSizeCases([
      createCase({ name: 'a', render: 'canvas' }),
      createCase({ name: 'b', render: 'canvas' }),
      createCase({ name: 'c', render: 'webgl' }),
    ]);
    expect([...groups.keys()]).toEqual(['canvas|stubbed|dropped', 'webgl|stubbed|dropped']);
    expect(groups.get('canvas|stubbed|dropped')).toHaveLength(2);
  });
});

describe('hashFastSizeTree', () => {
  test('ignores entry order so the same tree hashes the same way', () => {
    expect(hashFastSizeTree(['a', 'b'])).toBe(hashFastSizeTree(['b', 'a']));
  });

  test('separates entries so concatenation cannot collide', () => {
    expect(hashFastSizeTree(['ab', 'c'])).not.toBe(hashFastSizeTree(['a', 'bc']));
  });
});

describe('isFastSizeNoise', () => {
  test('treats a small movement on an unchanged case as noise', () => {
    const [delta] = compareFastSizes({ a: 1000 }, { a: 1010 });
    expect(isFastSizeNoise(delta)).toBe(true);
  });

  test('never calls an appearing case noise, however few bytes it is', () => {
    const [delta] = compareFastSizes({}, { a: 4 });
    expect(isFastSizeNoise(delta)).toBe(false);
  });

  test('never calls a disappearing case noise', () => {
    const [delta] = compareFastSizes({ a: 4 }, {});
    expect(isFastSizeNoise(delta)).toBe(false);
  });
});

describe('readFastSizeBaseline', () => {
  test('returns an empty map when no baseline has been recorded', () => {
    expect(readFastSizeBaseline(resolve(createTemporaryDirectory(), 'absent.json'))).toEqual({});
  });
});

describe('readFastSizeCache', () => {
  test('returns null for a tree that was never measured', () => {
    expect(readFastSizeCache(createTemporaryDirectory(), 'absent')).toBeNull();
  });
});

describe('selectFastSizeUnit', () => {
  test('projects one unit so a comparison cannot mix raw against gzip', () => {
    const sizes = { 'a:canvas': { raw: 900, gzip: 300 }, 'b:dom': { raw: 500, gzip: 200 } };
    expect(selectFastSizeUnit(sizes, 'gzip')).toEqual({ 'a:canvas': 300, 'b:dom': 200 });
    expect(selectFastSizeUnit(sizes, 'raw')).toEqual({ 'a:canvas': 900, 'b:dom': 500 });
  });
});

describe('stubFlightDiagnostics', () => {
  test('replaces the call while preserving its argument expression', () => {
    expect(stubFlightDiagnostics('enableFlightDiagnostics(state);')).toBe('void (state);');
  });

  test('leaves source without the call untouched', () => {
    expect(stubFlightDiagnostics('const x = 1;')).toBe('const x = 1;');
  });
});

describe('writeFastSizeBaseline', () => {
  test('round-trips through the baseline file', () => {
    const file = resolve(createTemporaryDirectory(), 'size.unminified.baseline.json');
    writeFastSizeBaseline(file, { 'a:canvas': 300, 'b:dom': 200 });
    expect(readFastSizeBaseline(file)).toEqual({ 'a:canvas': 300, 'b:dom': 200 });
  });

  test('gives every key its own line, which per-key git blame provenance depends on', () => {
    const file = resolve(createTemporaryDirectory(), 'size.unminified.baseline.json');
    writeFastSizeBaseline(file, { 'a:canvas': 300, 'b:dom': 200, 'c:webgl': 100 });
    const keyLines = readFileSync(file, 'utf-8')
      .split('\n')
      .filter((line) => line.includes(':'));
    expect(keyLines).toHaveLength(3);
    expect(keyLines[0]).toBe('  "a:canvas": 300,');
  });
});

describe('writeFastSizeCache', () => {
  test('round-trips a measurement through the cache directory', () => {
    const directory = createTemporaryDirectory();
    writeFastSizeCache(directory, { sizes: { 'a:canvas': { raw: 120, gzip: 42 } }, treeId: 'abc123' });
    expect(readFastSizeCache(directory, 'abc123')).toEqual({ 'a:canvas': { raw: 120, gzip: 42 } });
  });

  test('creates the cache directory when it does not exist yet', () => {
    const directory = resolve(createTemporaryDirectory(), 'nested', 'cache');
    writeFastSizeCache(directory, { sizes: {}, treeId: 'deep' });
    expect(readFastSizeCache(directory, 'deep')).toEqual({});
  });
});
