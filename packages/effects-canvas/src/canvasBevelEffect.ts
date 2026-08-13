import { getColorAlpha, getColorRgb } from '@flighthq/color/contract';
import type {
  BevelEffect,
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
} from '@flighthq/types/contract';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import {
  acquireCanvasRenderTarget,
  createCanvasRenderTargetPool,
  releaseCanvasRenderTarget,
} from './canvasRenderEffectPipeline';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';
import { clearCanvasTarget, compositeCanvasImage, drawCanvasTintedAlphaMask } from './canvasSourceModeCompositing';

// Bevel composite effect: light the edge from one direction by differencing two offset copies of the
// blurred silhouette, tint the lit side with the highlight colour and the unlit side with the shadow
// colour, clip the band by `bevelType`, and draw it over the source.
//
// HOW THIS DIFFERS FROM THE GL PASS, because it is a real difference and not a rounding error. GL computes
// a SIGNED gradient per pixel — `m(p - L) - m(p + L)` over the blurred alpha — and picks the highlight or
// shadow colour by the sign, with `|gradient|` as the band's strength. Canvas 2D has no per-fragment
// subtraction: `destination-out` gives `da * (1 - sa)`, which is a multiplicative knockout rather than a
// difference. So each side of the band is built as "the copy shifted toward the light, with the copy
// shifted away knocked out of it", which is the same band in the same place with a slightly softer
// falloff where the two copies overlap. Matching GL exactly would need a `getImageData` round trip per
// frame, which is a different performance class and a decision nobody has made.
//
// Realizing it this way is what keeps the effect on the composite path: blur, two offset draws, two
// knockouts, two tints. `strength` scales the band's alpha, as it scales `|gradient|` on GL.
export function applyBevelEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<BevelEffect>,
): void;
export function applyBevelEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<BevelEffect>,
): void;
export function applyBevelEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  poolOrEffect: CanvasRenderTargetPool | Readonly<BevelEffect>,
  maybeEffect?: Readonly<BevelEffect>,
): void {
  const effect = maybeEffect ?? (poolOrEffect as Readonly<BevelEffect>);
  const pool = maybeEffect === undefined ? createCanvasRenderTargetPool() : (poolOrEffect as CanvasRenderTargetPool);
  applyBevelEffectToCanvasWithPool(source, dest, pool, effect);
}

// Clips the assembled band to the region `bevelType` keeps: inside the shape for 'inner', outside it for
// 'outer', everywhere for 'full'. Exported because the gradient bevel applies the identical rule to a
// ramp-tinted band, and one clip is easier to keep honest than two.
export function clipCanvasBevelBand(
  band: Readonly<CanvasRenderTarget>,
  source: Readonly<CanvasRenderTarget>,
  bevelType: BevelEffect['bevelType'],
): void {
  if (bevelType === 'outer') {
    compositeCanvasImage(band, source, 0, 0, 'destination-out');
    return;
  }
  // 'inner' is the default, matching the GL pass; 'full' deliberately clips nothing.
  if (bevelType !== 'full') compositeCanvasImage(band, source, 0, 0, 'destination-in');
}

export const defaultCanvasBevelEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyBevelEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as BevelEffect);
};

export function registerCanvasBevelEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'BevelEffect', defaultCanvasBevelEffectRunner);
}

function applyBevelEffectToCanvasWithPool(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<BevelEffect>,
): void {
  const blurred = acquireCanvasRenderTarget(pool, source.width, source.height);
  const lit = acquireCanvasRenderTarget(pool, source.width, source.height);
  const shade = acquireCanvasRenderTarget(pool, source.width, source.height);
  const side = acquireCanvasRenderTarget(pool, source.width, source.height);
  const tinted = acquireCanvasRenderTarget(pool, source.width, source.height);
  const band = acquireCanvasRenderTarget(pool, source.width, source.height);

  const strength = Math.min(1, effect.strength ?? 1);
  const blur = Math.max(0, ((effect.blurX ?? 4) + (effect.blurY ?? 4)) / 2);
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  const offsetX = Math.cos(angle) * distance;
  const offsetY = Math.sin(angle) * distance;

  drawCanvasEffectPass(blurred, source, blur > 0 ? `blur(${blur}px)` : 'none');

  // The two offset copies. `lit` is shifted TOWARD the light and `shade` away from it, so the region one
  // covers and the other does not is the edge band facing that direction.
  clearCanvasTarget(lit);
  compositeCanvasImage(lit, blurred, -offsetX, -offsetY);
  clearCanvasTarget(shade);
  compositeCanvasImage(shade, blurred, offsetX, offsetY);

  clearCanvasTarget(band);

  // Highlight side: lit with shade knocked out of it. The knockout must precede the tint — tinting first
  // would fill the whole offset silhouette and the "band" would cover the shape rather than its edge.
  // Both sides are built into `side` and tinted into `tinted`, so neither offset copy is ever written
  // over while the other side still needs to read it.
  clearCanvasTarget(side);
  compositeCanvasImage(side, lit);
  compositeCanvasImage(side, shade, 0, 0, 'destination-out');
  const highlightPacked = effect.highlightColor ?? 0xffffffff;
  drawCanvasTintedAlphaMask(
    tinted,
    side,
    getColorRgb(highlightPacked),
    (effect.highlightAlpha ?? 1) * getColorAlpha(highlightPacked),
    strength,
  );
  compositeCanvasImage(band, tinted);

  // Shadow side: the same difference the other way round.
  clearCanvasTarget(side);
  compositeCanvasImage(side, shade);
  compositeCanvasImage(side, lit, 0, 0, 'destination-out');
  const shadowPacked = effect.shadowColor ?? 0x000000ff;
  drawCanvasTintedAlphaMask(
    tinted,
    side,
    getColorRgb(shadowPacked),
    (effect.shadowAlpha ?? 1) * getColorAlpha(shadowPacked),
    strength,
  );
  compositeCanvasImage(band, tinted);

  clipCanvasBevelBand(band, source, effect.bevelType);

  clearCanvasTarget(dest);
  if ((effect.sourceMode ?? 'draw') !== 'hide') compositeCanvasImage(dest, source);
  compositeCanvasImage(dest, band);

  releaseCanvasRenderTarget(pool, band);
  releaseCanvasRenderTarget(pool, tinted);
  releaseCanvasRenderTarget(pool, side);
  releaseCanvasRenderTarget(pool, shade);
  releaseCanvasRenderTarget(pool, lit);
  releaseCanvasRenderTarget(pool, blurred);
}
