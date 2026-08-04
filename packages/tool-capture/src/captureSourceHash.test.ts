import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getCaptureSceneSourceHash } from './captureSourceHash';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'capture-source-hash-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('getCaptureSceneSourceHash', () => {
  it('hashes the backend-specific functional scene when one exists', () => {
    const scenes = join(root, 'functional', 'scenes');
    mkdirSync(scenes, { recursive: true });
    writeFileSync(join(scenes, 'sample.ts'), 'shared');
    writeFileSync(join(scenes, 'sample.webgl.ts'), 'specific');

    expect(getCaptureSceneSourceHash(root, 'functional', { name: 'sample', renderers: ['webgl'] }, 'webgl')).toBe(
      sha256('specific'),
    );
  });

  it('hashes the backend-agnostic functional scene for a prefixed renderer', () => {
    const scenes = join(root, 'functional', 'scenes');
    mkdirSync(scenes, { recursive: true });
    writeFileSync(join(scenes, 'sample.ts'), 'shared');

    expect(
      getCaptureSceneSourceHash(root, 'functional', { name: 'sample', renderers: ['flight:webgl'] }, 'flight:webgl'),
    ).toBe(sha256('shared'));
  });

  it('hashes an example app as the shared scene source', () => {
    const source = join(root, 'examples', 'packages', 'clock', 'src');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'app.ts'), 'clock scene');

    expect(getCaptureSceneSourceHash(root, 'examples', { name: 'clock', renderers: ['canvas'] }, 'canvas')).toBe(
      sha256('clock scene'),
    );
  });

  it('returns null for an unknown subject or a missing scene', () => {
    expect(getCaptureSceneSourceHash(root, 'custom', { name: 'sample', renderers: ['canvas'] }, 'canvas')).toBeNull();
    expect(
      getCaptureSceneSourceHash(root, 'functional', { name: 'missing', renderers: ['canvas'] }, 'canvas'),
    ).toBeNull();
  });
});

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}
