import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createBokehDepthOfFieldEffect,
  getBokehDepthOfFieldEffectPadding,
  registerBokehDepthOfFieldEffectPaddingResolver,
} from './bokehDepthOfFieldEffect';

describe('createBokehDepthOfFieldEffect', () => {
  it('tags the intent type', () => {
    expect(createBokehDepthOfFieldEffect().kind).toBe('BokehDepthOfFieldEffect');
  });

  it('carries options', () => {
    expect(createBokehDepthOfFieldEffect({ focusDistance: 0.5, focusRange: 0.2, maxBlur: 4 })).toMatchObject({
      focusDistance: 0.5,
      focusRange: 0.2,
      maxBlur: 4,
    });
  });
});

describe('getBokehDepthOfFieldEffectPadding', () => {
  it('uses the maximum disc radius on every side', () => {
    expect(getBokehDepthOfFieldEffectPadding(createBokehDepthOfFieldEffect({ maxBlur: 4.2 }))).toEqual({
      bottom: 5,
      left: 5,
      right: 5,
      top: 5,
    });
  });
});

describe('registerBokehDepthOfFieldEffectPaddingResolver', () => {
  it('registers the bokeh footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerBokehDepthOfFieldEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('BokehDepthOfFieldEffect')).toBe(
      true,
    );
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
