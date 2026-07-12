import type { WgpuRenderState } from '@flighthq/types';

import { defaultWgpuBevelEffectRunner } from './wgpuBevelEffect';
import { defaultWgpuBloomEffectRunner } from './wgpuBloomEffect';
import { defaultWgpuBlurEffectRunner } from './wgpuBlurEffect';
import { defaultWgpuBokehDepthOfFieldEffectRunner } from './wgpuBokehDepthOfFieldEffect';
import { defaultWgpuCameraMotionBlurEffectRunner } from './wgpuCameraMotionBlurEffect';
import { defaultWgpuChromaticAberrationEffectRunner } from './wgpuChromaticAberrationEffect';
import { defaultWgpuConvolutionEffectRunner } from './wgpuConvolutionEffect';
import { defaultWgpuCrtEffectRunner } from './wgpuCrtEffect';
import { defaultWgpuDirectionalBlurEffectRunner } from './wgpuDirectionalBlurEffect';
import { defaultWgpuDisplacementEffectRunner } from './wgpuDisplacementEffect';
import { defaultWgpuDitherEffectRunner } from './wgpuDitherEffect';
import { defaultWgpuDropShadowEffectRunner } from './wgpuDropShadowEffect';
import { defaultWgpuFilmGrainEffectRunner } from './wgpuFilmGrainEffect';
import { defaultWgpuFxaaEffectRunner } from './wgpuFxaaEffect';
import { defaultWgpuGlitchEffectRunner } from './wgpuGlitchEffect';
import { defaultWgpuGodRaysEffectRunner } from './wgpuGodRaysEffect';
import { defaultWgpuGradientBevelEffectRunner } from './wgpuGradientBevelEffect';
import { defaultWgpuGradientGlowEffectRunner } from './wgpuGradientGlowEffect';
import { defaultWgpuHalftoneEffectRunner } from './wgpuHalftoneEffect';
import { defaultWgpuInnerGlowEffectRunner } from './wgpuInnerGlowEffect';
import { defaultWgpuInnerShadowEffectRunner } from './wgpuInnerShadowEffect';
import { defaultWgpuKuwaharaEffectRunner } from './wgpuKuwaharaEffect';
import { defaultWgpuLensDirtEffectRunner } from './wgpuLensDirtEffect';
import { defaultWgpuLensDistortionEffectRunner } from './wgpuLensDistortionEffect';
import { defaultWgpuLensFlareEffectRunner } from './wgpuLensFlareEffect';
import { defaultWgpuMedianEffectRunner } from './wgpuMedianEffect';
import { defaultWgpuMotionBlurEffectRunner } from './wgpuMotionBlurEffect';
import { defaultWgpuOuterGlowEffectRunner } from './wgpuOuterGlowEffect';
import { defaultWgpuOutlineEffectRunner } from './wgpuOutlineEffect';
import { defaultWgpuPixelateEffectRunner } from './wgpuPixelateEffect';
import { defaultWgpuPosterizeEffectRunner } from './wgpuPosterizeEffect';
import { defaultWgpuRadialBlurEffectRunner } from './wgpuRadialBlurEffect';
import { registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';
import { defaultWgpuScanlinesEffectRunner } from './wgpuScanlinesEffect';
import { defaultWgpuScreenSpaceFogEffectRunner } from './wgpuScreenSpaceFogEffect';
import { defaultWgpuSharpenEffectRunner } from './wgpuSharpenEffect';
import { defaultWgpuSketchEffectRunner } from './wgpuSketchEffect';
import { defaultWgpuSmaaEffectRunner } from './wgpuSmaaEffect';
import { defaultWgpuSsaoEffectRunner } from './wgpuSsaoEffect';
import { defaultWgpuSsrEffectRunner } from './wgpuSsrEffect';
import { defaultWgpuTaaEffectRunner } from './wgpuTaaEffect';
import { defaultWgpuTiltShiftEffectRunner } from './wgpuTiltShiftEffect';
import { defaultWgpuToneMapEffectRunner } from './wgpuToneMapEffect';
import { defaultWgpuVignetteEffectRunner } from './wgpuVignetteEffect';
import { defaultWgpuWhiteBalanceEffectRunner } from './wgpuWhiteBalanceEffect';

// Curated registrant helpers — each function registers a taxonomy band of default runners under their
// canonical kind keys. The full-set helper composes all bands. Each helper is a named export so callers
// can import only the band they need (the rest tree-shakes). The Wgpu mirror of the equivalent helpers
// in effects-gl.

// Antialiasing band: FxaaEffect, SmaaEffect, TaaEffect.
export function registerAntialiasingWgpuRenderEffects(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'FxaaEffect', defaultWgpuFxaaEffectRunner);
  registerWgpuRenderEffect(state, 'SmaaEffect', defaultWgpuSmaaEffectRunner);
  registerWgpuRenderEffect(state, 'TaaEffect', defaultWgpuTaaEffectRunner);
}

// Bloom / optical band: BloomEffect, ChromaticAberrationEffect, GodRaysEffect, LensDirtEffect,
// LensDistortionEffect, LensFlareEffect, VignetteEffect.
export function registerBloomWgpuRenderEffects(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'BloomEffect', defaultWgpuBloomEffectRunner);
  registerWgpuRenderEffect(state, 'ChromaticAberrationEffect', defaultWgpuChromaticAberrationEffectRunner);
  registerWgpuRenderEffect(state, 'GodRaysEffect', defaultWgpuGodRaysEffectRunner);
  registerWgpuRenderEffect(state, 'LensDirtEffect', defaultWgpuLensDirtEffectRunner);
  registerWgpuRenderEffect(state, 'LensDistortionEffect', defaultWgpuLensDistortionEffectRunner);
  registerWgpuRenderEffect(state, 'LensFlareEffect', defaultWgpuLensFlareEffectRunner);
  registerWgpuRenderEffect(state, 'VignetteEffect', defaultWgpuVignetteEffectRunner);
}

// Blur band: BokehDepthOfFieldEffect, CameraMotionBlurEffect, DirectionalBlurEffect, MotionBlurEffect,
// RadialBlurEffect, TiltShiftEffect.
export function registerBlurWgpuRenderEffects(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'BlurEffect', defaultWgpuBlurEffectRunner);
  registerWgpuRenderEffect(state, 'BokehDepthOfFieldEffect', defaultWgpuBokehDepthOfFieldEffectRunner);
  registerWgpuRenderEffect(state, 'CameraMotionBlurEffect', defaultWgpuCameraMotionBlurEffectRunner);
  registerWgpuRenderEffect(state, 'DirectionalBlurEffect', defaultWgpuDirectionalBlurEffectRunner);
  registerWgpuRenderEffect(state, 'MotionBlurEffect', defaultWgpuMotionBlurEffectRunner);
  registerWgpuRenderEffect(state, 'RadialBlurEffect', defaultWgpuRadialBlurEffectRunner);
  registerWgpuRenderEffect(state, 'TiltShiftEffect', defaultWgpuTiltShiftEffectRunner);
}

// Color / tone band: ToneMapEffect, WhiteBalanceEffect.
// (The pointwise color ops were dissolved into @flighthq/adjustments — Grayscale/Invert/Sepia/
//  BrightnessContrast/ChannelMixer/Exposure as matrix-tier, and HueSaturation/LiftGammaGain/ColorGrade/
//  Posterize/LookupTableGrade as LUT-tier — folded through the pipeline's generic color-matrix / color-LUT
//  pass; see effect-adjustment-architecture.)
export function registerColorWgpuRenderEffects(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'ToneMapEffect', defaultWgpuToneMapEffectRunner);
  registerWgpuRenderEffect(state, 'WhiteBalanceEffect', defaultWgpuWhiteBalanceEffectRunner);
}

// Full standard set — composes all taxonomy bands. Registers all 43 default runners under their
// canonical kind keys. Import this when the full effect palette is needed; import individual band
// helpers when only a subset of effects is used.
// Composite band: BevelEffect, DropShadowEffect, GradientBevelEffect, GradientGlowEffect,
// InnerGlowEffect, InnerShadowEffect, OuterGlowEffect. The former filter-layer composite ops,
// now full-frame composite effects chaining tint/blur/offset passes through pooled offscreen targets.
// Symmetric with Gl's registerCompositeGlRenderEffects.
export function registerCompositeWgpuRenderEffects(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'BevelEffect', defaultWgpuBevelEffectRunner);
  registerWgpuRenderEffect(state, 'DropShadowEffect', defaultWgpuDropShadowEffectRunner);
  registerWgpuRenderEffect(state, 'GradientBevelEffect', defaultWgpuGradientBevelEffectRunner);
  registerWgpuRenderEffect(state, 'GradientGlowEffect', defaultWgpuGradientGlowEffectRunner);
  registerWgpuRenderEffect(state, 'InnerGlowEffect', defaultWgpuInnerGlowEffectRunner);
  registerWgpuRenderEffect(state, 'InnerShadowEffect', defaultWgpuInnerShadowEffectRunner);
  registerWgpuRenderEffect(state, 'OuterGlowEffect', defaultWgpuOuterGlowEffectRunner);
}

// Screen-space / atmospheric band: DisplacementEffect, ScreenSpaceFogEffect, SharpenEffect,
// SsaoEffect, SsrEffect.
export function registerScreenSpaceWgpuRenderEffects(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'DisplacementEffect', defaultWgpuDisplacementEffectRunner);
  registerWgpuRenderEffect(state, 'ScreenSpaceFogEffect', defaultWgpuScreenSpaceFogEffectRunner);
  registerWgpuRenderEffect(state, 'SharpenEffect', defaultWgpuSharpenEffectRunner);
  registerWgpuRenderEffect(state, 'SsaoEffect', defaultWgpuSsaoEffectRunner);
  registerWgpuRenderEffect(state, 'SsrEffect', defaultWgpuSsrEffectRunner);
}

export function registerStandardWgpuRenderEffects(state: WgpuRenderState): void {
  registerAntialiasingWgpuRenderEffects(state);
  registerBloomWgpuRenderEffects(state);
  registerBlurWgpuRenderEffects(state);
  registerColorWgpuRenderEffects(state);
  registerCompositeWgpuRenderEffects(state);
  registerScreenSpaceWgpuRenderEffects(state);
  registerStylizeWgpuRenderEffects(state);
}

// Stylize band: CrtEffect, DitherEffect, FilmGrainEffect, GlitchEffect, HalftoneEffect,
// KuwaharaEffect, OutlineEffect, PixelateEffect, PosterizeEffect, ScanlinesEffect, SketchEffect.
// PosterizeEffect is a stylize effect, not a LUT adjustment: its hard step (floor) would be smoothed
// away by a trilinear fused LUT, so it needs a dedicated per-op pass — see effect-adjustment-architecture.
export function registerStylizeWgpuRenderEffects(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'ConvolutionEffect', defaultWgpuConvolutionEffectRunner);
  registerWgpuRenderEffect(state, 'CrtEffect', defaultWgpuCrtEffectRunner);
  registerWgpuRenderEffect(state, 'DitherEffect', defaultWgpuDitherEffectRunner);
  registerWgpuRenderEffect(state, 'FilmGrainEffect', defaultWgpuFilmGrainEffectRunner);
  registerWgpuRenderEffect(state, 'GlitchEffect', defaultWgpuGlitchEffectRunner);
  registerWgpuRenderEffect(state, 'HalftoneEffect', defaultWgpuHalftoneEffectRunner);
  registerWgpuRenderEffect(state, 'KuwaharaEffect', defaultWgpuKuwaharaEffectRunner);
  registerWgpuRenderEffect(state, 'MedianEffect', defaultWgpuMedianEffectRunner);
  registerWgpuRenderEffect(state, 'OutlineEffect', defaultWgpuOutlineEffectRunner);
  registerWgpuRenderEffect(state, 'PixelateEffect', defaultWgpuPixelateEffectRunner);
  registerWgpuRenderEffect(state, 'PosterizeEffect', defaultWgpuPosterizeEffectRunner);
  registerWgpuRenderEffect(state, 'ScanlinesEffect', defaultWgpuScanlinesEffectRunner);
  registerWgpuRenderEffect(state, 'SketchEffect', defaultWgpuSketchEffectRunner);
}
