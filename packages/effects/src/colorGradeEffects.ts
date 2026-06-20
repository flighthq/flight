import type {
  BrightnessContrastEffect,
  ChannelMixerEffect,
  ColorGradeEffect,
  GrayscaleEffect,
  HueSaturationEffect,
  InvertEffect,
  LiftGammaGainEffect,
  LookupTableGradeEffect,
  PosterizeEffect,
  SepiaEffect,
  WhiteBalanceEffect,
} from '@flighthq/types';

// Color-grading effect intents. Each is plain data with a `type` discriminant; a single-pass per-backend
// recipe applies it. Colors carried as packed RGBA integers (e.g. lift/gamma/gain) are unpacked by the
// recipe, not here — the intent stays substrate-agnostic data.

export function createBrightnessContrastEffect(
  options: Readonly<Omit<BrightnessContrastEffect, 'type'>> = {},
): BrightnessContrastEffect {
  return { type: 'brightnessContrast', ...options };
}

export function createChannelMixerEffect(options: Readonly<Omit<ChannelMixerEffect, 'type'>>): ChannelMixerEffect {
  return { type: 'channelMixer', ...options };
}

export function createColorGradeEffect(options: Readonly<Omit<ColorGradeEffect, 'type'>> = {}): ColorGradeEffect {
  return { type: 'colorGrade', ...options };
}

export function createGrayscaleEffect(options: Readonly<Omit<GrayscaleEffect, 'type'>> = {}): GrayscaleEffect {
  return { type: 'grayscale', ...options };
}

export function createHueSaturationEffect(
  options: Readonly<Omit<HueSaturationEffect, 'type'>> = {},
): HueSaturationEffect {
  return { type: 'hueSaturation', ...options };
}

export function createInvertEffect(options: Readonly<Omit<InvertEffect, 'type'>> = {}): InvertEffect {
  return { type: 'invert', ...options };
}

export function createLiftGammaGainEffect(
  options: Readonly<Omit<LiftGammaGainEffect, 'type'>> = {},
): LiftGammaGainEffect {
  return { type: 'liftGammaGain', ...options };
}

export function createLookupTableGradeEffect(
  options: Readonly<Omit<LookupTableGradeEffect, 'type'>> = {},
): LookupTableGradeEffect {
  return { type: 'lutGrade', ...options };
}

export function createPosterizeEffect(options: Readonly<Omit<PosterizeEffect, 'type'>> = {}): PosterizeEffect {
  return { type: 'posterize', ...options };
}

export function createSepiaEffect(options: Readonly<Omit<SepiaEffect, 'type'>> = {}): SepiaEffect {
  return { type: 'sepia', ...options };
}

export function createWhiteBalanceEffect(options: Readonly<Omit<WhiteBalanceEffect, 'type'>> = {}): WhiteBalanceEffect {
  return { type: 'whiteBalance', ...options };
}
