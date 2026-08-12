import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createDropShadowEffect,
  getDropShadowEffectPadding,
  registerDropShadowEffectPaddingResolver,
} from './dropShadowEffect';

describe('createDropShadowEffect', () => {
  it('tags the intent type', () => {
    expect(createDropShadowEffect().kind).toBe('DropShadowEffect');
  });

  it('carries options', () => {
    expect(createDropShadowEffect({ sourceMode: 'knockout', strength: 2 })).toMatchObject({
      sourceMode: 'knockout',
      strength: 2,
    });
  });
});

describe('getDropShadowEffectPadding', () => {
  it('adds the offset only to the reached side of the Gaussian footprint', () => {
    expect(getDropShadowEffectPadding(createDropShadowEffect({ angle: 0, blurX: 2, blurY: 3, distance: 5 }))).toEqual({
      bottom: 9,
      left: 6,
      right: 11,
      top: 9,
    });
  });
});

describe('registerDropShadowEffectPaddingResolver', () => {
  it('registers the drop-shadow footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerDropShadowEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('DropShadowEffect')).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
