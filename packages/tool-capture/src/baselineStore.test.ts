import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  baselinePath,
  getBaselineField,
  getBaselineLegacyFingerprintSourceHash,
  getBaselineProvenance,
  setBaselineCaptureEvidence,
  setBaselineField,
  setBaselineProvenance,
} from './baselineStore';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tc-baseline-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('baselinePath', () => {
  it('maps known subjects to their suite root', () => {
    expect(baselinePath(root, 'functional', 'foo')).toBe(join(root, 'functional', 'baselines', 'foo.json'));
    expect(baselinePath(root, 'examples', 'bar')).toBe(join(root, 'examples', 'baselines', 'bar.json'));
  });

  it('falls back to the subject name for an unknown subject', () => {
    expect(baselinePath(root, 'other', 'foo')).toBe(join(root, 'other', 'baselines', 'foo.json'));
  });
});

describe('getBaselineField', () => {
  it('returns null when no baseline file exists', () => {
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBeNull();
  });

  it('reads back a written field', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'abc123');
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBe('abc123');
  });
});

describe('getBaselineProvenance', () => {
  it('reads back what was recorded, and reads a legacy column as UNKNOWN', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'abc123');
    // Written before provenance existed: null, not a claim that it matches anything.
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'sha256')).toBeNull();

    setBaselineProvenance(root, 'functional', 'foo', 'canvas', 'sha256', PROVENANCE);
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'sha256')).toEqual(PROVENANCE);
  });
});

describe('setBaselineCaptureEvidence', () => {
  it('writes fingerprint and sha256 atomically while preserving other columns', () => {
    setBaselineField(root, 'functional', 'foo', 'webgl', 'sha256', 'webgl-hash');

    setBaselineCaptureEvidence(root, 'functional', 'foo', 'canvas', {
      fingerprint: '2:000000ffffff',
      fingerprintProvenance: PROVENANCE,
      sha256: 'hash',
    });

    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBe('2:000000ffffff');
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'fingerprint')).toEqual(PROVENANCE);
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBe('hash');
    expect(getBaselineField(root, 'functional', 'foo', 'webgl', 'sha256')).toBe('webgl-hash');
  });

  it('replaces the full evidence column instead of retaining stale optional fields', () => {
    setBaselineCaptureEvidence(root, 'functional', 'foo', 'canvas', {
      fingerprint: '2:000000ffffff',
      fingerprintProvenance: PROVENANCE,
      sha256: 'old-hash',
    });

    setBaselineCaptureEvidence(root, 'functional', 'foo', 'canvas', {
      fingerprint: '2:111111eeeeee',
      sha256: 'new-hash',
    });

    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBe('2:111111eeeeee');
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBeNull();
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBe('new-hash');
  });

  it('refuses runtime callers that omit either half of the evidence pair', () => {
    expect(() =>
      setBaselineCaptureEvidence(root, 'functional', 'foo', 'canvas', {
        fingerprint: 'fp',
      } as never),
    ).toThrow(/fingerprint and sha256 must be written together/);
    expect(() =>
      setBaselineCaptureEvidence(root, 'functional', 'foo', 'canvas', {
        sha256: 'hash',
      } as never),
    ).toThrow(/fingerprint and sha256 must be written together/);
    expect(existsSync(baselinePath(root, 'functional', 'foo'))).toBe(false);
  });

  it('inherits the uniform-fingerprint refusal instead of blessing a stable blank shape', () => {
    expect(() =>
      setBaselineCaptureEvidence(root, 'functional', 'foo', 'canvas', {
        fingerprint: '2:eeeeeeeeeeee',
        sha256: 'hash',
      }),
    ).toThrow(/fingerprint is uniform/);
    expect(existsSync(baselinePath(root, 'functional', 'foo'))).toBe(false);
  });

  it('inherits the known-blank screenshot refusal instead of blessing a deterministic bad hash', () => {
    expect(() =>
      setBaselineCaptureEvidence(root, 'functional', 'foo', 'canvas', {
        fingerprint: '2:000000ffffff',
        sha256: 'a4f2105ecdefec94c5fe749c1dc5f2fb9dd74b9832cba0afcd3434f38c0380d0',
      }),
    ).toThrow(/sha256 is a known blank frame/);
    expect(existsSync(baselinePath(root, 'functional', 'foo'))).toBe(false);
  });

  it('refuses a pair whose two provenance records disagree', () => {
    expect(() =>
      setBaselineCaptureEvidence(root, 'functional', 'foo', 'canvas', {
        fingerprint: '2:000000ffffff',
        fingerprintProvenance: PROVENANCE,
        sha256: 'hash',
        sha256Provenance: OTHER_PROVENANCE,
      }),
    ).toThrow(/refusing split baseline provenance/);
    expect(existsSync(baselinePath(root, 'functional', 'foo'))).toBe(false);
  });
});

describe('setBaselineField', () => {
  it('preserves unrelated fields and columns on a read-merge-write', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', '2:000000ffffff', PROVENANCE);
    setBaselineField(root, 'functional', 'foo', 'webgl', 'sha256', 'hash2');

    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBe('2:000000ffffff');
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'fingerprint')).toEqual(PROVENANCE);
    expect(getBaselineField(root, 'functional', 'foo', 'webgl', 'sha256')).toBe('hash2');
  });

  describe('getBaselineLegacyFingerprintSourceHash', () => {
    it('keeps legacy fingerprint source evidence read-only until that column is rewritten', () => {
      const path = baselinePath(root, 'functional', 'foo');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({ canvas: { fingerprint: '2:000000ffffff', sourceHash: 'legacy-source' } }, null, 2) + '\n',
      );

      expect(getBaselineLegacyFingerprintSourceHash(root, 'functional', 'foo', 'canvas')).toBe('legacy-source');
      setBaselineField(root, 'functional', 'foo', 'webgl', 'sha256', 'other-column');
      expect(getBaselineLegacyFingerprintSourceHash(root, 'functional', 'foo', 'canvas')).toBe('legacy-source');
    });

    it('removes a legacy source hash only when replacing that column fingerprint', () => {
      const path = baselinePath(root, 'functional', 'foo');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify(
          {
            canvas: { fingerprint: '2:000000ffffff', sourceHash: 'legacy-canvas' },
            webgl: { fingerprint: '2:111111eeeeee', sourceHash: 'legacy-webgl' },
          },
          null,
          2,
        ) + '\n',
      );

      setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', '2:000000ffffff', PROVENANCE);
      expect(getBaselineLegacyFingerprintSourceHash(root, 'functional', 'foo', 'canvas')).toBeNull();
      expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'fingerprint')).toEqual(PROVENANCE);
      expect(getBaselineLegacyFingerprintSourceHash(root, 'functional', 'foo', 'webgl')).toBe('legacy-webgl');
    });
  });

  it('allows the normal sha256-only stage and a legacy join with unknown provenance', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'hash');
    setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', '2:000000ffffff');

    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBe('hash');
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBe('2:000000ffffff');
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'sha256')).toBeNull();
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBeNull();
  });

  it('allows a join when both provenance records agree', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'hash', PROVENANCE);
    setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', '2:000000ffffff', PROVENANCE);

    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBe('hash');
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBe('2:000000ffffff');
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'sha256')).toEqual(PROVENANCE);
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'fingerprint')).toEqual(PROVENANCE);
  });

  it('allows a join when either field has unknown provenance', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'hash', PROVENANCE);
    setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', '2:000000ffffff');

    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBe('2:000000ffffff');
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBeNull();
  });

  it('refuses a fingerprint join whose provenance differs and leaves the record byte-identical', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'hash', PROVENANCE);
    const path = baselinePath(root, 'functional', 'foo');
    const before = readFileSync(path, 'utf8');

    expect(() =>
      setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', '2:000000ffffff', OTHER_PROVENANCE),
    ).toThrow(/refusing split baseline provenance/);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('refuses a sha256 join whose provenance differs and leaves the record byte-identical', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', '2:000000ffffff', PROVENANCE);
    const path = baselinePath(root, 'functional', 'foo');
    const before = readFileSync(path, 'utf8');

    expect(() => setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'hash', OTHER_PROVENANCE)).toThrow(
      /refusing split baseline provenance/,
    );
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('clears stale same-field provenance when a caller writes without provenance', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'old-hash', PROVENANCE);
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'new-hash');

    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBe('new-hash');
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas', 'sha256')).toBeNull();
  });

  it('inherits the baseline sanity refusals on provenance-aware field writes', () => {
    expect(() =>
      setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', '2:eeeeeeeeeeee', PROVENANCE),
    ).toThrow(/fingerprint is uniform/);
    expect(() =>
      setBaselineField(
        root,
        'functional',
        'foo',
        'canvas',
        'sha256',
        'a4f2105ecdefec94c5fe749c1dc5f2fb9dd74b9832cba0afcd3434f38c0380d0',
        PROVENANCE,
      ),
    ).toThrow(/sha256 is a known blank frame/);
    expect(existsSync(baselinePath(root, 'functional', 'foo'))).toBe(false);
  });

  it('writes sorted, prettier-compatible JSON with a trailing newline', () => {
    setBaselineField(root, 'functional', 'foo', 'webgl', 'sha256', 'h2');
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'h1');
    const text = readFileSync(baselinePath(root, 'functional', 'foo'), 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.indexOf('canvas')).toBeLessThan(text.indexOf('webgl'));
  });
});

describe('setBaselineProvenance', () => {
  it('preserves the other fields and the other columns', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'abc123');
    setBaselineField(root, 'functional', 'foo', 'webgl', 'sha256', 'def456');

    setBaselineProvenance(root, 'functional', 'foo', 'canvas', 'sha256', PROVENANCE);

    // Read-merge-write: recording provenance on one column rewrites nothing else on disk.
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBe('abc123');
    expect(getBaselineField(root, 'functional', 'foo', 'webgl', 'sha256')).toBe('def456');
    expect(getBaselineProvenance(root, 'functional', 'foo', 'webgl', 'sha256')).toBeNull();
  });

  it('refuses to attach provenance that disagrees with the counterpart', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', '2:000000ffffff', PROVENANCE);
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'hash');
    const path = baselinePath(root, 'functional', 'foo');
    const before = readFileSync(path, 'utf8');

    expect(() => setBaselineProvenance(root, 'functional', 'foo', 'canvas', 'sha256', OTHER_PROVENANCE)).toThrow(
      /refusing split baseline provenance/,
    );
    expect(readFileSync(path, 'utf8')).toBe(before);
  });
});

const PROVENANCE = { frames: 0, sourceHash: null, targetKind: null, verifyPublished: true, warmupFrames: 0 };
const OTHER_PROVENANCE = { ...PROVENANCE, sourceHash: 'different-source' };
