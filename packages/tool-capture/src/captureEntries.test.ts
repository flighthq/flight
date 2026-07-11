import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discoverEntries, rendererMatchesFilter, routeSegment } from './captureEntries';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tc-entries-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('discoverEntries', () => {
  it('discovers functional scenes under functional/scenes', () => {
    mkdirSync(join(root, 'functional', 'scenes'), { recursive: true });
    writeFileSync(join(root, 'functional', 'scenes', 'foo.ts'), '');
    expect(discoverEntries('functional', root)).toEqual([
      { name: 'foo', renderers: ['dom', 'canvas', 'webgl', 'webgpu'] },
    ]);
  });

  it('discovers example packages by their render.<backend>.ts files', () => {
    const exDir = join(root, 'examples', 'packages', 'demo', 'src');
    mkdirSync(exDir, { recursive: true });
    writeFileSync(join(root, 'examples', 'packages', 'demo', 'package.json'), '{}');
    writeFileSync(join(exDir, 'render.canvas.ts'), '');
    writeFileSync(join(exDir, 'render.webgl.ts'), '');
    expect(discoverEntries('examples', root)).toEqual([{ name: 'demo', renderers: ['canvas', 'webgl'] }]);
  });
});

describe('rendererMatchesFilter', () => {
  it('matches everything when the filter is empty', () => {
    expect(rendererMatchesFilter('webgl', [])).toBe(true);
  });

  it('matches on the full id or the backend after a library colon', () => {
    expect(rendererMatchesFilter('flight:webgl', ['webgl'])).toBe(true);
    expect(rendererMatchesFilter('webgl', ['webgl'])).toBe(true);
    expect(rendererMatchesFilter('webgl', ['canvas'])).toBe(false);
  });
});

describe('routeSegment', () => {
  it('replaces a library colon with a dash and passes plain ids through', () => {
    expect(routeSegment('flight:webgl')).toBe('flight-webgl');
    expect(routeSegment('canvas')).toBe('canvas');
  });
});
