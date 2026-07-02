import type { CanvasRenderTarget } from '@flighthq/types';

// Shared Canvas 2D draw helpers for effect recipes. These keep every recipe's compositing boilerplate
// — save/restore, transform reset, alpha/filter reset, clearing — in one place so each apply* function
// is just its own filter string or draw-op logic.

// Accumulates `samples` draws of `source` into `dest` using overlapping globalAlpha, where each draw
// is positioned / scaled by `perSampleTransform`. The shared primitive behind directional blur, radial
// blur, motion blur, and god-rays. `dest` is cleared before the first draw. Each sample draws with
// alpha = 1/samples so that the accumulated result integrates to ~1 over the full sample count.
// `perSampleTransform` receives the zero-based sample index and the total sample count and must apply
// any 2D transform to `ctx` (translate, scale, rotate) before the drawImage call.
export function drawCanvasAccumulationPass(
  dest: Readonly<CanvasRenderTarget>,
  source: Readonly<CanvasRenderTarget>,
  samples: number,
  perSampleTransform: (ctx: CanvasRenderingContext2D, index: number, total: number) => void,
): void {
  const clampedSamples = Math.max(1, Math.round(samples));
  const ctx = dest.context;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, dest.width, dest.height);
  ctx.globalAlpha = 1 / clampedSamples;
  for (let i = 0; i < clampedSamples; i++) {
    ctx.save();
    perSampleTransform(ctx, i, clampedSamples);
    ctx.drawImage(source.canvas, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// Draws `source` into `dest` 1:1 with an optional CSS filter chain and globalCompositeOperation,
// resetting transform/alpha/filter first so a recipe never inherits a caller's canvas state. `dest` is
// cleared before drawing so the result is exactly `source` under the given filter, not blended over
// stale pixels.
export function drawCanvasEffectPass(
  dest: Readonly<CanvasRenderTarget>,
  source: Readonly<CanvasRenderTarget>,
  filter: string,
  compositeOperation: GlobalCompositeOperation = 'source-over',
): void {
  const ctx = dest.context;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, dest.width, dest.height);
  ctx.globalCompositeOperation = compositeOperation;
  ctx.filter = filter;
  ctx.drawImage(source.canvas, 0, 0);
  ctx.restore();
}

// Reads all pixels from `source` into an ImageData buffer, applies `transform` over the raw RGBA
// bytes, then writes the result into `dest`. `transform` receives the RGBA Uint8ClampedArray and
// the pixel count; it should mutate the array in place. `dest` is cleared before writing. This is
// the per-pixel pass primitive for effects that have no CSS filter equivalent but are expressible
// via getImageData / putImageData on Canvas 2D.
export function drawCanvasImageDataPass(
  dest: Readonly<CanvasRenderTarget>,
  source: Readonly<CanvasRenderTarget>,
  transform: (data: Uint8ClampedArray, pixelCount: number) => void,
): void {
  const w = source.width;
  const h = source.height;
  if (w <= 0 || h <= 0) return;
  const srcCtx = source.context;
  const imageData = srcCtx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const pixelCount = w * h;
  transform(data, pixelCount);
  const dstCtx = dest.context;
  dstCtx.save();
  dstCtx.setTransform(1, 0, 0, 1, 0, 0);
  dstCtx.globalAlpha = 1;
  dstCtx.globalCompositeOperation = 'source-over';
  dstCtx.filter = 'none';
  dstCtx.clearRect(0, 0, dest.width, dest.height);
  dstCtx.putImageData(imageData, 0, 0);
  dstCtx.restore();
}

// Copies `source` into `dest` unchanged. The Canvas realization for effects not carried out on Canvas 2D
// — either genuinely unsupportable here (they need a depth/normal, velocity, or temporal-history buffer the
// 2D context does not expose) or expressible per-pixel via getImageData/putImageData but not yet
// implemented. Either way the pipeline stage is preserved so the registry stays populated for parity, but
// the image is untouched.
export function passthroughCanvasEffectPass(
  dest: Readonly<CanvasRenderTarget>,
  source: Readonly<CanvasRenderTarget>,
): void {
  drawCanvasEffectPass(dest, source, 'none');
}
