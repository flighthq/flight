import { DefaultMaterialKind } from '@flighthq/types';

import { defaultWebGLMaterialRenderer, registerDefaultWebGLMaterial } from './webglDefaultMaterial';
import { getWebGLMaterialRenderer } from './webglMaterialRegistry';
import { makeWebGLState } from './webglTestHelper';

describe('defaultWebGLMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(defaultWebGLMaterialRenderer.instanceFloatCount).toBe(0);
  });
});

describe('registerDefaultWebGLMaterial', () => {
  it('registers the default renderer under DefaultMaterialKind', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    expect(getWebGLMaterialRenderer(state, DefaultMaterialKind)).toBe(defaultWebGLMaterialRenderer);
  });
});
