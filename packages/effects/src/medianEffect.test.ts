import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import { createMedianEffect, getMedianEffectPadding, registerMedianEffectPaddingResolver } from './medianEffect';

describe('createMedianEffect', () => {
  it('tags the intent type', () => {
    expect(createMedianEffect().kind).toBe('MedianEffect');
  });

  it('carries options', () => {
    expect(createMedianEffect({ radius: 2 })).toMatchObject({ radius: 2 });
  });
});

describe('getMedianEffectPadding', () => {
  it('uses the rounded neighborhood radius on every side', () => {
    expect(getMedianEffectPadding(createMedianEffect({ radius: 1.6 }))).toEqual({
      bottom: 2,
      left: 2,
      right: 2,
      top: 2,
    });
  });
});

describe('registerMedianEffectPaddingResolver', () => {
  it('registers the median footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerMedianEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('MedianEffect')).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
