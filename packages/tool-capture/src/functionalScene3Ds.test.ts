import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discoverFunctionalScene3Ds, functionalScene3DFile, resolveFunctionalTestRoute } from './functionalScene3Ds';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tc-scenes-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const touch = (name: string): void => writeFileSync(join(dir, name), '');

describe('discoverFunctionalScene3Ds', () => {
  it('returns an empty list for a missing directory', () => {
    expect(discoverFunctionalScene3Ds(join(dir, 'nope'))).toEqual([]);
  });

  it('runs a backend-agnostic scene on every default backend', () => {
    touch('foo.ts');
    expect(discoverFunctionalScene3Ds(dir)).toEqual([{ name: 'foo', renderers: ['dom', 'canvas', 'webgl', 'webgpu'] }]);
  });

  it('keeps every default backend when one has a specific-file override', () => {
    touch('foo.ts');
    touch('foo.dom.ts');
    expect(discoverFunctionalScene3Ds(dir)).toEqual([{ name: 'foo', renderers: ['dom', 'canvas', 'webgl', 'webgpu'] }]);
  });

  it('collects backend-specific files into one entry in default-backend order', () => {
    touch('bar.webgl.ts');
    touch('bar.canvas.ts');
    expect(discoverFunctionalScene3Ds(dir)).toEqual([{ name: 'bar', renderers: ['canvas', 'webgl'] }]);
  });

  it('ignores non-ts files and sorts by name', () => {
    touch('zed.ts');
    touch('alpha.ts');
    touch('README.md');
    expect(discoverFunctionalScene3Ds(dir).map((s) => s.name)).toEqual(['alpha', 'zed']);
  });
});

describe('functionalScene3DFile', () => {
  it('prefers the backend-specific file when it exists', () => {
    touch('bar.ts');
    touch('bar.webgl.ts');
    expect(functionalScene3DFile(dir, 'bar', 'webgl')).toBe(join(dir, 'bar.webgl.ts'));
  });

  it('falls back to the backend-agnostic file', () => {
    touch('bar.ts');
    expect(functionalScene3DFile(dir, 'bar', 'webgl')).toBe(join(dir, 'bar.ts'));
  });
});

describe('resolveFunctionalTestRoute', () => {
  it('returns serve when the scene has the requested backend', () => {
    touch('bar.webgl.ts');
    touch('bar.canvas.ts');
    const tests = discoverFunctionalScene3Ds(dir);
    const result = resolveFunctionalTestRoute(tests, 'bar', 'webgl');
    expect(result).toEqual({ kind: 'serve', test: { name: 'bar', renderers: ['canvas', 'webgl'] } });
  });

  it('returns unavailable when the scene exists but lacks the requested backend', () => {
    touch('bar.webgl.ts');
    touch('bar.canvas.ts');
    const tests = discoverFunctionalScene3Ds(dir);
    const result = resolveFunctionalTestRoute(tests, 'bar', 'dom');
    expect(result.kind).toBe('unavailable');
    expect(result.kind === 'unavailable' && result.scene.renderers).toEqual(['canvas', 'webgl']);
  });

  it('returns unknown when no scene matches the name', () => {
    touch('bar.webgl.ts');
    const tests = discoverFunctionalScene3Ds(dir);
    expect(resolveFunctionalTestRoute(tests, 'nonexistent', 'webgl').kind).toBe('unknown');
  });
});
