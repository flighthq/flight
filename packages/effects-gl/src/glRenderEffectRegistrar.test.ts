import {
  getGlRenderEffectKinds,
  registerAntialiasingGlRenderEffects,
  registerBloomGlRenderEffects,
  registerBlurGlRenderEffects,
  registerColorGlRenderEffects,
  registerColorGradeGlRenderEffects,
  registerCompositeGlRenderEffects,
  registerCustomShaderGlRenderEffect,
  registerDefaultGlRenderEffects,
  registerScreenSpaceGlRenderEffects,
  registerStandardGlRenderEffects,
  registerStylizeGlRenderEffects,
} from './glRenderEffectRegistrar';
import { hasGlRenderEffectRunner } from './glRenderEffectRegistry';

describe('getGlRenderEffectKinds', () => {
  it('is a function', () => {
    expect(typeof getGlRenderEffectKinds).toBe('function');
  });

  it('returns a non-empty readonly array of strings', () => {
    const kinds = getGlRenderEffectKinds();
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((k) => typeof k === 'string')).toBe(true);
  });

  it('returns the same reference on repeated calls', () => {
    expect(getGlRenderEffectKinds()).toBe(getGlRenderEffectKinds());
  });

  it('is sorted alphabetically', () => {
    const kinds = getGlRenderEffectKinds();
    const sorted = [...kinds].sort();
    expect(kinds).toEqual(sorted);
  });
});

describe('registerAntialiasingGlRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerAntialiasingGlRenderEffects).toBe('function');
  });

  it('registers FxaaEffect, SmaaEffect, and TaaEffect runners', () => {
    const state = {} as never;
    registerAntialiasingGlRenderEffects(state);
    expect(hasGlRenderEffectRunner(state, 'FxaaEffect')).toBe(true);
    expect(hasGlRenderEffectRunner(state, 'SmaaEffect')).toBe(true);
    expect(hasGlRenderEffectRunner(state, 'TaaEffect')).toBe(true);
  });
});

describe('registerBloomGlRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerBloomGlRenderEffects).toBe('function');
  });

  it('registers BloomEffect, VignetteEffect, and ChromaticAberrationEffect runners', () => {
    const state = {} as never;
    registerBloomGlRenderEffects(state);
    expect(hasGlRenderEffectRunner(state, 'BloomEffect')).toBe(true);
    expect(hasGlRenderEffectRunner(state, 'VignetteEffect')).toBe(true);
    expect(hasGlRenderEffectRunner(state, 'ChromaticAberrationEffect')).toBe(true);
  });
});

describe('registerBlurGlRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerBlurGlRenderEffects).toBe('function');
  });

  it('registers DirectionalBlurEffect and MotionBlurEffect runners', () => {
    const state = {} as never;
    registerBlurGlRenderEffects(state);
    expect(hasGlRenderEffectRunner(state, 'DirectionalBlurEffect')).toBe(true);
    expect(hasGlRenderEffectRunner(state, 'MotionBlurEffect')).toBe(true);
  });

  it('does not register BloomEffect (moved to bloom band)', () => {
    const state = {} as never;
    registerBlurGlRenderEffects(state);
    expect(hasGlRenderEffectRunner(state, 'BloomEffect')).toBe(false);
  });
});

describe('registerColorGlRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerColorGlRenderEffects).toBe('function');
  });

  it('registers BrightnessContrastEffect and ExposureEffect runners', () => {
    const state = {} as never;
    registerColorGlRenderEffects(state);
    expect(hasGlRenderEffectRunner(state, 'BrightnessContrastEffect')).toBe(true);
    expect(hasGlRenderEffectRunner(state, 'ExposureEffect')).toBe(true);
  });

  it('does not register DitherEffect (moved to stylize band)', () => {
    const state = {} as never;
    registerColorGlRenderEffects(state);
    expect(hasGlRenderEffectRunner(state, 'DitherEffect')).toBe(false);
  });
});

describe('registerColorGradeGlRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerColorGradeGlRenderEffects).toBe('function');
  });

  it('registers BrightnessContrastEffect and ExposureEffect runners', () => {
    const state = {} as never;
    registerColorGradeGlRenderEffects(state);
    expect(hasGlRenderEffectRunner(state, 'BrightnessContrastEffect')).toBe(true);
    expect(hasGlRenderEffectRunner(state, 'ExposureEffect')).toBe(true);
  });
});

describe('registerCompositeGlRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerCompositeGlRenderEffects).toBe('function');
  });

  it('registers the seven former-filter composite effect runners', () => {
    const state = {} as never;
    registerCompositeGlRenderEffects(state);
    for (const kind of [
      'BevelEffect',
      'DropShadowEffect',
      'GradientBevelEffect',
      'GradientGlowEffect',
      'InnerGlowEffect',
      'InnerShadowEffect',
      'OuterGlowEffect',
    ]) {
      expect(hasGlRenderEffectRunner(state, kind)).toBe(true);
    }
  });
});

describe('registerCustomShaderGlRenderEffect', () => {
  it('is a function', () => {
    expect(typeof registerCustomShaderGlRenderEffect).toBe('function');
  });

  it('registers the CustomShaderEffect runner', () => {
    const state = {} as never;
    registerCustomShaderGlRenderEffect(state);
    expect(hasGlRenderEffectRunner(state, 'CustomShaderEffect')).toBe(true);
  });
});

describe('registerDefaultGlRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerDefaultGlRenderEffects).toBe('function');
  });

  it('registers a runner for every kind returned by getGlRenderEffectKinds', () => {
    const state = {} as never;
    registerDefaultGlRenderEffects(state);
    for (const kind of getGlRenderEffectKinds()) {
      expect(hasGlRenderEffectRunner(state, kind)).toBe(true);
    }
  });
});

describe('registerScreenSpaceGlRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerScreenSpaceGlRenderEffects).toBe('function');
  });

  it('registers DisplacementEffect and SsaoEffect runners', () => {
    const state = {} as never;
    registerScreenSpaceGlRenderEffects(state);
    expect(hasGlRenderEffectRunner(state, 'DisplacementEffect')).toBe(true);
    expect(hasGlRenderEffectRunner(state, 'SsaoEffect')).toBe(true);
  });
});

describe('registerStandardGlRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerStandardGlRenderEffects).toBe('function');
  });

  it('registers a runner for every kind returned by getGlRenderEffectKinds', () => {
    const state = {} as never;
    registerStandardGlRenderEffects(state);
    for (const kind of getGlRenderEffectKinds()) {
      expect(hasGlRenderEffectRunner(state, kind)).toBe(true);
    }
  });
});

describe('registerStylizeGlRenderEffects', () => {
  it('is a function', () => {
    expect(typeof registerStylizeGlRenderEffects).toBe('function');
  });

  it('registers DitherEffect and FilmGrainEffect runners', () => {
    const state = {} as never;
    registerStylizeGlRenderEffects(state);
    expect(hasGlRenderEffectRunner(state, 'DitherEffect')).toBe(true);
    expect(hasGlRenderEffectRunner(state, 'FilmGrainEffect')).toBe(true);
  });

  it('does not register VignetteEffect (moved to bloom band)', () => {
    const state = {} as never;
    registerStylizeGlRenderEffects(state);
    expect(hasGlRenderEffectRunner(state, 'VignetteEffect')).toBe(false);
  });
});
