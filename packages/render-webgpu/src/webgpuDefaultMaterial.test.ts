import type { WebGPURenderState } from '@flighthq/types';
import { DefaultMaterialKind, EntityRuntimeKey } from '@flighthq/types';

import { defaultWebGPUMaterialRenderer, registerDefaultWebGPUMaterial } from './webgpuDefaultMaterial';
import { getWebGPUMaterialRenderer } from './webgpuMaterialRegistry';
import { createWebGPURenderStateRuntime } from './webgpuRenderState';

describe('defaultWebGPUMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(defaultWebGPUMaterialRenderer.instanceFloatCount).toBe(0);
  });
});

describe('registerDefaultWebGPUMaterial', () => {
  it('registers the default renderer under DefaultMaterialKind', () => {
    const state = {} as WebGPURenderState;
    state[EntityRuntimeKey] = createWebGPURenderStateRuntime();
    registerDefaultWebGPUMaterial(state);
    expect(getWebGPUMaterialRenderer(state, DefaultMaterialKind)).toBe(defaultWebGPUMaterialRenderer);
  });
});
