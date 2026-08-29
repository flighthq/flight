import { getWgpuMaterialRenderer } from '@flighthq/render-wgpu/contract';
import { createWgpuDeviceState, createWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState } from '@flighthq/types/contract';
import { EntityRuntimeKey, StandardMaterialKind } from '@flighthq/types/contract';

import { registerWgpuStandardMaterial, standardWgpuMaterialRenderer } from './wgpuStandardMaterial';

describe('registerWgpuStandardMaterial', () => {
  it('registers the default renderer under StandardMaterialKind', () => {
    const state = {} as WgpuRenderState;
    state[EntityRuntimeKey] = createWgpuRenderStateRuntime(createWgpuDeviceState({} as GPUDevice));
    registerWgpuStandardMaterial(state);
    expect(getWgpuMaterialRenderer(state, StandardMaterialKind)).toBe(standardWgpuMaterialRenderer);
  });
});

describe('standardWgpuMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(standardWgpuMaterialRenderer.instanceFloatCount).toBe(0);
  });
});
