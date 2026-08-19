import { computeBloomBlurRadius } from '@flighthq/effects/contract';
import type {
  BloomEffect,
  CanvasRenderEffectRunner,
  CanvasRenderState,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
} from '@flighthq/types/contract';

import { drawCanvasEffectPass, drawCanvasImageDataPass } from './canvasEffectCompositing';
import { acquireCanvasRenderTarget, releaseCanvasRenderTarget } from './canvasRenderEffectPipeline';
import { registerCanvasRenderEffect } from './canvasRenderEffectRegistry';

// Bloom (REAL): bright-pass → blur the bright branch → additively composite back, matching the Gl/Wgpu
// recipe term for term — a LUMINANCE GATE `step(threshold, dot(rgb, (0.2126, 0.7152, 0.0722)))` on the
// bright branch, and `scene + bloom * intensity` on the composite.
//
// ★ BOTH OF THOSE USED TO BE CSS-FILTER APPROXIMATIONS, AND BOTH WERE WRONG IN WAYS A PICTURE SHOWED.
//
// The bright pass was `contrast(1 + threshold*6) brightness(1 - threshold)`, which is PER CHANNEL: CSS
// filters have no notion of luminance, so each channel crushes against the same point independently. A
// yellow tile (255,255,92) lost its blue entirely — 0.36 falls below the crush point — so no blue was
// ever added back, and the tile's core stayed at 92 while Gl's reached 221. A tile whose every channel
// sits above the crush point agreed on both backends, which is the signature that named the cause.
//
// The composite scaled `ctx.globalAlpha` by intensity, and globalAlpha is CLAMPED TO 1 — so an
// intensity of 1.4 was structurally inexpressible, not merely lossy: 1.4 and 1.0 rendered identically,
// verified by measurement. Additive compositing above 1x needs the arithmetic, not the alpha channel.
//
// Both are now per-pixel through `drawCanvasImageDataPass`, the same primitive that made posterize,
// lens distortion and tilt shift reachable when `ctx.filter` could not spell them. The blur BETWEEN
// them stays a CSS blur, which is correct: a blur is spatial and per-channel by nature, so it is the
// one stage where the filter chain and the shader already agree.
export function applyBloomEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<BloomEffect>,
): void {
  const threshold = effect.threshold ?? 0.8;
  const intensity = effect.intensity ?? 1;
  const radius = computeBloomBlurRadius(effect);

  // Bright pass: keep a pixel whole when its LUMINANCE clears the threshold, and zero it otherwise.
  // This is the shader's `step(threshold, l)` and not an approximation of it — the gate is on one
  // luminance value, so a colour with a dim channel survives intact rather than losing that channel.
  const bright = acquireCanvasRenderTarget(pool, source.width, source.height);
  drawCanvasImageDataPass(bright, source, (data, pixelCount) => {
    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const at = pixel * 4;
      const luminance = (0.2126 * data[at]! + 0.7152 * data[at + 1]! + 0.0722 * data[at + 2]!) / 255;
      if (luminance >= threshold) continue;
      data[at] = 0;
      data[at + 1] = 0;
      data[at + 2] = 0;
    }
  });

  // Blur the bright branch in place via a second scratch canvas (CSS blur draws blurred → blurred2).
  const blurred = acquireCanvasRenderTarget(pool, source.width, source.height);
  if (radius > 0) {
    drawCanvasEffectPass(blurred, bright, `blur(${radius}px)`);
  } else {
    drawCanvasEffectPass(blurred, bright, 'none');
  }

  // Composite: `scene + bloom * intensity`, computed rather than composited, because an intensity above
  // 1 has to be expressible. `globalAlpha` cannot carry it — it is clamped to 1, so every intensity at
  // or above 1 produced one picture.
  drawCanvasEffectPass(dest, source, 'none');
  const bloom = blurred.context.getImageData(0, 0, blurred.width, blurred.height).data;
  drawCanvasImageDataPass(dest, dest, (data, pixelCount) => {
    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const at = pixel * 4;
      // Alpha is the scene's, exactly as the shader writes `scene.a` and leaves the bloom's alpha out.
      data[at] = data[at]! + bloom[at]! * intensity;
      data[at + 1] = data[at + 1]! + bloom[at + 1]! * intensity;
      data[at + 2] = data[at + 2]! + bloom[at + 2]! * intensity;
    }
  });

  releaseCanvasRenderTarget(pool, bright);
  releaseCanvasRenderTarget(pool, blurred);
}

export const defaultCanvasBloomEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyBloomEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as BloomEffect);
};

export function registerCanvasBloomEffect(state: CanvasRenderState): void {
  registerCanvasRenderEffect(state, 'BloomEffect', defaultCanvasBloomEffectRunner);
}
