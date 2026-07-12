import type { CanvasRenderState } from '@flighthq/types';

import {
  registerAllCanvasRenderEffects,
  registerBlurCanvasRenderEffects,
  registerColorGradeCanvasRenderEffects,
  registerCompositeCanvasRenderEffects,
  registerScreenSpaceCanvasRenderEffects,
  registerStylizeCanvasRenderEffects,
} from './canvasRenderEffectRegistration';
import { hasCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

describe('registerAllCanvasRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerAllCanvasRenderEffects).toBe('function');
  });
  it('registers bloom effect', () => {
    const fakeState = {} as CanvasRenderState;
    registerAllCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'BloomEffect')).toBe(true);
  });
  it('registers color-grade effects', () => {
    const fakeState = {} as CanvasRenderState;
    registerAllCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'ColorGradeEffect')).toBe(true);
    expect(hasCanvasRenderEffectRunner(fakeState, 'HueSaturationEffect')).toBe(true);
  });
  it('registers stylize effects', () => {
    const fakeState = {} as CanvasRenderState;
    registerAllCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'VignetteEffect')).toBe(true);
    expect(hasCanvasRenderEffectRunner(fakeState, 'FilmGrainEffect')).toBe(true);
    expect(hasCanvasRenderEffectRunner(fakeState, 'ChromaticAberrationEffect')).toBe(true);
  });
  it('does not register passthrough effects (BokehDepthOfFieldEffect)', () => {
    const fakeState = {} as CanvasRenderState;
    registerAllCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'BokehDepthOfFieldEffect')).toBe(false);
  });
  it('does not register passthrough effects (FxaaEffect)', () => {
    const fakeState = {} as CanvasRenderState;
    registerAllCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'FxaaEffect')).toBe(false);
  });
  it('does not register passthrough effects (LookupTableGradeEffect)', () => {
    const fakeState = {} as CanvasRenderState;
    registerAllCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'LookupTableGradeEffect')).toBe(false);
  });
});

describe('registerBlurCanvasRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerBlurCanvasRenderEffects).toBe('function');
  });
  it('registers blur-family effects', () => {
    const fakeState = {} as CanvasRenderState;
    registerBlurCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'BloomEffect')).toBe(true);
    expect(hasCanvasRenderEffectRunner(fakeState, 'DirectionalBlurEffect')).toBe(true);
    expect(hasCanvasRenderEffectRunner(fakeState, 'RadialBlurEffect')).toBe(true);
    expect(hasCanvasRenderEffectRunner(fakeState, 'TiltShiftEffect')).toBe(true);
  });
  it('does not register color-grade effects', () => {
    const fakeState = {} as CanvasRenderState;
    registerBlurCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'GrayscaleEffect')).toBe(false);
  });
});

describe('registerColorGradeCanvasRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerColorGradeCanvasRenderEffects).toBe('function');
  });
  it('registers color-grade effects', () => {
    const fakeState = {} as CanvasRenderState;
    registerColorGradeCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'ColorGradeEffect')).toBe(true);
    expect(hasCanvasRenderEffectRunner(fakeState, 'HueSaturationEffect')).toBe(true);
  });
  it('covers every non-passthrough color-grade kind', () => {
    const fakeState = {} as CanvasRenderState;
    registerColorGradeCanvasRenderEffects(fakeState);
    const colorGradeKinds = [
      'ColorGradeEffect',
      'DitherEffect',
      'HueSaturationEffect',
      'LiftGammaGainEffect',
      'PosterizeEffect',
      'ToneMapEffect',
      'WhiteBalanceEffect',
    ];
    for (const kind of colorGradeKinds) {
      expect(hasCanvasRenderEffectRunner(fakeState, kind)).toBe(true);
    }
  });
});

describe('registerCompositeCanvasRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerCompositeCanvasRenderEffects).toBe('function');
  });

  it('registers the CSS-realizable composite effects (DropShadow, OuterGlow)', () => {
    const fakeState = {} as CanvasRenderState;
    registerCompositeCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'DropShadowEffect')).toBe(true);
    expect(hasCanvasRenderEffectRunner(fakeState, 'OuterGlowEffect')).toBe(true);
  });

  it('does not register the GPU-only composites (Bevel, InnerGlow, gradient variants)', () => {
    const fakeState = {} as CanvasRenderState;
    registerCompositeCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'BevelEffect')).toBe(false);
    expect(hasCanvasRenderEffectRunner(fakeState, 'InnerGlowEffect')).toBe(false);
    expect(hasCanvasRenderEffectRunner(fakeState, 'GradientGlowEffect')).toBe(false);
  });
});

describe('registerScreenSpaceCanvasRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerScreenSpaceCanvasRenderEffects).toBe('function');
  });
  it('is a no-op on Canvas 2D (all screen-space effects are passthrough)', () => {
    // This just verifies it does not throw and that no runner is registered for
    // any of the screen-space passthrough kinds.
    const fakeState = {} as CanvasRenderState;
    registerScreenSpaceCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'FxaaEffect')).toBe(false);
    expect(hasCanvasRenderEffectRunner(fakeState, 'SmaaEffect')).toBe(false);
    expect(hasCanvasRenderEffectRunner(fakeState, 'TaaEffect')).toBe(false);
  });
});

describe('registerStylizeCanvasRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerStylizeCanvasRenderEffects).toBe('function');
  });
  it('registers stylize effects', () => {
    const fakeState = {} as CanvasRenderState;
    registerStylizeCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'VignetteEffect')).toBe(true);
    expect(hasCanvasRenderEffectRunner(fakeState, 'FilmGrainEffect')).toBe(true);
    expect(hasCanvasRenderEffectRunner(fakeState, 'GlitchEffect')).toBe(true);
  });
  it('covers every stylize kind', () => {
    const fakeState = {} as CanvasRenderState;
    registerStylizeCanvasRenderEffects(fakeState);
    const stylizeKinds = [
      'ChromaticAberrationEffect',
      'ConvolutionEffect',
      'CrtEffect',
      'DisplacementEffect',
      'FilmGrainEffect',
      'GlitchEffect',
      'GodRaysEffect',
      'HalftoneEffect',
      'KuwaharaEffect',
      'LensDirtEffect',
      'LensDistortionEffect',
      'LensFlareEffect',
      'MedianEffect',
      'OutlineEffect',
      'PixelateEffect',
      'ScanlinesEffect',
      'ScreenSpaceFogEffect',
      'SharpenEffect',
      'SketchEffect',
      'VignetteEffect',
    ];
    for (const kind of stylizeKinds) {
      expect(hasCanvasRenderEffectRunner(fakeState, kind)).toBe(true);
    }
  });
  it('does not register blur effects', () => {
    const fakeState = {} as CanvasRenderState;
    registerStylizeCanvasRenderEffects(fakeState);
    expect(hasCanvasRenderEffectRunner(fakeState, 'BloomEffect')).toBe(false);
  });
});
