import { UniformColorTransformMaterialKind } from '@flighthq/types';

import { getWebGLMaterialRenderer } from './webglMaterialRegistry';
import { makeWebGLState } from './webglTestHelper';
import {
  registerWebGLUniformColorTransformMaterial,
  uniformColorTransformWebGLMaterialRenderer,
} from './webglUniformColorTransformMaterial';

describe('registerWebGLUniformColorTransformMaterial', () => {
  it('registers the uniform color transform material renderer', () => {
    const { state } = makeWebGLState();
    registerWebGLUniformColorTransformMaterial(state);
    expect(getWebGLMaterialRenderer(state, UniformColorTransformMaterialKind)).toBe(
      uniformColorTransformWebGLMaterialRenderer,
    );
  });
});

describe('uniformColorTransformWebGLMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(uniformColorTransformWebGLMaterialRenderer.instanceFloatCount).toBe(0);
  });
});
