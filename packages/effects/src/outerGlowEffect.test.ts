import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createOuterGlowEffect,
  getOuterGlowEffectPadding,
  registerOuterGlowEffectPaddingResolver,
} from './outerGlowEffect';

describe('createOuterGlowEffect', () => {
  it('tags the intent type', () => {
    expect(createOuterGlowEffect().kind).toBe('OuterGlowEffect');
  });

  it('carries options', () => {
    expect(createOuterGlowEffect({ sourceMode: 'hide', strength: 2 })).toMatchObject({
      sourceMode: 'hide',
      strength: 2,
    });
  });
});

describe('getOuterGlowEffectPadding', () => {
  it('uses a three-sigma Gaussian footprint', () => {
    expect(getOuterGlowEffectPadding(createOuterGlowEffect({ blurX: 2, blurY: 3 }))).toEqual({
      bottom: 9,
      left: 6,
      right: 6,
      top: 9,
    });
  });
});

describe('registerOuterGlowEffectPaddingResolver', () => {
  it('registers the outer-glow footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerOuterGlowEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('OuterGlowEffect')).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
