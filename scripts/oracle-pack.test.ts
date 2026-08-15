import { createHash } from 'node:crypto';

import { getOracleAssetUrl, verifyOraclePackBytes, verifyOracleRelease } from './oracle-pack';
import type { OracleLock } from './oracle-records';

// ★ EVERY CASE HERE IS A SUPPLY-CHAIN FAULT WEARING A RENDER REGRESSION'S CLOTHES. Each asserts that the
// fault is named for what actually broke, because the failure mode this module exists to prevent is a
// truncated download being reported as "the renderer changed" to someone who then goes and reads a shader.

describe('getOracleAssetUrl', () => {
  it('builds the asset URL from the pinned tag, never a floating one', () => {
    expect(getOracleAssetUrl(lock(), 'pack.tgz')).toBe(
      'https://github.com/flighthq/flight-oracles/releases/download/tag-1/pack.tgz',
    );
  });
});

describe('verifyOraclePackBytes', () => {
  it('accepts bytes that hash to the pinned value', () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(verifyOraclePackBytes(bytes, { file: 'p.tgz', sha256: sha(bytes) })).toBeNull();
  });

  it('names a checksum failure rather than returning the bytes anyway', () => {
    const problem = verifyOraclePackBytes(new Uint8Array([1, 2, 3]), { file: 'p.tgz', sha256: 'a'.repeat(64) });

    expect(problem?.kind).toBe('checksum');
    // Both hashes appear, so a reader can tell a stale lock from a corrupted transfer without re-running.
    expect(problem?.detail).toContain(sha(new Uint8Array([1, 2, 3])));
    expect(problem?.detail).toContain('a'.repeat(64));
  });
});

describe('verifyOracleRelease', () => {
  it('returns the pinned packs with the release metadata attached', () => {
    const bytes = manifest({ packs: [pack()], releaseTag: 'tag-1' });
    const result = verifyOracleRelease(bytes, lock({ manifestSha256: sha(bytes) }));

    expect('packs' in result && result.packs.map((p) => p.id)).toEqual(['functional-shapes']);
    expect('packs' in result && result.packs[0]?.imageCount).toBe(1);
  });

  // ★ THE MANIFEST IS EXACTLY THE FILE A SUBSTITUTION WOULD ALSO REPLACE. Checking packs against a
  // manifest nobody checked would be theatre, so this must fail before the manifest is even parsed.
  it('rejects a manifest whose bytes do not match the lock, before parsing it', () => {
    const result = verifyOracleRelease(manifest({ packs: [pack()], releaseTag: 'tag-1' }), lock());

    expect('problems' in result && result.problems.map((p) => p.kind)).toEqual(['checksum']);
  });

  it('names a manifest that does not parse', () => {
    const bytes = new TextEncoder().encode('{ not json');
    const result = verifyOracleRelease(bytes, lock({ manifestSha256: sha(bytes) }));

    expect('problems' in result && result.problems[0]?.kind).toBe('not-json');
  });

  // ★ THE FIRING TEST FOR A RE-CUT RELEASE UNDER A REUSED TAG. Lock and release both name the pack; the
  // bytes differ. Without this the newer asset downloads cleanly, verifies against its own manifest, and
  // every comparison reports a regression Flight did not cause.
  it('rejects a pack the release publishes with different bytes than the lock pins', () => {
    const bytes = manifest({ packs: [pack({ sha256: 'b'.repeat(64) })], releaseTag: 'tag-1' });
    const result = verifyOracleRelease(bytes, lock({ manifestSha256: sha(bytes) }));

    expect('problems' in result && result.problems.map((p) => p.kind)).toEqual(['pack-mismatch']);
  });

  it('rejects a pack the release renamed but did not re-hash', () => {
    const bytes = manifest({ packs: [pack({ file: 'renamed.tgz' })], releaseTag: 'tag-1' });
    const result = verifyOracleRelease(bytes, lock({ manifestSha256: sha(bytes) }));

    expect('problems' in result && result.problems.map((p) => p.kind)).toEqual(['pack-mismatch']);
  });

  it('names a pack the lock pins and the release does not publish', () => {
    const bytes = manifest({ packs: [], releaseTag: 'tag-1' });
    const result = verifyOracleRelease(bytes, lock({ manifestSha256: sha(bytes) }));

    expect('problems' in result && result.problems.map((p) => p.kind)).toEqual(['pack-absent']);
  });

  // ★ REPORT EVERY FAULT, NOT THE FIRST. A stale lock usually breaks in several places at once, and
  // naming one per CI run turns a single diagnosis into a sequence of them.
  it('reports a tag mismatch alongside the pack faults rather than instead of them', () => {
    const bytes = manifest({ packs: [], releaseTag: 'tag-2' });
    const result = verifyOracleRelease(bytes, lock({ manifestSha256: sha(bytes) }));

    expect('problems' in result && result.problems.map((p) => p.kind)).toEqual(['tag-mismatch', 'pack-absent']);
  });

  it('names a release pack missing the fields the check depends on', () => {
    const bytes = manifest({ packs: [{ id: 'functional-shapes' }], releaseTag: 'tag-1' });
    const result = verifyOracleRelease(bytes, lock({ manifestSha256: sha(bytes) }));

    expect('problems' in result && result.problems.map((p) => p.kind)).toEqual(['field-missing', 'pack-absent']);
  });
});

function lock(overrides: Partial<OracleLock> = {}): OracleLock {
  return {
    manifestSha256: 'f'.repeat(64),
    oracleCommit: '0'.repeat(40),
    packs: { 'functional-shapes': { file: 'pack.tgz', sha256: 'c'.repeat(64) } },
    releaseTag: 'tag-1',
    repository: 'flighthq/flight-oracles',
    schemaVersion: 1,
    ...overrides,
  };
}

function pack(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { file: 'pack.tgz', id: 'functional-shapes', imageCount: 1, sha256: 'c'.repeat(64), size: 10, ...overrides };
}

function manifest(value: Readonly<Record<string, unknown>>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function sha(bytes: Readonly<Uint8Array>): string {
  return createHash('sha256').update(bytes).digest('hex');
}
