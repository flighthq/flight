import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import {
  registerAntialiasingWgpuRenderEffects,
  registerBloomWgpuRenderEffects,
  registerBlurWgpuRenderEffects,
  registerColorWgpuRenderEffects,
  registerCompositeWgpuRenderEffects,
  registerScreenSpaceWgpuRenderEffects,
  registerStandardWgpuRenderEffects,
  registerStylizeWgpuRenderEffects,
} from './wgpuRenderEffectRegistrants';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

beforeAll(() => {
  installWgpuMock();
});

describe('registerAntialiasingWgpuRenderEffects', () => {
  it('registers FxaaEffect, SmaaEffect, and TaaEffect runners', async () => {
    const state = await createWgpuRenderStateForTest();
    registerAntialiasingWgpuRenderEffects(state);
    expect(getWgpuRenderEffectRunner(state, 'FxaaEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'SmaaEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'TaaEffect')).not.toBe(null);
  });
});

describe('registerBloomWgpuRenderEffects', () => {
  it('registers all bloom and optical effect runners', async () => {
    const state = await createWgpuRenderStateForTest();
    registerBloomWgpuRenderEffects(state);
    expect(getWgpuRenderEffectRunner(state, 'BloomEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'ChromaticAberrationEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'GodRaysEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'LensDirtEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'LensDistortionEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'LensFlareEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'VignetteEffect')).not.toBe(null);
  });
});

describe('registerBlurWgpuRenderEffects', () => {
  it('registers all blur effect runners', async () => {
    const state = await createWgpuRenderStateForTest();
    registerBlurWgpuRenderEffects(state);
    expect(getWgpuRenderEffectRunner(state, 'BokehDepthOfFieldEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'CameraMotionBlurEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'DirectionalBlurEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'MotionBlurEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'RadialBlurEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'TiltShiftEffect')).not.toBe(null);
  });
});

describe('registerColorWgpuRenderEffects', () => {
  it('registers all color and tone effect runners', async () => {
    const state = await createWgpuRenderStateForTest();
    registerColorWgpuRenderEffects(state);
    expect(getWgpuRenderEffectRunner(state, 'BrightnessContrastEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'ChannelMixerEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'ColorGradeEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'ExposureEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'GrayscaleEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'HueSaturationEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'InvertEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'LiftGammaGainEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'LookupTableGradeEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'PosterizeEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'SepiaEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'ToneMapEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'WhiteBalanceEffect')).not.toBe(null);
  });
});

describe('registerCompositeWgpuRenderEffects', () => {
  it('registers the seven former-filter composite effect runners', async () => {
    const state = await createWgpuRenderStateForTest();
    registerCompositeWgpuRenderEffects(state);
    for (const kind of [
      'BevelEffect',
      'DropShadowEffect',
      'GradientBevelEffect',
      'GradientGlowEffect',
      'InnerGlowEffect',
      'InnerShadowEffect',
      'OuterGlowEffect',
    ]) {
      expect(getWgpuRenderEffectRunner(state, kind)).not.toBe(null);
    }
  });
});

describe('registerScreenSpaceWgpuRenderEffects', () => {
  it('registers all screen-space and atmospheric effect runners', async () => {
    const state = await createWgpuRenderStateForTest();
    registerScreenSpaceWgpuRenderEffects(state);
    expect(getWgpuRenderEffectRunner(state, 'DisplacementEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'ScreenSpaceFogEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'SharpenEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'SsaoEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'SsrEffect')).not.toBe(null);
  });
});

describe('registerStandardWgpuRenderEffects', () => {
  it('registers all 45 standard effect runners', async () => {
    const state = await createWgpuRenderStateForTest();
    registerStandardWgpuRenderEffects(state);
    // Spot-check one from each band.
    expect(getWgpuRenderEffectRunner(state, 'FxaaEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'BloomEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'DirectionalBlurEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'GrayscaleEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'SsaoEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'HalftoneEffect')).not.toBe(null);
  });

  it('does not register runners for unknown kinds', async () => {
    const state = await createWgpuRenderStateForTest();
    registerStandardWgpuRenderEffects(state);
    expect(getWgpuRenderEffectRunner(state, 'acme.UnknownEffect')).toBe(null);
  });
});

describe('registerStylizeWgpuRenderEffects', () => {
  it('registers all stylize effect runners', async () => {
    const state = await createWgpuRenderStateForTest();
    registerStylizeWgpuRenderEffects(state);
    expect(getWgpuRenderEffectRunner(state, 'CrtEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'DitherEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'FilmGrainEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'GlitchEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'HalftoneEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'KuwaharaEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'OutlineEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'PixelateEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'ScanlinesEffect')).not.toBe(null);
    expect(getWgpuRenderEffectRunner(state, 'SketchEffect')).not.toBe(null);
  });
});
