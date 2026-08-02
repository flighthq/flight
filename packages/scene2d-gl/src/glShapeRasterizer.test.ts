import { createRenderState, enableRenderRegistryGuards, explainRenderRegistryMisses } from '@flighthq/render/contract';
import { RenderRegistry } from '@flighthq/types/contract';

import { getGlShapeRasterizer, registerGlShapeRasterizer } from './glShapeRasterizer';
import { createGlState } from './glTestHelper';

describe('getGlShapeRasterizer', () => {
  it('reports none until one is registered', () => {
    const state = createGlState().state;
    expect(getGlShapeRasterizer(state)).toBeNull();
  });
});

describe('registerGlShapeRasterizer', () => {
  it('installs the rasterizer the shape path draws non-solid fills through', () => {
    const state = createGlState().state;
    const rasterizer = (): void => {};

    registerGlShapeRasterizer(state, rasterizer);

    expect(getGlShapeRasterizer(state)).toBe(rasterizer);
  });

  it('removes one again, so a state can drop back to tessellation only', () => {
    const state = createGlState().state;
    registerGlShapeRasterizer(state, (): void => {});

    registerGlShapeRasterizer(state, null);

    expect(getGlShapeRasterizer(state)).toBeNull();
  });
});
