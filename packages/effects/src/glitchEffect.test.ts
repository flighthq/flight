import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import { createGlitchEffect, getGlitchEffectPadding, registerGlitchEffectPaddingResolver } from './glitchEffect';

describe('createGlitchEffect', () => {
  it('tags the intent type', () => {
    expect(createGlitchEffect().kind).toBe('GlitchEffect');
  });

  it('carries options', () => {
    expect(createGlitchEffect({ intensity: 0.7, blockSize: 22, colorShift: 12, seed: 3 })).toMatchObject({
      intensity: 0.7,
      blockSize: 22,
      colorShift: 12,
      seed: 3,
    });
  });
});

describe('getGlitchEffectPadding', () => {
  it('covers horizontal tears and the maximum RGB channel separation', () => {
    expect(getGlitchEffectPadding(createGlitchEffect({ colorShift: 10, intensity: 0.5 }))).toEqual({
      bottom: 0,
      left: 34,
      right: 34,
      top: 0,
    });
  });
});

describe('registerGlitchEffectPaddingResolver', () => {
  it('registers the glitch footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerGlitchEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('GlitchEffect')).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
