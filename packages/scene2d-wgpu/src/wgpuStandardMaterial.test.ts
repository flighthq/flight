import { EntityRuntimeKey } from '@flighthq/entity/contract';
import { StandardMaterialKind } from '@flighthq/materials/contract';
import {
  createWgpuDeviceState,
  createWgpuRenderStateRuntime,
  getWgpuQuadMaterialRenderer,
} from '@flighthq/render-wgpu/contract';
import type { WgpuDevice, WgpuRenderState } from '@flighthq/render-wgpu/contract';

import { registerWgpuStandardMaterial, standardWgpuQuadMaterialRenderer } from './wgpuStandardMaterial.ts';

describe('registerWgpuStandardMaterial', () => {
  it('registers the default renderer under StandardMaterialKind', () => {
    const state = {} as WgpuRenderState;
    state[EntityRuntimeKey] = createWgpuRenderStateRuntime(createWgpuDeviceState({} as WgpuDevice));
    registerWgpuStandardMaterial(state);
    expect(getWgpuQuadMaterialRenderer(state, StandardMaterialKind)).toBe(standardWgpuQuadMaterialRenderer);
  });
});

describe('standardWgpuQuadMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(standardWgpuQuadMaterialRenderer.instanceFloatCount).toBe(0);
  });
});
