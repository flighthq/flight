import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findExpectedImageDescriptionCellScope } from './check-expected-image-descriptions';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'expected-image-scope-'));
  mkdirSync(join(root, 'functional', 'scenes'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe('findExpectedImageDescriptionCellScope', () => {
  it('counts resolved renderer cells rather than backing scene files', () => {
    writeFileSync(join(root, 'functional', 'scenes', 'agnostic.ts'), 'createFunctionalTarget({});');
    writeFileSync(join(root, 'functional', 'scenes', 'overridden.ts'), 'createFunctionalTarget({});');
    writeFileSync(join(root, 'functional', 'scenes', 'overridden.webgl.ts'), 'createGlRenderTarget({});');
    writeFileSync(join(root, 'functional', 'scenes', 'specific.webgl.ts'), 'createGlRenderTarget({});');
    writeFileSync(join(root, 'functional', 'scenes', 'specific.webgpu.ts'), 'createFunctionalTarget({});');
    writeFileSync(
      join(root, 'functional', 'scenes', 'unreachable.dom.ts'),
      '// createFunctionalTarget({}) is not a call.\ncreateDomRenderTarget({});',
    );

    expect(findExpectedImageDescriptionCellScope(root)).toEqual({
      reachableCells: [
        'agnostic/dom',
        'agnostic/canvas',
        'agnostic/webgl',
        'agnostic/webgpu',
        'overridden/dom',
        'overridden/canvas',
        'overridden/webgpu',
        'specific/webgpu',
      ],
      structurallyUnableCells: ['overridden/webgl', 'specific/webgl', 'unreachable/dom'],
    });
  });
});
