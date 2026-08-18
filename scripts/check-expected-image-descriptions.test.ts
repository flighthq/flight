import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  describeExcludedPopulation,
  findExpectedImageDescriptionCellScope,
  findScenesWithoutExpectedImageDescription,
} from './check-expected-image-descriptions';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'expected-image-scope-'));
  mkdirSync(join(root, 'functional', 'scenes'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe('describeExcludedPopulation', () => {
  it('returns a zero message for an empty population', () => {
    expect(describeExcludedPopulation([])).toBe('0 structurally unable');
  });

  it('names a single dominant group', () => {
    expect(describeExcludedPopulation(['effect-blur/webgl', 'effect-bloom/webgl'])).toBe(
      '2 structurally unable — all effect scenes',
    );
  });

  it('breaks down the top three groups with a remainder', () => {
    const cells = [
      'effect-blur/webgl',
      'effect-bloom/webgl',
      'effect-bloom/webgpu',
      'material-basic/webgl',
      'material-basic/webgpu',
      'mesh-cube/webgl',
      'shadow-spot/webgl',
    ];
    expect(describeExcludedPopulation(cells)).toBe('7 structurally unable (3 effect, 2 material, 1 mesh, 1 other)');
  });
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

  it('treats declareExpectedImageDescription as description-capable', () => {
    writeFileSync(
      join(root, 'functional', 'scenes', 'effect-bloom.webgl.ts'),
      'declareExpectedImageDescription("bloom halo"); beginGlRenderEffectPipeline(state, pipeline);',
    );

    const { reachableCells, structurallyUnableCells } = findExpectedImageDescriptionCellScope(root);
    expect(reachableCells).toContain('effect-bloom/webgl');
    expect(structurallyUnableCells).not.toContain('effect-bloom/webgl');
  });
});

describe('findScenesWithoutExpectedImageDescription', () => {
  it('reports scenes that use createFunctionalTarget but lack the field', () => {
    const scenesDir = join(root, 'functional', 'scenes');
    writeFileSync(
      join(scenesDir, 'has-description.ts'),
      'createFunctionalTarget({ expectedImageDescription: "test" });',
    );
    writeFileSync(join(scenesDir, 'missing-description.ts'), 'createFunctionalTarget({});');
    writeFileSync(join(scenesDir, 'not-functional.ts'), 'createGlRenderTarget({});');

    const missing = findScenesWithoutExpectedImageDescription(scenesDir);
    expect(missing).toEqual(['missing-description']);
  });

  it('returns empty when all functional scenes have descriptions', () => {
    const scenesDir = join(root, 'functional', 'scenes');
    writeFileSync(join(scenesDir, 'complete.ts'), 'createFunctionalTarget({ expectedImageDescription: "done" });');

    expect(findScenesWithoutExpectedImageDescription(scenesDir)).toEqual([]);
  });

  it('reports scenes using declareExpectedImageDescription without the field', () => {
    const scenesDir = join(root, 'functional', 'scenes');
    writeFileSync(
      join(scenesDir, 'has-declare.webgl.ts'),
      'declareExpectedImageDescription("bloom"); beginGlRenderEffectPipeline(state, pipeline);',
    );
    writeFileSync(
      join(scenesDir, 'missing-declare.webgl.ts'),
      'declareExpectedImageDescription(""); beginGlRenderEffectPipeline(state, pipeline);',
    );

    const missing = findScenesWithoutExpectedImageDescription(scenesDir);
    expect(missing).toEqual([]);
  });
});
