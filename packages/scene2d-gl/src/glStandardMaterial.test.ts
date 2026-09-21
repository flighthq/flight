import { getGlQuadMaterialRenderer } from '@flighthq/render-gl/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import { registerGlStandardMaterial, standardGlQuadMaterialRenderer } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

describe('registerGlStandardMaterial', () => {
  it('registers the default renderer under StandardMaterialKind', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    expect(getGlQuadMaterialRenderer(state, StandardMaterialKind)).toBe(standardGlQuadMaterialRenderer);
  });
});

describe('standardGlQuadMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(standardGlQuadMaterialRenderer.instanceFloatCount).toBe(0);
  });
});
