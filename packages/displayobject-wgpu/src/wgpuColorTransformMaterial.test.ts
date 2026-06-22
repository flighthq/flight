import { getWgpuMaterialRenderer } from '@flighthq/render-wgpu';
import { createWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { WgpuRenderState } from '@flighthq/types';
import { ColorTransformMaterialKind, EntityRuntimeKey, UniformColorTransformMaterialKind } from '@flighthq/types';

import {
  colorTransformWgpuMaterialRenderer,
  registerWgpuColorTransformMaterials,
  uniformColorTransformWgpuMaterialRenderer,
} from './wgpuColorTransformMaterial';

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

describe('colorTransformWgpuMaterialRenderer', () => {
  it('declares 8 per-instance floats', () => {
    expect(colorTransformWgpuMaterialRenderer.instanceFloatCount).toBe(8);
  });

  it('packs the materialData color transform', () => {
    const out = new Float32Array(8);
    colorTransformWgpuMaterialRenderer.packInstance!(null as never, null, makeColorTransform(0.5) as never, out, 0);
    expect(out[0]).toBe(0.5);
  });

  it('packs identity when materialData is null', () => {
    const out = new Float32Array(8);
    colorTransformWgpuMaterialRenderer.packInstance!(null as never, null, null, out, 0);
    expect(Array.from(out)).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
  });
});

describe('registerWgpuColorTransformMaterials', () => {
  it('registers both color transform material renderers', () => {
    const state = {} as WgpuRenderState;
    state[EntityRuntimeKey] = createWgpuRenderStateRuntime();
    registerWgpuColorTransformMaterials(state);
    expect(getWgpuMaterialRenderer(state, UniformColorTransformMaterialKind)).toBe(
      uniformColorTransformWgpuMaterialRenderer,
    );
    expect(getWgpuMaterialRenderer(state, ColorTransformMaterialKind)).toBe(colorTransformWgpuMaterialRenderer);
  });
});

describe('uniformColorTransformWgpuMaterialRenderer', () => {
  it('packs the material color transform onto the instance', () => {
    const out = new Float32Array(8);
    const material = { kind: UniformColorTransformMaterialKind, colorTransform: makeColorTransform(0.5) } as never;
    uniformColorTransformWgpuMaterialRenderer.packInstance!(null as never, material, null, out, 0);
    expect(out[0]).toBe(0.5);
  });
});
