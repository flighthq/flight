import { getGlMaterialRenderer } from '@flighthq/render-gl';
import { StandardMaterialKind } from '@flighthq/types';

import { registerStandardGlMaterial, standardGlMaterialRenderer } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

describe('registerStandardGlMaterial', () => {
  it('registers the default renderer under StandardMaterialKind', () => {
    const { state } = createGlState();
    registerStandardGlMaterial(state);
    expect(getGlMaterialRenderer(state, StandardMaterialKind)).toBe(standardGlMaterialRenderer);
  });
});

describe('standardGlMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(standardGlMaterialRenderer.instanceFloatCount).toBe(0);
  });
});
