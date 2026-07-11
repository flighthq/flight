import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baselinePath, getBaselineField, setBaselineField } from './baselineStore';

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

describe('setBaselineField', () => {
  it('preserves other fields and columns on a read-merge-write', () => {
    setBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint', 'fp');
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'hash');
    setBaselineField(root, 'functional', 'foo', 'webgl', 'sha256', 'hash2');

    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'fingerprint')).toBe('fp');
    expect(getBaselineField(root, 'functional', 'foo', 'canvas', 'sha256')).toBe('hash');
    expect(getBaselineField(root, 'functional', 'foo', 'webgl', 'sha256')).toBe('hash2');
  });

  it('writes sorted, prettier-compatible JSON with a trailing newline', () => {
    setBaselineField(root, 'functional', 'foo', 'webgl', 'sha256', 'h2');
    setBaselineField(root, 'functional', 'foo', 'canvas', 'sha256', 'h1');
    const text = readFileSync(baselinePath(root, 'functional', 'foo'), 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.indexOf('canvas')).toBeLessThan(text.indexOf('webgl'));
  });
});
