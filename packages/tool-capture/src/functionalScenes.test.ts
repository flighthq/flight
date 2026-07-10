import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discoverFunctionalScenes, functionalSceneFile } from './functionalScenes';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tc-scenes-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const touch = (name: string): void => writeFileSync(join(dir, name), '');

describe('discoverFunctionalScenes', () => {
  it('returns an empty list for a missing directory', () => {
    expect(discoverFunctionalScenes(join(dir, 'nope'))).toEqual([]);
  });

  it('runs a backend-agnostic scene on every default backend', () => {
    touch('foo.ts');
    expect(discoverFunctionalScenes(dir)).toEqual([{ name: 'foo', renderers: ['dom', 'canvas', 'webgl', 'webgpu'] }]);
  });

  it('collects backend-specific files into one entry in default-backend order', () => {
    touch('bar.webgl.ts');
    touch('bar.canvas.ts');
    expect(discoverFunctionalScenes(dir)).toEqual([{ name: 'bar', renderers: ['canvas', 'webgl'] }]);
  });

  it('ignores non-ts files and sorts by name', () => {
    touch('zed.ts');
    touch('alpha.ts');
    touch('README.md');
    expect(discoverFunctionalScenes(dir).map((s) => s.name)).toEqual(['alpha', 'zed']);
  });
});

describe('functionalSceneFile', () => {
  it('prefers the backend-specific file when it exists', () => {
    touch('bar.webgl.ts');
    expect(functionalSceneFile(dir, 'bar', 'webgl')).toBe(join(dir, 'bar.webgl.ts'));
  });

  it('falls back to the backend-agnostic file', () => {
    touch('bar.ts');
    expect(functionalSceneFile(dir, 'bar', 'webgl')).toBe(join(dir, 'bar.ts'));
  });
});
