import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  baselinePath,
  getBaselineField,
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
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas')).toBeNull();

    setBaselineProvenance(root, 'functional', 'foo', 'canvas', PROVENANCE);
    expect(getBaselineProvenance(root, 'functional', 'foo', 'canvas')).toEqual(PROVENANCE);
  });
});

describe('setBaselineCaptureEvidence', () => {
  it('writes fingerprint and sha256 atomically while preserving other columns', () => {
    setBaselineField(root, 'functional', 'foo', 'webgl', 'sha256', 'webgl-hash');

    setBaselineCaptureEvidence(root, 'functional', 'foo', 'canvas', {
      fingerprint: 'fp',
      sourceHash: 'source',
      sha256: 'hash',
    });

    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBe('fp');
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sourceHash')).toBe('source');
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBe('hash');
    expect(getBaselineField(root, 'functional', 'foo', 'webgl', 'sha256')).toBe('webgl-hash');
  });

  it('replaces the full evidence column instead of retaining stale optional fields', () => {
    setBaselineCaptureEvidence(root, 'functional', 'foo', 'canvas', {
      fingerprint: 'old-fp',
      sourceHash: 'old-source',
      sha256: 'old-hash',
    });

    setBaselineCaptureEvidence(root, 'functional', 'foo', 'canvas', {
      fingerprint: 'new-fp',
      sha256: 'new-hash',
    });

    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBe('new-fp');
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sourceHash')).toBeNull();
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
});

describe('setBaselineField', () => {
  it('preserves unrelated fields and columns on a read-merge-write', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', 'fp');
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sourceHash', 'source');
    setBaselineField(root, 'functional', 'foo', 'webgl', 'sha256', 'hash2');

    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBe('fp');
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sourceHash')).toBe('source');
    expect(getBaselineField(root, 'functional', 'foo', 'webgl', 'sha256')).toBe('hash2');
  });

  it('refuses to append sha256 to a separately written fingerprint', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', 'fp');

    expect(() => setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'hash')).toThrow(
      /refusing partial baseline write.*sha256.*fingerprint exists/,
    );
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBe('fp');
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBeNull();
  });

  it('refuses to append a fingerprint to a separately written sha256', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'hash');

    expect(() => setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', 'fp')).toThrow(
      /refusing partial baseline write.*fingerprint.*sha256 exists/,
    );
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBe('hash');
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBeNull();
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

    setBaselineProvenance(root, 'functional', 'foo', 'canvas', PROVENANCE);

    // Read-merge-write: recording provenance on one column rewrites nothing else on disk.
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBe('abc123');
    expect(getBaselineField(root, 'functional', 'foo', 'webgl', 'sha256')).toBe('def456');
    expect(getBaselineProvenance(root, 'functional', 'foo', 'webgl')).toBeNull();
  });
});

const PROVENANCE = { frames: 0, sourceHash: null, targetKind: null, verifyPublished: true, warmupFrames: 0 };
