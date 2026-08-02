import { createRenderState, enableRenderRegistryGuards, explainRenderRegistryMisses } from '@flighthq/render/contract';
import { RenderRegistry } from '@flighthq/types/contract';

import { createDomRenderState } from './domRenderState';
import { getDomShapeRasterizer, registerDomShapeRasterizer } from './domShapeRasterizer';

describe('getDomShapeRasterizer', () => {
  it('reports none until one is registered', () => {
    const state = createDomRenderState(document.createElement('div'));
    expect(getDomShapeRasterizer(state)).toBeNull();
  });
});

describe('registerDomShapeRasterizer', () => {
  it('installs the rasterizer the shape path draws non-solid fills through', () => {
    const state = createDomRenderState(document.createElement('div'));
    const rasterizer = (): void => {};

    registerDomShapeRasterizer(state, rasterizer);

    expect(getDomShapeRasterizer(state)).toBe(rasterizer);
  });

  it('removes one again, so a state can drop back to tessellation only', () => {
    const state = createDomRenderState(document.createElement('div'));
    registerDomShapeRasterizer(state, (): void => {});

    registerDomShapeRasterizer(state, null);

    expect(getDomShapeRasterizer(state)).toBeNull();
  });
});
