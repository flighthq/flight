import { computeBloomBlurRadius } from '@flighthq/effects';
import type {
  BloomEffect,
  CanvasRenderEffectRunner,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
} from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { acquireCanvasRenderTarget, releaseCanvasRenderTarget } from './canvasRenderEffectPipeline';

// Bloom (REAL): bright-pass → blur the bright branch → additively composite back. Multi-pass: it
// acquires a scratch canvas from the pool, isolates bright pixels by pushing contrast hard so dim
// pixels crush to black, blurs that branch, then draws it over the scene with the 'lighter'
// (additive) composite op scaled by intensity (applied via the temp canvas's globalAlpha).
export function applyBloomEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<BloomEffect>,
): void {
  const threshold = effect.threshold ?? 0.8;
  const intensity = effect.intensity ?? 1;
  const radius = computeBloomBlurRadius(effect);

  // Bright pass: crush sub-threshold pixels toward black with a high-contrast / low-brightness CSS
  // chain. contrast amplifies the gap around mid-grey; the brightness shift biases the crush point so
  // a higher threshold keeps fewer pixels lit.
  const contrast = 1 + threshold * 6;
  const brightnessShift = 1 - threshold;
  const bright = acquireCanvasRenderTarget(pool, source.width, source.height);
  drawCanvasEffectPass(bright, source, `contrast(${contrast}) brightness(${brightnessShift})`);

  // Blur the bright branch in place via a second scratch canvas (CSS blur draws blurred → blurred2).
  const blurred = acquireCanvasRenderTarget(pool, source.width, source.height);
  if (radius > 0) {
    drawCanvasEffectPass(blurred, bright, `blur(${radius}px)`);
  } else {
    drawCanvasEffectPass(blurred, bright, 'none');
  }

  // Composite: scene first, then the bloom branch added on top (additive 'lighter'), scaled by intensity.
  drawCanvasEffectPass(dest, source, 'none');
  const ctx = dest.context;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.max(0, Math.min(1, intensity));
  ctx.filter = 'none';
  ctx.drawImage(blurred.canvas, 0, 0);
  ctx.restore();

  releaseCanvasRenderTarget(pool, bright);
  releaseCanvasRenderTarget(pool, blurred);
}

export const defaultCanvasBloomEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyBloomEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as BloomEffect);
};
