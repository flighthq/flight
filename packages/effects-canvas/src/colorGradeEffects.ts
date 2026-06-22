import type {
  BrightnessContrastEffect,
  CanvasRenderEffectRunner,
  CanvasRenderTarget,
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

import { drawCanvasEffectPass, passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Color-grading recipes on Canvas 2D. The six that map cleanly onto CSS `filter()` primitives are real
// realizations (grayscale, sepia, invert, brightness/contrast, hue/saturation, and a composed color
// grade); the rest are shader-only — per-pixel matrix/LUT/quantization work the CSS filter grammar
// cannot express — and ship as passthrough copies so the registry stays populated for parity.

// Brightness/contrast (REAL): CSS brightness()/contrast(). The intent's brightness is an additive
// offset around 0 (neutral 0) and contrast a multiplier around 1 (neutral 1); CSS brightness()/
// contrast() are both multipliers around 1, so brightness is mapped to 1 + offset.
export function applyBrightnessContrastEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<BrightnessContrastEffect>,
): void {
  const brightness = 1 + (effect.brightness ?? 0);
  const contrast = effect.contrast ?? 1;
  drawCanvasEffectPass(dest, source, `brightness(${brightness}) contrast(${contrast})`);
}

// Channel mixer (PASSTHROUGH): an arbitrary 3x4 RGB->RGB matrix per pixel has no CSS filter equivalent;
// CSS has no programmable color matrix on a 2D context. Shader-only.
export function applyChannelMixerEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<ChannelMixerEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Color grade (REAL): compose CSS brightness/contrast/saturate/hue-rotate. Exposure maps to a
// brightness multiplier (2^exposure), saturation to saturate(), contrast to contrast(). Temperature and
// tint are approximated as a small hue rotation — Canvas/CSS has no per-channel temperature primitive,
// so the warm/cool shift is a coarse approximation of the Gl recipe.
export function applyColorGradeEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<ColorGradeEffect>,
): void {
  const exposure = Math.pow(2, effect.exposure ?? 0);
  const brightness = exposure + (effect.brightness ?? 0);
  const contrast = effect.contrast ?? 1;
  const saturation = effect.saturation ?? 1;
  const temperature = effect.temperature ?? 0;
  const tint = effect.tint ?? 0;
  // Approximate temperature/tint as a hue rotation: warm (+temperature) skews toward red/orange,
  // tint toward green/magenta. Coarse but keeps the look directionally consistent with Gl.
  const hueDegrees = -temperature * 20 + tint * 10;
  drawCanvasEffectPass(
    dest,
    source,
    `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hueDegrees}deg)`,
  );
}

// Grayscale (REAL): CSS grayscale(intensity).
export function applyGrayscaleEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<GrayscaleEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  drawCanvasEffectPass(dest, source, `grayscale(${intensity})`);
}

// Hue/saturation (REAL): CSS hue-rotate(degrees) + saturate(). Lightness has no CSS filter equivalent
// and is folded into brightness() as a coarse approximation (additive lightness ~ brightness offset).
export function applyHueSaturationEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<HueSaturationEffect>,
): void {
  const hue = effect.hue ?? 0;
  const saturation = effect.saturation ?? 1;
  const lightness = 1 + (effect.lightness ?? 0);
  drawCanvasEffectPass(dest, source, `hue-rotate(${hue}deg) saturate(${saturation}) brightness(${lightness})`);
}

// Invert (REAL): CSS invert(intensity).
export function applyInvertEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<InvertEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  drawCanvasEffectPass(dest, source, `invert(${intensity})`);
}

// Lift/gamma/gain (PASSTHROUGH): per-channel offset/exponent/multiplier color wheels need per-pixel
// pow()/mul math with no CSS filter equivalent. Shader-only.
export function applyLiftGammaGainEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<LiftGammaGainEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// LUT grade (PASSTHROUGH): sampling a 3D LUT cube per pixel has no CSS filter equivalent. Shader-only.
export function applyLookupTableGradeEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<LookupTableGradeEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Posterize (PASSTHROUGH): per-channel quantization to discrete levels has no CSS filter equivalent.
// Shader-only.
export function applyPosterizeEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<PosterizeEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Sepia (REAL): CSS sepia(intensity).
export function applySepiaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<SepiaEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  drawCanvasEffectPass(dest, source, `sepia(${intensity})`);
}

// White balance (PASSTHROUGH): a per-channel temperature/tint shift has no CSS filter equivalent (only
// the coarse colorGrade hue approximation exists). Shader-only here.
export function applyWhiteBalanceEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<WhiteBalanceEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasBrightnessContrastEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyBrightnessContrastEffectToCanvas(ctx.source, ctx.dest, effect as BrightnessContrastEffect);
};

export const defaultCanvasChannelMixerEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyChannelMixerEffectToCanvas(ctx.source, ctx.dest, effect as ChannelMixerEffect);
};

export const defaultCanvasColorGradeEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyColorGradeEffectToCanvas(ctx.source, ctx.dest, effect as ColorGradeEffect);
};

export const defaultCanvasGrayscaleEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyGrayscaleEffectToCanvas(ctx.source, ctx.dest, effect as GrayscaleEffect);
};

export const defaultCanvasHueSaturationEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyHueSaturationEffectToCanvas(ctx.source, ctx.dest, effect as HueSaturationEffect);
};

export const defaultCanvasInvertEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyInvertEffectToCanvas(ctx.source, ctx.dest, effect as InvertEffect);
};

export const defaultCanvasLiftGammaGainEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyLiftGammaGainEffectToCanvas(ctx.source, ctx.dest, effect as LiftGammaGainEffect);
};

export const defaultCanvasLookupTableGradeEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyLookupTableGradeEffectToCanvas(ctx.source, ctx.dest, effect as LookupTableGradeEffect);
};

export const defaultCanvasPosterizeEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyPosterizeEffectToCanvas(ctx.source, ctx.dest, effect as PosterizeEffect);
};

export const defaultCanvasSepiaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySepiaEffectToCanvas(ctx.source, ctx.dest, effect as SepiaEffect);
};

export const defaultCanvasWhiteBalanceEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyWhiteBalanceEffectToCanvas(ctx.source, ctx.dest, effect as WhiteBalanceEffect);
};
