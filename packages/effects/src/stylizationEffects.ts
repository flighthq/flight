import type {
  CRTEffect,
  DitherEffect,
  FilmGrainEffect,
  GlitchEffect,
  HalftoneEffect,
  KuwaharaEffect,
  OutlineEffect,
  PixelateEffect,
  ScanlinesEffect,
  SharpenEffect,
  SketchEffect,
} from '@flighthq/types';

// Stylization effect intents: substrate-agnostic plain-data descriptors for non-photoreal looks
// (film grain, scanlines, CRT, pixelation, halftone, dithering, outlines, sharpening, Kuwahara,
// pencil sketch). Each constructor tags the discriminant `type` and spreads caller options through.

export function createCRTEffect(options: Readonly<Omit<CRTEffect, 'type'>> = {}): CRTEffect {
  return { type: 'crt', ...options };
}

export function createDitherEffect(options: Readonly<Omit<DitherEffect, 'type'>> = {}): DitherEffect {
  return { type: 'dither', ...options };
}

export function createFilmGrainEffect(options: Readonly<Omit<FilmGrainEffect, 'type'>> = {}): FilmGrainEffect {
  return { type: 'filmGrain', ...options };
}

export function createGlitchEffect(options: Readonly<Omit<GlitchEffect, 'type'>> = {}): GlitchEffect {
  return { type: 'glitch', ...options };
}

export function createHalftoneEffect(options: Readonly<Omit<HalftoneEffect, 'type'>> = {}): HalftoneEffect {
  return { type: 'halftone', ...options };
}

export function createKuwaharaEffect(options: Readonly<Omit<KuwaharaEffect, 'type'>> = {}): KuwaharaEffect {
  return { type: 'kuwahara', ...options };
}

export function createOutlineEffect(options: Readonly<Omit<OutlineEffect, 'type'>> = {}): OutlineEffect {
  return { type: 'outline', ...options };
}

export function createPixelateEffect(options: Readonly<Omit<PixelateEffect, 'type'>> = {}): PixelateEffect {
  return { type: 'pixelate', ...options };
}

export function createScanlinesEffect(options: Readonly<Omit<ScanlinesEffect, 'type'>> = {}): ScanlinesEffect {
  return { type: 'scanlines', ...options };
}

export function createSharpenEffect(options: Readonly<Omit<SharpenEffect, 'type'>> = {}): SharpenEffect {
  return { type: 'sharpen', ...options };
}

export function createSketchEffect(options: Readonly<Omit<SketchEffect, 'type'>> = {}): SketchEffect {
  return { type: 'sketch', ...options };
}
