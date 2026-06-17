import { DefaultMaterialKind } from '@flighthq/types';

import { defaultWebGPUMaterialRenderer, registerDefaultWebGPUMaterial } from './webgpuDefaultMaterial';
import { getWebGPUMaterialRenderer } from './webgpuMaterialRegistry';

describe('defaultWebGPUMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(defaultWebGPUMaterialRenderer.instanceFloatCount).toBe(0);
  });
});

describe('registerDefaultWebGPUMaterial', () => {
  it('registers the default renderer under DefaultMaterialKind', () => {
    const state = {} as never;
    registerDefaultWebGPUMaterial(state);
    expect(getWebGPUMaterialRenderer(state, DefaultMaterialKind)).toBe(defaultWebGPUMaterialRenderer);
  });
});
