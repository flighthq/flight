import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createDirectionalBlurEffect,
  getDirectionalBlurEffectPadding,
  initializeDirectionalBlurEffect,
  registerDirectionalBlurEffectPaddingResolver,
} from './directionalBlurEffect';

describe('createDirectionalBlurEffect', () => {
  it('tags the intent type', () => {
    expect(createDirectionalBlurEffect().kind).toBe('DirectionalBlurEffect');
  });

  it('carries options', () => {
    expect(createDirectionalBlurEffect({ angle: 1, length: 8 })).toMatchObject({ angle: 1, length: 8 });
  });
});

describe('getDirectionalBlurEffectPadding', () => {
  it('projects the centered half-length onto both axes', () => {
    expect(getDirectionalBlurEffectPadding(createDirectionalBlurEffect({ angle: 90, length: 9 }))).toEqual({
      bottom: 5,
      left: 0,
      right: 0,
      top: 5,
    });
  });
});

describe('initializeDirectionalBlurEffect', () => {
  it('is the construction initializer of createDirectionalBlurEffect', () => {
    expect(typeof initializeDirectionalBlurEffect).toBe('function');
  });
});
describe('registerDirectionalBlurEffectPaddingResolver', () => {
  it('registers the directional-blur footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerDirectionalBlurEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('DirectionalBlurEffect')).toBe(
      true,
    );
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
