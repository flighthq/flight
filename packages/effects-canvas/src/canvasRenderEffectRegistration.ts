import type { CanvasRenderEffectRunner, CanvasRenderState } from '@flighthq/types';

import { defaultCanvasBloomEffectRunner } from './canvasBloomEffect';
import { defaultCanvasBlurEffectRunner } from './canvasBlurEffect';
import { defaultCanvasBrightnessContrastEffectRunner } from './canvasBrightnessContrastEffect';
import { defaultCanvasChannelMixerEffectRunner } from './canvasChannelMixerEffect';
import { defaultCanvasChromaticAberrationEffectRunner } from './canvasChromaticAberrationEffect';
import { defaultCanvasColorGradeEffectRunner } from './canvasColorGradeEffect';
import { defaultCanvasConvolutionEffectRunner } from './canvasConvolutionEffect';
import { defaultCanvasCrtEffectRunner } from './canvasCrtEffect';
import { defaultCanvasDirectionalBlurEffectRunner } from './canvasDirectionalBlurEffect';
import { defaultCanvasDisplacementEffectRunner } from './canvasDisplacementEffect';
import { defaultCanvasDitherEffectRunner } from './canvasDitherEffect';
import { defaultCanvasDropShadowEffectRunner } from './canvasDropShadowEffect';
import { defaultCanvasExposureEffectRunner } from './canvasExposureEffect';
import { defaultCanvasFilmGrainEffectRunner } from './canvasFilmGrainEffect';
import { defaultCanvasGlitchEffectRunner } from './canvasGlitchEffect';
import { defaultCanvasGodRaysEffectRunner } from './canvasGodRaysEffect';
import { defaultCanvasGrayscaleEffectRunner } from './canvasGrayscaleEffect';
import { defaultCanvasHalftoneEffectRunner } from './canvasHalftoneEffect';
import { defaultCanvasHueSaturationEffectRunner } from './canvasHueSaturationEffect';
import { defaultCanvasInvertEffectRunner } from './canvasInvertEffect';
import { defaultCanvasKuwaharaEffectRunner } from './canvasKuwaharaEffect';
import { defaultCanvasLensDirtEffectRunner } from './canvasLensDirtEffect';
import { defaultCanvasLensDistortionEffectRunner } from './canvasLensDistortionEffect';
import { defaultCanvasLensFlareEffectRunner } from './canvasLensFlareEffect';
import { defaultCanvasLiftGammaGainEffectRunner } from './canvasLiftGammaGainEffect';
import { defaultCanvasMedianEffectRunner } from './canvasMedianEffect';
import { defaultCanvasOuterGlowEffectRunner } from './canvasOuterGlowEffect';
import { defaultCanvasOutlineEffectRunner } from './canvasOutlineEffect';
import { defaultCanvasPixelateEffectRunner } from './canvasPixelateEffect';
import { defaultCanvasPosterizeEffectRunner } from './canvasPosterizeEffect';
import { defaultCanvasRadialBlurEffectRunner } from './canvasRadialBlurEffect';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';
import { defaultCanvasScanlinesEffectRunner } from './canvasScanlinesEffect';
import { defaultCanvasScreenSpaceFogEffectRunner } from './canvasScreenSpaceFogEffect';
import { defaultCanvasSepiaEffectRunner } from './canvasSepiaEffect';
import { defaultCanvasSharpenEffectRunner } from './canvasSharpenEffect';
import { defaultCanvasSketchEffectRunner } from './canvasSketchEffect';
import { defaultCanvasTiltShiftEffectRunner } from './canvasTiltShiftEffect';
import { defaultCanvasToneMapEffectRunner } from './canvasToneMapEffect';
import { defaultCanvasVignetteEffectRunner } from './canvasVignetteEffect';
import { defaultCanvasWhiteBalanceEffectRunner } from './canvasWhiteBalanceEffect';

// Registers all default effect runners into a CanvasRenderState, covering all three real/approximate
// categories (blur, color-grade, stylize). Passthrough effects are intentionally omitted — registering
// them would only confirm that they produce no visual change, and leaving them unregistered lets the
// pipeline skip them cheaply. This is the opt-in "register the standard set" entry for applications
// that want every available Canvas 2D effect without cherry-picking. For full tree-shaking, call
// `registerCanvasRenderEffect` for each runner individually or use a category registrar.
//
// Import this function separately — it is NOT re-exported from the root barrel by default so it
// cannot be accidentally included in tree-shaken imports. Use it in application-level setup code
// only when all effects are needed.
export function registerAllCanvasRenderEffects(state: CanvasRenderState): void {
  registerBlurCanvasRenderEffects(state);
  registerColorGradeCanvasRenderEffects(state);
  registerCompositeCanvasRenderEffects(state);
  registerScreenSpaceCanvasRenderEffects(state);
  registerStylizeCanvasRenderEffects(state);
}

// Registers all blur-family default runners into a CanvasRenderState: bloom, directional blur,
// radial blur, and tilt-shift. BokehDepthOfFieldEffect, CameraMotionBlurEffect, and
// MotionBlurEffect are passthrough on Canvas 2D (require depth/velocity buffers) and are
// excluded. Importing only this function pulls those runners into the bundle — use
// `registerCanvasRenderEffect` per-runner for full tree-shaking.
export function registerBlurCanvasRenderEffects(state: CanvasRenderState): void {
  for (const [kind, runner] of BLUR_CANVAS_EFFECT_KINDS) {
    registerCanvasRenderEffect(state, kind, runner);
  }
}

// Registers all color-grade default runners into a CanvasRenderState: brightness-contrast,
// channel-mixer, color-grade, dither, exposure (approximate), grayscale, hue-saturation, invert,
// lift-gamma-gain, posterize, sepia, tone-map (approximate), and white-balance.
// LookupTableGradeEffect is excluded (passthrough — descriptor carries no cube data array).
// Importing only this function pulls those runners into the bundle — use
// `registerCanvasRenderEffect` per-runner for full tree-shaking.
export function registerColorGradeCanvasRenderEffects(state: CanvasRenderState): void {
  for (const [kind, runner] of COLOR_GRADE_CANVAS_EFFECT_KINDS) {
    registerCanvasRenderEffect(state, kind, runner);
  }
}

// Registers the composite-family default runners realizable on Canvas 2D: DropShadowEffect and
// OuterGlowEffect, both drawn via a CSS `drop-shadow()` filter chain. The other former-filter
// composites (bevel, inner glow/shadow, gradient glow/bevel) have no Canvas 2D realization — they
// require the multi-target tint/blur/offset GPU recipe — so they are intentionally omitted here (the
// pipeline skips unregistered kinds). Symmetric with registerCompositeGlRenderEffects.
export function registerCompositeCanvasRenderEffects(state: CanvasRenderState): void {
  for (const [kind, runner] of COMPOSITE_CANVAS_EFFECT_KINDS) {
    registerCanvasRenderEffect(state, kind, runner);
  }
}

// Registers all screen-space and anti-aliasing default runners into a CanvasRenderState. On
// Canvas 2D all screen-space effects (FxaaEffect, SmaaEffect, SsaoEffect, SsrEffect, TaaEffect,
// ScreenSpaceShadowsEffect) are passthrough — they require GPU AA samples, depth, or velocity
// buffers that Canvas 2D never produces. This function is a no-op on Canvas 2D and exists for
// API symmetry with registerScreenSpaceGlRenderEffects and registerScreenSpaceWgpuRenderEffects.
export function registerScreenSpaceCanvasRenderEffects(state: CanvasRenderState): void {
  for (const [kind, runner] of SCREENSPACE_CANVAS_EFFECT_KINDS) {
    registerCanvasRenderEffect(state, kind, runner);
  }
}

// Registers all stylize-family default runners into a CanvasRenderState: chromatic aberration,
// CRT, displacement, film grain, glitch, god rays, halftone, kuwahara, lens-dirt, lens-distortion,
// lens-flare, outline, pixelate, scanlines, screen-space fog, sharpen, sketch, and vignette.
// Importing only this function pulls those runners into the bundle — use
// `registerCanvasRenderEffect` per-runner for full tree-shaking.
export function registerStylizeCanvasRenderEffects(state: CanvasRenderState): void {
  for (const [kind, runner] of STYLIZE_CANVAS_EFFECT_KINDS) {
    registerCanvasRenderEffect(state, kind, runner);
  }
}

// The kind strings for the four category groups. Kept as local constants so the individual
// register* functions above have a single source of truth for the loop.

// Composite effects realizable on Canvas 2D via a CSS drop-shadow() chain. Only the two centered/
// offset shadow-and-glow ops have a CSS equivalent; the rest are GPU-only and omitted.
const COMPOSITE_CANVAS_EFFECT_KINDS: ReadonlyArray<readonly [string, CanvasRenderEffectRunner]> = [
  ['DropShadowEffect', defaultCanvasDropShadowEffectRunner],
  ['OuterGlowEffect', defaultCanvasOuterGlowEffectRunner],
];

// Blur effects: multi-pass or directional blurs operating on the color buffer.
// BokehDepthOfFieldEffect, CameraMotionBlurEffect, and MotionBlurEffect are passthrough on Canvas
// (require a depth or velocity buffer that Canvas 2D does not produce) and are omitted here.
const BLUR_CANVAS_EFFECT_KINDS: ReadonlyArray<readonly [string, CanvasRenderEffectRunner]> = [
  ['BloomEffect', defaultCanvasBloomEffectRunner],
  ['BlurEffect', defaultCanvasBlurEffectRunner],
  ['DirectionalBlurEffect', defaultCanvasDirectionalBlurEffectRunner],
  ['RadialBlurEffect', defaultCanvasRadialBlurEffectRunner],
  ['TiltShiftEffect', defaultCanvasTiltShiftEffectRunner],
];

// Color-grade effects: per-pixel color transforms with no multi-pass or geometry dependency.
// LookupTableGradeEffect is passthrough on Canvas (descriptor carries no cube data array) and is
// omitted here. ExposureEffect and ToneMapEffect are included as approximate LDR implementations.
const COLOR_GRADE_CANVAS_EFFECT_KINDS: ReadonlyArray<readonly [string, CanvasRenderEffectRunner]> = [
  ['BrightnessContrastEffect', defaultCanvasBrightnessContrastEffectRunner],
  ['ChannelMixerEffect', defaultCanvasChannelMixerEffectRunner],
  ['ColorGradeEffect', defaultCanvasColorGradeEffectRunner],
  ['DitherEffect', defaultCanvasDitherEffectRunner],
  ['ExposureEffect', defaultCanvasExposureEffectRunner],
  ['GrayscaleEffect', defaultCanvasGrayscaleEffectRunner],
  ['HueSaturationEffect', defaultCanvasHueSaturationEffectRunner],
  ['InvertEffect', defaultCanvasInvertEffectRunner],
  ['LiftGammaGainEffect', defaultCanvasLiftGammaGainEffectRunner],
  ['PosterizeEffect', defaultCanvasPosterizeEffectRunner],
  ['SepiaEffect', defaultCanvasSepiaEffectRunner],
  ['ToneMapEffect', defaultCanvasToneMapEffectRunner],
  ['WhiteBalanceEffect', defaultCanvasWhiteBalanceEffectRunner],
];

// Screen-space / anti-aliasing effects. All screen-space effects (FxaaEffect, SmaaEffect,
// SsaoEffect, SsrEffect, TaaEffect, ScreenSpaceShadowsEffect) are passthrough on Canvas 2D —
// they require pre-rasterization GPU AA samples, depth, or velocity buffers that Canvas 2D
// never produces. This band is kept for API symmetry with effects-gl and effects-wgpu; it
// registers no runners.
const SCREENSPACE_CANVAS_EFFECT_KINDS: ReadonlyArray<readonly [string, CanvasRenderEffectRunner]> = [];

// Stylize effects: artistic transforms, screen-space overlays, and film emulation.
const STYLIZE_CANVAS_EFFECT_KINDS: ReadonlyArray<readonly [string, CanvasRenderEffectRunner]> = [
  ['ChromaticAberrationEffect', defaultCanvasChromaticAberrationEffectRunner],
  ['ConvolutionEffect', defaultCanvasConvolutionEffectRunner],
  ['CrtEffect', defaultCanvasCrtEffectRunner],
  ['DisplacementEffect', defaultCanvasDisplacementEffectRunner],
  ['FilmGrainEffect', defaultCanvasFilmGrainEffectRunner],
  ['GlitchEffect', defaultCanvasGlitchEffectRunner],
  ['GodRaysEffect', defaultCanvasGodRaysEffectRunner],
  ['HalftoneEffect', defaultCanvasHalftoneEffectRunner],
  ['KuwaharaEffect', defaultCanvasKuwaharaEffectRunner],
  ['LensDirtEffect', defaultCanvasLensDirtEffectRunner],
  ['LensDistortionEffect', defaultCanvasLensDistortionEffectRunner],
  ['LensFlareEffect', defaultCanvasLensFlareEffectRunner],
  ['MedianEffect', defaultCanvasMedianEffectRunner],
  ['OutlineEffect', defaultCanvasOutlineEffectRunner],
  ['PixelateEffect', defaultCanvasPixelateEffectRunner],
  ['ScanlinesEffect', defaultCanvasScanlinesEffectRunner],
  ['ScreenSpaceFogEffect', defaultCanvasScreenSpaceFogEffectRunner],
  ['SharpenEffect', defaultCanvasSharpenEffectRunner],
  ['SketchEffect', defaultCanvasSketchEffectRunner],
  ['VignetteEffect', defaultCanvasVignetteEffectRunner],
];
