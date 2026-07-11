import type { RenderEffect, RenderEffectInput } from '@flighthq/types';

// Returns the required render-target inputs for the given effect. Effects with no requirements
// (they only need the color buffer) return an empty array. This is the data form of the
// [HDR]/[DEPTH]/[MOTION]/[TEMPORAL] comment tags in the type definitions.
export function getRenderEffectInputs(effect: Readonly<RenderEffect>): readonly RenderEffectInput[] {
  return RENDER_EFFECT_INPUTS[effect.kind] ?? [];
}

// Returns the full catalog of known effect kind strings in alphabetical order. Suitable for
// populating editor dropdowns, validating serialized effect stacks, and tooling enumeration.
export function getRenderEffectKinds(): readonly string[] {
  return RENDER_EFFECT_KINDS;
}

// Static per-kind table of required render-target inputs. Promotes the [HDR]/[DEPTH]/[MOTION]/
// [TEMPORAL] comment tags from the type definitions into queryable data. The pipeline can call
// getRenderEffectInputs(effect) to validate that a scene target provides the buffers needed before
// dispatching to a backend. Pure data — no backend knowledge, fully tree-shakable.
const RENDER_EFFECT_INPUTS: Readonly<Record<string, readonly RenderEffectInput[]>> = {
  AutoExposureEffect: ['Hdr'],
  BloomEffect: ['Hdr'],
  BokehDepthOfFieldEffect: ['Depth'],
  CameraMotionBlurEffect: ['Motion'],
  ContactShadowsEffect: ['Depth'],
  MotionBlurEffect: ['Motion'],
  ScreenSpaceFogEffect: ['Depth'],
  SsaoEffect: ['Depth'],
  SsrEffect: ['Depth'],
  TaaEffect: ['Temporal'],
  TiltShiftEffect: ['Depth'],
  ToneMapEffect: ['Hdr'],
  VolumetricLightEffect: ['Depth'],
};

// The complete set of effect kind strings in alphabetical order. Used for enumeration, editor
// population, and tooling. Add a new entry when a new effect kind is introduced.
export const RENDER_EFFECT_KINDS: readonly string[] = [
  'AutoExposureEffect',
  'BarrelDistortionEffect',
  'BevelEffect',
  'BloomEffect',
  'BokehDepthOfFieldEffect',
  'BrightnessContrastEffect',
  'CameraMotionBlurEffect',
  'ChannelMixerEffect',
  'ChromaticAberrationEffect',
  'ColorBlindSimulationEffect',
  'ColorGradeEffect',
  'ContactShadowsEffect',
  'CrtEffect',
  'CustomShaderEffect',
  'DirectionalBlurEffect',
  'DisplacementEffect',
  'DitherEffect',
  'DropShadowEffect',
  'ExposureEffect',
  'FilmEmulationEffect',
  'FilmGrainEffect',
  'FxaaEffect',
  'GlitchEffect',
  'GodRaysEffect',
  'GradientBevelEffect',
  'GradientGlowEffect',
  'GrayscaleEffect',
  'HalftoneEffect',
  'HueSaturationEffect',
  'InnerGlowEffect',
  'InnerShadowEffect',
  'InvertEffect',
  'KuwaharaEffect',
  'LensDirtEffect',
  'LensDistortionEffect',
  'LensFlareEffect',
  'LiftGammaGainEffect',
  'LookupTableGradeEffect',
  'MotionBlurEffect',
  'OuterGlowEffect',
  'OutlineEffect',
  'PanniniProjectionEffect',
  'PixelateEffect',
  'PosterizeEffect',
  'RadialBlurEffect',
  'ScanlinesEffect',
  'ScreenSpaceFogEffect',
  'SepiaEffect',
  'SharpenEffect',
  'SketchEffect',
  'SmaaEffect',
  'SsaoEffect',
  'SsrEffect',
  'TaaEffect',
  'TiltShiftEffect',
  'ToneMapEffect',
  'VignetteEffect',
  'VolumetricLightEffect',
  'WhiteBalanceEffect',
];
