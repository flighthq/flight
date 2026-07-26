import { getWgpuMaterialRenderer } from '@flighthq/render-wgpu';
import { createWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { WgpuRenderState } from '@flighthq/types';
import { EntityRuntimeKey, StandardMaterialKind } from '@flighthq/types';

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
