import { getGlMaterialRenderer } from '@flighthq/render-gl/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import { registerGlStandardMaterial, standardGlMaterialRenderer } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

describe('registerGlStandardMaterial', () => {
  it('registers the default renderer under StandardMaterialKind', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    expect(getGlMaterialRenderer(state, StandardMaterialKind)).toBe(standardGlMaterialRenderer);
  });
});

describe('standardGlMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(standardGlMaterialRenderer.instanceFloatCount).toBe(0);
  });
});
