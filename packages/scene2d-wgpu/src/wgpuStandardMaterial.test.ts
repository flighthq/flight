import { getWgpuMaterialRenderer } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState } from '@flighthq/types/contract';
import { EntityRuntimeKey, StandardMaterialKind } from '@flighthq/types/contract';

import { registerStandardWgpuMaterial, standardWgpuMaterialRenderer } from './wgpuStandardMaterial';

describe('registerStandardWgpuMaterial', () => {
  it('registers the default renderer under StandardMaterialKind', () => {
    const state = {} as WgpuRenderState;
    state[EntityRuntimeKey] = createWgpuRenderStateRuntime();
    registerStandardWgpuMaterial(state);
    expect(getWgpuMaterialRenderer(state, StandardMaterialKind)).toBe(standardWgpuMaterialRenderer);
  });
});

describe('standardWgpuMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(standardWgpuMaterialRenderer.instanceFloatCount).toBe(0);
  });
});
