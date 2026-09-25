import {
  createRenderState,
  enableRenderRegistriesGuards,
  explainRenderRegistriesMisses,
} from '@flighthq/render/contract';
import { RenderRegistries } from '@flighthq/types/contract';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState.ts';
import { getDomShapeRasterizer, registerDomShapeRasterizer } from './domShapeRasterizer.ts';

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
    expect(getDomRenderStateRuntime(state).registries.shapeRasterizer).toBe(rasterizer);
  });

  it('replaces the slot value', () => {
    const state = createDomRenderState(document.createElement('div'));
    const rasterizer = (): void => {};
    const before = getDomRenderStateRuntime(state).registries.shapeRasterizer;

    registerDomShapeRasterizer(state, rasterizer);

    const after = getDomRenderStateRuntime(state).registries.shapeRasterizer;
    expect(before).toBeNull();
    expect(after).toBe(rasterizer);
  });

  it('removes one again, so a state can drop back to tessellation only', () => {
    const state = createDomRenderState(document.createElement('div'));
    const rasterizer = (): void => {};
    registerDomShapeRasterizer(state, rasterizer);

    registerDomShapeRasterizer(state, null);

    expect(getDomShapeRasterizer(state)).toBeNull();
    expect(getDomRenderStateRuntime(state).registries.shapeRasterizer).toBeNull();
  });
});
