import type { GlRenderState } from '@flighthq/types';

import { defaultGlBevelEffectRunner } from './glBevelEffect';
import { defaultGlBloomEffectRunner } from './glBloomEffect';
import { defaultGlBlurEffectRunner } from './glBlurEffect';
import { defaultGlBokehDepthOfFieldEffectRunner } from './glBokehDepthOfFieldEffect';
import { defaultGlBrightnessContrastEffectRunner } from './glBrightnessContrastEffect';
import { defaultGlCameraMotionBlurEffectRunner } from './glCameraMotionBlurEffect';
import { defaultGlChannelMixerEffectRunner } from './glChannelMixerEffect';
import { defaultGlChromaticAberrationEffectRunner } from './glChromaticAberrationEffect';
import { defaultGlColorGradeEffectRunner } from './glColorGradeEffect';
import { defaultGlCrtEffectRunner } from './glCrtEffect';
import { defaultGlCustomShaderEffectRunner } from './glCustomShaderEffect';
import { defaultGlDirectionalBlurEffectRunner } from './glDirectionalBlurEffect';
import { defaultGlDisplacementEffectRunner } from './glDisplacementEffect';
import { defaultGlDitherEffectRunner } from './glDitherEffect';
import { defaultGlDropShadowEffectRunner } from './glDropShadowEffect';
import { defaultGlExposureEffectRunner } from './glExposureEffect';
import { defaultGlFilmGrainEffectRunner } from './glFilmGrainEffect';
import { defaultGlFxaaEffectRunner } from './glFxaaEffect';
import { defaultGlGlitchEffectRunner } from './glGlitchEffect';
import { defaultGlGodRaysEffectRunner } from './glGodRaysEffect';
import { defaultGlGradientBevelEffectRunner } from './glGradientBevelEffect';
import { defaultGlGradientGlowEffectRunner } from './glGradientGlowEffect';
import { defaultGlGrayscaleEffectRunner } from './glGrayscaleEffect';
import { defaultGlHalftoneEffectRunner } from './glHalftoneEffect';
import { defaultGlHueSaturationEffectRunner } from './glHueSaturationEffect';
import { defaultGlInnerGlowEffectRunner } from './glInnerGlowEffect';
import { defaultGlInnerShadowEffectRunner } from './glInnerShadowEffect';
import { defaultGlInvertEffectRunner } from './glInvertEffect';
import { defaultGlKuwaharaEffectRunner } from './glKuwaharaEffect';
import { defaultGlLensDirtEffectRunner } from './glLensDirtEffect';
import { defaultGlLensDistortionEffectRunner } from './glLensDistortionEffect';
import { defaultGlLensFlareEffectRunner } from './glLensFlareEffect';
import { defaultGlLiftGammaGainEffectRunner } from './glLiftGammaGainEffect';
import { defaultGlLookupTableGradeEffectRunner } from './glLookupTableGradeEffect';
import { defaultGlMotionBlurEffectRunner } from './glMotionBlurEffect';
import { defaultGlOuterGlowEffectRunner } from './glOuterGlowEffect';
import { defaultGlOutlineEffectRunner } from './glOutlineEffect';
import { defaultGlPixelateEffectRunner } from './glPixelateEffect';
import { defaultGlPosterizeEffectRunner } from './glPosterizeEffect';
import { defaultGlRadialBlurEffectRunner } from './glRadialBlurEffect';
import { registerGlRenderEffect } from './glRenderEffectRegistry';
import { defaultGlScanlinesEffectRunner } from './glScanlinesEffect';
import { defaultGlScreenSpaceFogEffectRunner } from './glScreenSpaceFogEffect';
import { defaultGlSepiaEffectRunner } from './glSepiaEffect';
import { defaultGlSharpenEffectRunner } from './glSharpenEffect';
import { defaultGlSketchEffectRunner } from './glSketchEffect';
import { defaultGlSmaaEffectRunner } from './glSmaaEffect';
import { defaultGlSsaoEffectRunner } from './glSsaoEffect';
import { defaultGlSsrEffectRunner } from './glSsrEffect';
import { defaultGlTaaEffectRunner } from './glTaaEffect';
import { defaultGlTiltShiftEffectRunner } from './glTiltShiftEffect';
import { defaultGlToneMapEffectRunner } from './glToneMapEffect';
import { defaultGlVignetteEffectRunner } from './glVignetteEffect';
import { defaultGlWhiteBalanceEffectRunner } from './glWhiteBalanceEffect';

// Six-band taxonomy matching @flighthq/effects-wgpu:
//   antialiasing — FXAA, SMAA, TAA
//   bloom        — BloomEffect, ChromaticAberration, GodRays, LensDirt, LensDistortion, LensFlare, Vignette
//   blur         — BokehDepthOfField, CameraMotionBlur, DirectionalBlur, MotionBlur, RadialBlur, TiltShift
//   color        — BrightnessContrast, ChannelMixer, ColorGrade, Exposure, Grayscale, HueSaturation,
//                  Invert, LiftGammaGain, LookupTableGrade, Posterize, Sepia, ToneMap, WhiteBalance
//   screen-space — Displacement, ScreenSpaceFog, Sharpen, Ssao, Ssr
//   stylize      — Crt, Dither, FilmGrain, Glitch, Halftone, Kuwahara, Outline, Pixelate, Scanlines, Sketch
//
// Legacy four-band names (registerBlurGlRenderEffects, registerColorGradeGlRenderEffects,
// registerStylizeGlRenderEffects, registerScreenSpaceGlRenderEffects, registerDefaultGlRenderEffects)
// remain as aliases or redirect to equivalent coverage so existing callers are unaffected.

// Returns the full set of effect kind strings covered by this package's default runners, in
// alphabetical order. Use to populate editor dropdowns, assert complete registration, or enumerate
// for tooling — the list is the single source of truth for what `registerDefaultGlRenderEffects`
// wires in.
export function getGlRenderEffectKinds(): ReadonlyArray<string> {
  return ALL_GL_EFFECT_KINDS;
}

// Antialiasing band: FxaaEffect, SmaaEffect, TaaEffect.
// Symmetric with Wgpu's registerAntialiasingWgpuRenderEffects.
export function registerAntialiasingGlRenderEffects(state: GlRenderState): void {
  registerGlRenderEffect(state, 'FxaaEffect', defaultGlFxaaEffectRunner);
  registerGlRenderEffect(state, 'SmaaEffect', defaultGlSmaaEffectRunner);
  registerGlRenderEffect(state, 'TaaEffect', defaultGlTaaEffectRunner);
}

// Bloom / optical band: BloomEffect, ChromaticAberrationEffect, GodRaysEffect, LensDirtEffect,
// LensDistortionEffect, LensFlareEffect, VignetteEffect.
// Symmetric with Wgpu's registerBloomWgpuRenderEffects.
export function registerBloomGlRenderEffects(state: GlRenderState): void {
  registerGlRenderEffect(state, 'BloomEffect', defaultGlBloomEffectRunner);
  registerGlRenderEffect(state, 'ChromaticAberrationEffect', defaultGlChromaticAberrationEffectRunner);
  registerGlRenderEffect(state, 'GodRaysEffect', defaultGlGodRaysEffectRunner);
  registerGlRenderEffect(state, 'LensDirtEffect', defaultGlLensDirtEffectRunner);
  registerGlRenderEffect(state, 'LensDistortionEffect', defaultGlLensDistortionEffectRunner);
  registerGlRenderEffect(state, 'LensFlareEffect', defaultGlLensFlareEffectRunner);
  registerGlRenderEffect(state, 'VignetteEffect', defaultGlVignetteEffectRunner);
}

// Blur band: BokehDepthOfFieldEffect, CameraMotionBlurEffect, DirectionalBlurEffect,
// MotionBlurEffect, RadialBlurEffect, TiltShiftEffect.
// Symmetric with Wgpu's registerBlurWgpuRenderEffects (BloomEffect has moved to the bloom band).
export function registerBlurGlRenderEffects(state: GlRenderState): void {
  registerGlRenderEffect(state, 'BlurEffect', defaultGlBlurEffectRunner);
  registerGlRenderEffect(state, 'BokehDepthOfFieldEffect', defaultGlBokehDepthOfFieldEffectRunner);
  registerGlRenderEffect(state, 'CameraMotionBlurEffect', defaultGlCameraMotionBlurEffectRunner);
  registerGlRenderEffect(state, 'DirectionalBlurEffect', defaultGlDirectionalBlurEffectRunner);
  registerGlRenderEffect(state, 'MotionBlurEffect', defaultGlMotionBlurEffectRunner);
  registerGlRenderEffect(state, 'RadialBlurEffect', defaultGlRadialBlurEffectRunner);
  registerGlRenderEffect(state, 'TiltShiftEffect', defaultGlTiltShiftEffectRunner);
}

// Color / tone band: BrightnessContrastEffect, ChannelMixerEffect, ColorGradeEffect,
// ExposureEffect, GrayscaleEffect, HueSaturationEffect, InvertEffect, LiftGammaGainEffect,
// LookupTableGradeEffect, PosterizeEffect, SepiaEffect, ToneMapEffect, WhiteBalanceEffect.
// DitherEffect has moved to the stylize band (matching Wgpu).
// Symmetric with Wgpu's registerColorWgpuRenderEffects.
export function registerColorGlRenderEffects(state: GlRenderState): void {
  registerGlRenderEffect(state, 'BrightnessContrastEffect', defaultGlBrightnessContrastEffectRunner);
  registerGlRenderEffect(state, 'ChannelMixerEffect', defaultGlChannelMixerEffectRunner);
  registerGlRenderEffect(state, 'ColorGradeEffect', defaultGlColorGradeEffectRunner);
  registerGlRenderEffect(state, 'ExposureEffect', defaultGlExposureEffectRunner);
  registerGlRenderEffect(state, 'GrayscaleEffect', defaultGlGrayscaleEffectRunner);
  registerGlRenderEffect(state, 'HueSaturationEffect', defaultGlHueSaturationEffectRunner);
  registerGlRenderEffect(state, 'InvertEffect', defaultGlInvertEffectRunner);
  registerGlRenderEffect(state, 'LiftGammaGainEffect', defaultGlLiftGammaGainEffectRunner);
  registerGlRenderEffect(state, 'LookupTableGradeEffect', defaultGlLookupTableGradeEffectRunner);
  registerGlRenderEffect(state, 'PosterizeEffect', defaultGlPosterizeEffectRunner);
  registerGlRenderEffect(state, 'SepiaEffect', defaultGlSepiaEffectRunner);
  registerGlRenderEffect(state, 'ToneMapEffect', defaultGlToneMapEffectRunner);
  registerGlRenderEffect(state, 'WhiteBalanceEffect', defaultGlWhiteBalanceEffectRunner);
}

// Alias: registerColorGradeGlRenderEffects → registerColorGlRenderEffects.
// Kept for callers that used the original four-band name.
export function registerColorGradeGlRenderEffects(state: GlRenderState): void {
  registerColorGlRenderEffects(state);
}

// Composite band: BevelEffect, DropShadowEffect, GradientBevelEffect, GradientGlowEffect,
// InnerGlowEffect, InnerShadowEffect, OuterGlowEffect. The former @flighthq/filters composite ops,
// now full-frame composite effects: each chains tint/blur/offset passes and bounces through pooled
// offscreen targets over the scene silhouette. Symmetric with Wgpu's registerCompositeWgpuRenderEffects.
export function registerCompositeGlRenderEffects(state: GlRenderState): void {
  registerGlRenderEffect(state, 'BevelEffect', defaultGlBevelEffectRunner);
  registerGlRenderEffect(state, 'DropShadowEffect', defaultGlDropShadowEffectRunner);
  registerGlRenderEffect(state, 'GradientBevelEffect', defaultGlGradientBevelEffectRunner);
  registerGlRenderEffect(state, 'GradientGlowEffect', defaultGlGradientGlowEffectRunner);
  registerGlRenderEffect(state, 'InnerGlowEffect', defaultGlInnerGlowEffectRunner);
  registerGlRenderEffect(state, 'InnerShadowEffect', defaultGlInnerShadowEffectRunner);
  registerGlRenderEffect(state, 'OuterGlowEffect', defaultGlOuterGlowEffectRunner);
}

// CustomShaderEffect: runs a user-authored fragment shader (registered with
// registerGlCustomShaderSource) as a fullscreen pass. Not part of any fixed taxonomy band — it is the
// escape hatch for effects the built-in set does not cover. registerDefaultGlRenderEffects includes
// it, so a CustomShaderEffect naming an unregistered shaderKey passes the image through unchanged
// rather than being silently skipped as an unregistered kind.
export function registerCustomShaderGlRenderEffect(state: GlRenderState): void {
  registerGlRenderEffect(state, 'CustomShaderEffect', defaultGlCustomShaderEffectRunner);
}

// Registers all default effect runners, covering all six taxonomy bands. The opt-in "register the
// standard set" entry for applications that want every effect available without cherry-picking.
// Symmetric with Wgpu's registerStandardWgpuRenderEffects.
export function registerDefaultGlRenderEffects(state: GlRenderState): void {
  registerAntialiasingGlRenderEffects(state);
  registerBloomGlRenderEffects(state);
  registerBlurGlRenderEffects(state);
  registerColorGlRenderEffects(state);
  registerCompositeGlRenderEffects(state);
  registerCustomShaderGlRenderEffect(state);
  registerScreenSpaceGlRenderEffects(state);
  registerStylizeGlRenderEffects(state);
}

// Screen-space / atmospheric band: DisplacementEffect, ScreenSpaceFogEffect, SharpenEffect,
// SsaoEffect, SsrEffect. Antialiasing effects (FXAA/SMAA/TAA) are in their own band;
// this band covers depth/atmosphere/image-quality effects that do not fit the other categories.
// Symmetric with Wgpu's registerScreenSpaceWgpuRenderEffects.
export function registerScreenSpaceGlRenderEffects(state: GlRenderState): void {
  registerGlRenderEffect(state, 'DisplacementEffect', defaultGlDisplacementEffectRunner);
  registerGlRenderEffect(state, 'ScreenSpaceFogEffect', defaultGlScreenSpaceFogEffectRunner);
  registerGlRenderEffect(state, 'SharpenEffect', defaultGlSharpenEffectRunner);
  registerGlRenderEffect(state, 'SsaoEffect', defaultGlSsaoEffectRunner);
  registerGlRenderEffect(state, 'SsrEffect', defaultGlSsrEffectRunner);
}

// Alias: registerStandardGlRenderEffects → registerDefaultGlRenderEffects.
// Symmetric name for callers targeting both GL and Wgpu registrants.
export function registerStandardGlRenderEffects(state: GlRenderState): void {
  registerDefaultGlRenderEffects(state);
}

// Stylize band: CrtEffect, DitherEffect, FilmGrainEffect, GlitchEffect, HalftoneEffect,
// KuwaharaEffect, OutlineEffect, PixelateEffect, ScanlinesEffect, SketchEffect.
// DitherEffect has moved here from the color-grade band (matching Wgpu).
// Symmetric with Wgpu's registerStylizeWgpuRenderEffects.
export function registerStylizeGlRenderEffects(state: GlRenderState): void {
  registerGlRenderEffect(state, 'CrtEffect', defaultGlCrtEffectRunner);
  registerGlRenderEffect(state, 'DitherEffect', defaultGlDitherEffectRunner);
  registerGlRenderEffect(state, 'FilmGrainEffect', defaultGlFilmGrainEffectRunner);
  registerGlRenderEffect(state, 'GlitchEffect', defaultGlGlitchEffectRunner);
  registerGlRenderEffect(state, 'HalftoneEffect', defaultGlHalftoneEffectRunner);
  registerGlRenderEffect(state, 'KuwaharaEffect', defaultGlKuwaharaEffectRunner);
  registerGlRenderEffect(state, 'OutlineEffect', defaultGlOutlineEffectRunner);
  registerGlRenderEffect(state, 'PixelateEffect', defaultGlPixelateEffectRunner);
  registerGlRenderEffect(state, 'ScanlinesEffect', defaultGlScanlinesEffectRunner);
  registerGlRenderEffect(state, 'SketchEffect', defaultGlSketchEffectRunner);
}

// All kind strings covered by this package's default runners, alphabetical order.
// Single source of truth for registerDefaultGlRenderEffects and getGlRenderEffectKinds.
const ALL_GL_EFFECT_KINDS: ReadonlyArray<string> = [
  'BevelEffect',
  'BloomEffect',
  'BlurEffect',
  'BokehDepthOfFieldEffect',
  'BrightnessContrastEffect',
  'CameraMotionBlurEffect',
  'ChannelMixerEffect',
  'ChromaticAberrationEffect',
  'ColorGradeEffect',
  'CrtEffect',
  'CustomShaderEffect',
  'DirectionalBlurEffect',
  'DisplacementEffect',
  'DitherEffect',
  'DropShadowEffect',
  'ExposureEffect',
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
  'WhiteBalanceEffect',
];
