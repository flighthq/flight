import type {
  BokehDepthOfFieldEffect,
  ChromaticAberrationEffect,
  LensDistortionEffect,
  LensFlareEffect,
  TiltShiftEffect,
  VignetteEffect,
} from '@flighthq/types';

// Lens-camera effect intents: physical-camera artifacts (vignetting, chromatic aberration, lens
// distortion, flare) and depth-driven focus (bokeh DoF, tilt-shift). Plain data tagged with `type`;
// per-backend recipes register a runner against that `type`. Colors are packed RGBA integers.

export function createBokehDepthOfFieldEffect(
  options: Readonly<Omit<BokehDepthOfFieldEffect, 'type'>> = {},
): BokehDepthOfFieldEffect {
  return { type: 'bokehDoF', ...options };
}

export function createChromaticAberrationEffect(
  options: Readonly<Omit<ChromaticAberrationEffect, 'type'>> = {},
): ChromaticAberrationEffect {
  return { type: 'chromaticAberration', ...options };
}

export function createLensDistortionEffect(
  options: Readonly<Omit<LensDistortionEffect, 'type'>> = {},
): LensDistortionEffect {
  return { type: 'lensDistortion', ...options };
}

export function createLensFlareEffect(options: Readonly<Omit<LensFlareEffect, 'type'>> = {}): LensFlareEffect {
  return { type: 'lensFlare', ...options };
}

export function createTiltShiftEffect(options: Readonly<Omit<TiltShiftEffect, 'type'>> = {}): TiltShiftEffect {
  return { type: 'tiltShift', ...options };
}

export function createVignetteEffect(options: Readonly<Omit<VignetteEffect, 'type'>> = {}): VignetteEffect {
  return { type: 'vignette', ...options };
}
