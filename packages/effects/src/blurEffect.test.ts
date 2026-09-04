import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createBlurEffect,
  getBlurEffectPadding,
  initializeBlurEffect,
  registerBlurEffectPaddingResolver,
} from './blurEffect';

describe('createBlurEffect', () => {
  it('sets the kind', () => {
    expect(createBlurEffect().kind).toBe('BlurEffect');
  });

  it('defaults to no options beyond kind', () => {
    expect(createBlurEffect()).toMatchObject({ kind: 'BlurEffect' });
  });

  it('carries through blurX and blurY', () => {
    const effect = createBlurEffect({ blurX: 6, blurY: 3 });
    expect(effect.blurX).toBe(6);
    expect(effect.blurY).toBe(3);
  });
});

describe('getBlurEffectPadding', () => {
  it('derives directional Gaussian footprint from ceil(3 * sigma) on each axis', () => {
    expect(getBlurEffectPadding(createBlurEffect({ blurX: 2.1, blurY: 3.2 }))).toEqual({
      bottom: 10,
      left: 7,
      right: 7,
      top: 10,
    });
  });
});

describe('initializeBlurEffect', () => {
  it('is the construction initializer of createBlurEffect', () => {
    expect(typeof initializeBlurEffect).toBe('function');
  });
});
describe('registerBlurEffectPaddingResolver', () => {
  it('registers the blur resolver on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();

    registerBlurEffectPaddingResolver(state);

    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('BlurEffect')).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
