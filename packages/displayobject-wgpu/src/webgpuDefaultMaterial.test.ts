import { getWgpuMaterialRenderer } from '@flighthq/render-wgpu';
import { createWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { WgpuRenderState } from '@flighthq/types';
import { DefaultMaterialKind, EntityRuntimeKey } from '@flighthq/types';

import { defaultWgpuMaterialRenderer, registerDefaultWgpuMaterial } from './webgpuDefaultMaterial';

describe('defaultWgpuMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(defaultWgpuMaterialRenderer.instanceFloatCount).toBe(0);
  });
});

describe('registerDefaultWgpuMaterial', () => {
  it('registers the default renderer under DefaultMaterialKind', () => {
    const state = {} as WgpuRenderState;
    state[EntityRuntimeKey] = createWgpuRenderStateRuntime();
    registerDefaultWgpuMaterial(state);
    expect(getWgpuMaterialRenderer(state, DefaultMaterialKind)).toBe(defaultWgpuMaterialRenderer);
  });
});
