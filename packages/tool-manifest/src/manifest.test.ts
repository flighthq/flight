import { createManifest, getManifestFeatures, readManifest, validateManifest, writeManifest } from './manifest.js';

describe('createManifest', () => {
  it('sorts and de-duplicates ids so the same build always writes the same bytes', () => {
    const manifest = createManifest({ tags: ['shape', 'bitmap', 'shape'] });
    expect(manifest.features.tags).toEqual(['bitmap', 'shape']);
  });

  it('orders groups and settings by key', () => {
    const manifest = createManifest({ zeta: ['b'], alpha: ['a'] }, { zoom: 2, alpha: 'x' });
    expect(Object.keys(manifest.features)).toEqual(['alpha', 'zeta']);
    expect(Object.keys(manifest.settings)).toEqual(['alpha', 'zoom']);
  });

  it('yields the empty manifest with no arguments, which is the union identity', () => {
    expect(createManifest()).toEqual({ features: {}, schemaVersion: 1, settings: {} });
  });
});

describe('getManifestFeatures', () => {
  it('returns a group it declares', () => {
    expect(getManifestFeatures(createManifest({ tags: ['a'] }), 'tags')).toEqual(['a']);
  });

  it('returns empty for a group it does not declare, rather than undefined', () => {
    expect(getManifestFeatures(createManifest(), 'absent')).toEqual([]);
  });
});

describe('readManifest', () => {
  it('round-trips what writeManifest produced', () => {
    const manifest = createManifest({ tags: ['shape'] }, { strict: true });
    expect(readManifest(writeManifest(manifest)).manifest).toEqual(manifest);
  });

  it('reports invalid JSON as a problem rather than throwing', () => {
    const result = readManifest('{ not json');
    expect(result.manifest).toBeNull();
    expect(result.problems[0]).toContain('not valid JSON');
  });
});

describe('validateManifest', () => {
  it('rejects a non-object', () => {
    expect(validateManifest([]).problems).toEqual(['manifest must be an object']);
  });

  it('rejects a wrong schema version', () => {
    expect(validateManifest({ schemaVersion: 2 }).problems[0]).toContain('schemaVersion must be 1');
  });

  it('collects every problem in one pass, so one run lists all of them', () => {
    const result = validateManifest({ schemaVersion: 2, features: { tags: [1] }, settings: { a: {} } });
    expect(result.manifest).toBeNull();
    expect(result.problems).toHaveLength(3);
  });

  it('accepts a manifest that omits the optional maps', () => {
    expect(validateManifest({ schemaVersion: 1 }).manifest).toEqual(createManifest());
  });
});

describe('writeManifest', () => {
  it('ends with a newline so the file is well formed for diffing', () => {
    expect(writeManifest(createManifest())).toMatch(/\n$/u);
  });
});
