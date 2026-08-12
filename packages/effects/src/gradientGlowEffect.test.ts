import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createGradientGlowEffect,
  getGradientGlowEffectPadding,
  registerGradientGlowEffectPaddingResolver,
} from './gradientGlowEffect';

describe('createGradientGlowEffect', () => {
  it('tags the intent type', () => {
    expect(createGradientGlowEffect({ colors: [0xff0000, 0x00ff00], alphas: [1, 1], ratios: [0, 255] }).kind).toBe(
      'GradientGlowEffect',
    );
  });

  it('carries options', () => {
    expect(
      createGradientGlowEffect({
        colors: [0xff0000, 0x00ff00],
        alphas: [1, 1],
        ratios: [0, 255],
        sourceMode: 'knockout',
        strength: 2,
      }),
    ).toMatchObject({ sourceMode: 'knockout', strength: 2 });
  });
});

describe('getGradientGlowEffectPadding', () => {
  it('uses the three-sigma extent independently on both axes', () => {
    expect(
      getGradientGlowEffectPadding(
        createGradientGlowEffect({ alphas: [1], blurX: 2.1, blurY: 3, colors: [0xffffff], ratios: [0] }),
      ),
    ).toEqual({ bottom: 9, left: 7, right: 7, top: 9 });
  });
});

describe('registerGradientGlowEffectPaddingResolver', () => {
  it('registers the gradient-glow footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerGradientGlowEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('GradientGlowEffect')).toBe(
      true,
    );
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
