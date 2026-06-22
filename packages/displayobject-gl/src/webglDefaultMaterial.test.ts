import { getGlMaterialRenderer } from '@flighthq/render-gl';
import { makeGlState } from '@flighthq/render-gl';
import { DefaultMaterialKind } from '@flighthq/types';

import { defaultGlMaterialRenderer, registerDefaultGlMaterial } from './webglDefaultMaterial';

describe('defaultGlMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(defaultGlMaterialRenderer.instanceFloatCount).toBe(0);
  });
});

describe('registerDefaultGlMaterial', () => {
  it('registers the default renderer under DefaultMaterialKind', () => {
    const { state } = makeGlState();
    registerDefaultGlMaterial(state);
    expect(getGlMaterialRenderer(state, DefaultMaterialKind)).toBe(defaultGlMaterialRenderer);
  });
});
