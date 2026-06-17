import { ColorTransformMaterialKind, UniformColorTransformMaterialKind } from '@flighthq/types';

import {
  colorTransformWebGPUMaterialRenderer,
  registerWebGPUColorTransformMaterials,
  uniformColorTransformWebGPUMaterialRenderer,
} from './webgpuColorTransformMaterial';
import { getWebGPUMaterialRenderer } from './webgpuMaterialRegistry';

function makeColorTransform(redMultiplier: number) {
  return {
    redMultiplier,
    greenMultiplier: 1,
    blueMultiplier: 1,
    alphaMultiplier: 1,
    redOffset: 0,
    greenOffset: 0,
    blueOffset: 0,
    alphaOffset: 0,
  };
}

describe('colorTransformWebGPUMaterialRenderer', () => {
  it('declares 8 per-instance floats', () => {
    expect(colorTransformWebGPUMaterialRenderer.instanceFloatCount).toBe(8);
  });

  it('packs the materialData color transform', () => {
    const out = new Float32Array(8);
    colorTransformWebGPUMaterialRenderer.packInstance!(null as never, null, makeColorTransform(0.5) as never, out, 0);
    expect(out[0]).toBe(0.5);
  });

  it('packs identity when materialData is null', () => {
    const out = new Float32Array(8);
    colorTransformWebGPUMaterialRenderer.packInstance!(null as never, null, null, out, 0);
    expect(Array.from(out)).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
  });
});

describe('registerWebGPUColorTransformMaterials', () => {
  it('registers both color transform material renderers', () => {
    const state = {} as never;
    registerWebGPUColorTransformMaterials(state);
    expect(getWebGPUMaterialRenderer(state, UniformColorTransformMaterialKind)).toBe(
      uniformColorTransformWebGPUMaterialRenderer,
    );
    expect(getWebGPUMaterialRenderer(state, ColorTransformMaterialKind)).toBe(colorTransformWebGPUMaterialRenderer);
  });
});

describe('uniformColorTransformWebGPUMaterialRenderer', () => {
  it('packs the material color transform onto the instance', () => {
    const out = new Float32Array(8);
    const material = { kind: UniformColorTransformMaterialKind, colorTransform: makeColorTransform(0.5) } as never;
    uniformColorTransformWebGPUMaterialRenderer.packInstance!(null as never, material, null, out, 0);
    expect(out[0]).toBe(0.5);
  });
});
