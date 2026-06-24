import { getGlMaterialRenderer } from '@flighthq/render-gl';
import { UniformColorTransformMaterialKind } from '@flighthq/types';

import { makeGlState } from './glTestHelper';
import {
  registerGlUniformColorTransformMaterial,
  uniformColorTransformGlMaterialRenderer,
} from './glUniformColorTransformMaterial';

describe('registerGlUniformColorTransformMaterial', () => {
  it('registers the uniform color transform material renderer', () => {
    const { state } = makeGlState();
    registerGlUniformColorTransformMaterial(state);
    expect(getGlMaterialRenderer(state, UniformColorTransformMaterialKind)).toBe(
      uniformColorTransformGlMaterialRenderer,
    );
  });
});

describe('uniformColorTransformGlMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(uniformColorTransformGlMaterialRenderer.instanceFloatCount).toBe(0);
  });
});
