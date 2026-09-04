import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

import {
  createGradientBevelEffect,
  getGradientBevelEffectPadding,
  initializeGradientBevelEffect,
  registerGradientBevelEffectPaddingResolver,
} from './gradientBevelEffect';

describe('createGradientBevelEffect', () => {
  it('tags the intent type', () => {
    expect(createGradientBevelEffect({ colors: [0xff0000, 0x00ff00], alphas: [1, 1], ratios: [0, 255] }).kind).toBe(
      'GradientBevelEffect',
    );
  });

  it('carries options', () => {
    expect(
      createGradientBevelEffect({
        colors: [0xff0000, 0x00ff00],
        alphas: [1, 1],
        ratios: [0, 255],
        sourceMode: 'hide',
        strength: 2,
      }),
    ).toMatchObject({ sourceMode: 'hide', strength: 2 });
  });
});

describe('getGradientBevelEffectPadding', () => {
  it('adds the directional offset only to the reached sides of the Gaussian footprint', () => {
    const effect = createGradientBevelEffect({
      alphas: [1, 1],
      angle: -90,
      blurX: 2,
      blurY: 3,
      colors: [0xff0000, 0x00ff00],
      distance: 5,
      ratios: [0, 255],
    });
    expect(getGradientBevelEffectPadding(effect)).toEqual({ bottom: 9, left: 6, right: 6, top: 14 });
  });
});

describe('initializeGradientBevelEffect', () => {
  it('is the construction initializer of createGradientBevelEffect', () => {
    expect(typeof initializeGradientBevelEffect).toBe('function');
  });
});
describe('registerGradientBevelEffectPaddingResolver', () => {
  it('registers the gradient-bevel footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerGradientBevelEffectPaddingResolver(state);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('GradientBevelEffect')).toBe(
      true,
    );
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
