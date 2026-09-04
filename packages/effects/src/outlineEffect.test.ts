import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createOutlineEffect,
  getOutlineEffectPadding,
  initializeOutlineEffect,
  registerOutlineEffectPaddingResolver,
} from './outlineEffect';

describe('createOutlineEffect', () => {
  it('tags the intent type', () => {
    expect(createOutlineEffect().kind).toBe('OutlineEffect');
  });

  it('carries options', () => {
    expect(createOutlineEffect({ threshold: 0.2, thickness: 1.5, color: 0x000000ff })).toMatchObject({
      threshold: 0.2,
      thickness: 1.5,
      color: 0x000000ff,
    });
  });
});

describe('getOutlineEffectPadding', () => {
  it('uses the Sobel sampling thickness on every side', () => {
    expect(getOutlineEffectPadding(createOutlineEffect({ thickness: 1.5 }))).toEqual({
      bottom: 2,
      left: 2,
      right: 2,
      top: 2,
    });
  });
});

describe('initializeOutlineEffect', () => {
  it('is the construction initializer of createOutlineEffect', () => {
    expect(typeof initializeOutlineEffect).toBe('function');
  });
});
describe('registerOutlineEffectPaddingResolver', () => {
  it('registers the outline footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerOutlineEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('OutlineEffect')).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
