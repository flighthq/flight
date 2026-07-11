import type { RenderEffect } from '@flighthq/types';

// Per-kind default values for every built-in render effect. The table holds only the fields
// that have documented non-zero defaults (fields that default to 0/false/undefined are omitted).
// `getRenderEffectDefaults(kind)` returns a copy (so the caller can mutate it freely);
// `normalizeRenderEffect(effect, out)` merges the table defaults with a partial effect intent,
// filling in missing fields with their defaults. Both are alias-safe.

// Returns a fresh object containing the documented default field values for the given effect kind.
// Returns an empty object if the kind has no default table entry (e.g. user-defined custom effects).
// The returned object does NOT include `kind`; it is raw defaults that can be spread into an effect.
export function getRenderEffectDefaults(kind: string): Record<string, unknown> {
  const entry = DEFAULTS[kind];
  if (!entry) return {};
  return { ...entry };
}

// Copies `effect` into `out`, filling in missing optional fields from the per-kind default table.
// `out` must already have `kind` set to the same kind as `effect`. Missing fields (undefined) are
// replaced with the documented default; fields explicitly set on `effect` (including zero or false)
// are preserved as-is. Returns true on success; returns false if the kind has no default table entry
// and leaves `out` unchanged in that case.
//
// Alias-safe: reads all fields from `effect` and defaults into locals before writing to `out`.
export function normalizeRenderEffect(effect: Readonly<RenderEffect>, out: RenderEffect): boolean {
  const entry = DEFAULTS[effect.kind];
  if (!entry) return false;
  // Read snapshot of both sources before writing.
  const effectRec = effect as Record<string, unknown>;
  const outRec = out as unknown as Record<string, unknown>;
  // Write all default keys first, then override with explicit effect values.
  for (const key of Object.keys(entry)) {
    outRec[key] = effectRec[key] !== undefined ? effectRec[key] : entry[key];
  }
  // Carry over any fields set on `effect` that are not in the defaults table.
  for (const key of Object.keys(effectRec)) {
    if (!(key in entry)) {
      outRec[key] = effectRec[key];
    }
  }
  return true;
}

// Internal default table. Values match the documented defaults in the type definitions.
const DEFAULTS: Record<string, Record<string, unknown>> = {
  AutoExposureEffect: { adaptationSpeed: 1, exposureCompensation: 0, maxExposure: 2, minExposure: -2 },
  BarrelDistortionEffect: { amount: 0.5, scale: 0.9 },
  BevelEffect: {
    angle: 45,
    bevelType: 'inner',
    blurX: 4,
    blurY: 4,
    distance: 4,
    highlightAlpha: 1,
    highlightColor: 0xffffff,
    quality: 1,
    shadowAlpha: 1,
    shadowColor: 0x000000,
    strength: 1,
  },
  BloomEffect: { brightness: 1, mipCount: 0, passes: 1, radius: 8, threshold: 0.8, thresholdKnee: 0.5 },
  BlurEffect: { blurX: 4, blurY: 4 },
  BokehDepthOfFieldEffect: { apertureBlades: 6, maxBlurRadius: 16, samples: 16 },
  BrightnessContrastEffect: { brightness: 0, contrast: 0 },
  CameraMotionBlurEffect: { samples: 8 },
  ChromaticAberrationEffect: { fringeStrength: 0.01, radial: true, samples: 3 },
  ColorGradeEffect: {
    brightness: 0,
    contrast: 0,
    exposure: 0,
    highlights: 0x808080ff,
    midtones: 0x808080ff,
    saturation: 1,
    shadows: 0x808080ff,
    temperature: 0,
    tint: 0,
  },
  ColorBlindSimulationEffect: { type: 'deuteranopia' },
  ContactShadowsEffect: { distance: 0.5, opacity: 0.6, samples: 16, smoothness: 0.5 },
  ConvolutionEffect: { bias: 0, clamp: true, preserveAlpha: true },
  CrtEffect: { curvature: 0.1, scanlineIntensity: 0.5, vignette: 0.4, aberration: 0 },
  DirectionalBlurEffect: { angle: 0, samples: 8 },
  DisplacementEffect: { frequency: 12, intensity: 8 },
  DitherEffect: { levels: 16 },
  DropShadowEffect: { alpha: 1, angle: 45, blurX: 4, blurY: 4, distance: 4, quality: 1, strength: 1 },
  ExposureEffect: { exposure: 0 },
  FilmEmulationEffect: { gateWeave: 0, grainIntensity: 0.1, halationRadius: 4, halationStrength: 0.3 },
  FilmGrainEffect: { intensity: 0.2, size: 1, seed: 0 },
  FxaaEffect: { edgeThreshold: 0.0312, subpixel: 0.75 },
  GlitchEffect: { blockSize: 24, colorShift: 8, intensity: 0.5, seed: 0 },
  GodRaysEffect: { centerX: 0.5, centerY: 0.5, decay: 0.96, density: 0.96, exposure: 0.1, samples: 100, weight: 0.4 },
  GradientBevelEffect: { angle: 45, bevelType: 'inner', blurX: 4, blurY: 4, distance: 4, quality: 1, strength: 1 },
  GradientGlowEffect: { blurX: 6, blurY: 6, quality: 1, strength: 1 },
  GrayscaleEffect: { intensity: 1 },
  HalftoneEffect: { angle: 0.785, scale: 8 }, // 0.785 ≈ π/4 = 45°
  HueSaturationEffect: { hue: 0, lightness: 0, saturation: 1 },
  InnerGlowEffect: { alpha: 1, blurX: 6, blurY: 6, color: 0xff0000, quality: 1, strength: 1 },
  InnerShadowEffect: { alpha: 1, angle: 45, blurX: 4, blurY: 4, distance: 4, quality: 1, strength: 1 },
  InvertEffect: { intensity: 1 },
  KuwaharaEffect: { radius: 3 },
  LensDirtEffect: { intensity: 1, threshold: 0.55 },
  LensDistortionEffect: { amount: 0.5, scale: 0.9 },
  LensFlareEffect: { ghosts: 4, halo: 0.5, intensity: 1, threshold: 0.9 },
  LiftGammaGainEffect: { gain: 0x808080ff, gamma: 0x808080ff, lift: 0x808080ff },
  LookupTableGradeEffect: { size: 16, strength: 1 },
  MedianEffect: { radius: 1 },
  MotionBlurEffect: { intensity: 1, samples: 8, shutterAngle: 180, target: 'both' },
  OuterGlowEffect: { alpha: 1, blurX: 6, blurY: 6, color: 0xff0000, quality: 1, strength: 1 },
  OutlineEffect: { color: 0x000000ff, thickness: 1, threshold: 0.1 },
  PanniniProjectionEffect: { compression: 0.5, crop: 0 },
  PixelateEffect: { size: 8 },
  PosterizeEffect: { levels: 8 },
  RadialBlurEffect: { centerX: 0.5, centerY: 0.5, samples: 8, strength: 0.1 },
  ScanlinesEffect: { count: 480, intensity: 0.25 },
  ScreenSpaceFogEffect: { density: 0.5, far: 1000, near: 10 },
  SepiaEffect: { intensity: 1 },
  SharpenEffect: { amount: 0.5 },
  SketchEffect: { strength: 1 },
  SmaaEffect: { threshold: 0.1 },
  SsaoEffect: { bias: 0.025, intensity: 1, radius: 0.5, samples: 16 },
  SsrEffect: { maxDistance: 100, maxSteps: 64, resolution: 0.5, steps: 64, thickness: 0.1 },
  TaaEffect: { feedback: 0.9 },
  TiltShiftEffect: { blur: 1, center: 0.5, width: 0.2 },
  ToneMapEffect: { exposure: 0, operator: 'aces' },
  VignetteEffect: { color: 0x000000ff, intensity: 0.5, radius: 1, softness: 0.5 },
  VolumetricLightEffect: {
    density: 0.5,
    lightColor: 0xffffffff,
    lightX: 0.5,
    lightY: 0.2,
    samples: 32,
    scattering: 0.7,
  },
  WhiteBalanceEffect: { temperature: 0, tint: 0 },
};
