import type { CanvasRenderTarget } from '@flighthq/types';

// Shared Canvas 2D draw helpers for effect recipes. These keep every recipe's compositing boilerplate
// — save/restore, transform reset, alpha/filter reset, clearing — in one place so each apply* function
// is just its own filter string or draw-op logic.

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

// Copies `source` into `dest` unchanged. The Canvas realization of an effect that has no reasonable
// Canvas 2D path (shader-only): the pipeline stage is preserved so the registry stays populated for
// parity, but the image is untouched.
export function passthroughCanvasEffectPass(
  dest: Readonly<CanvasRenderTarget>,
  source: Readonly<CanvasRenderTarget>,
): void {
  drawCanvasEffectPass(dest, source, 'none');
}
