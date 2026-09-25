import {
  createWgpuDeviceState,
  createWgpuRenderStateRuntime,
  getWgpuQuadMaterialRenderer,
} from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState } from '@flighthq/types/contract';
import { EntityRuntimeKey, StandardMaterialKind } from '@flighthq/types/contract';

import { registerWgpuStandardMaterial, standardWgpuQuadMaterialRenderer } from './wgpuStandardMaterial.ts';

describe('registerWgpuStandardMaterial', () => {
  it('registers the default renderer under StandardMaterialKind', () => {
    const state = {} as WgpuRenderState;
    state[EntityRuntimeKey] = createWgpuRenderStateRuntime(createWgpuDeviceState({} as GPUDevice));
    registerWgpuStandardMaterial(state);
    expect(getWgpuQuadMaterialRenderer(state, StandardMaterialKind)).toBe(standardWgpuQuadMaterialRenderer);
  });
});

describe('standardWgpuQuadMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(standardWgpuQuadMaterialRenderer.instanceFloatCount).toBe(0);
  });
});
