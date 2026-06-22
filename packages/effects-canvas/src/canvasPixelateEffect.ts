import type {
  CanvasRenderEffectRunner,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
  PixelateEffect,
} from '@flighthq/types';

import { acquireCanvasRenderTarget, releaseCanvasRenderTarget } from './canvasRenderEffectPipeline';

// Pixelate (REAL): downscale the scene to (width/size, height/size) on a scratch canvas, then upscale
// back to full size with imageSmoothingEnabled=false so the blocks stay hard-edged — the canonical 2D
// mosaic.
export function applyPixelateEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<PixelateEffect>,
): void {
  const size = Math.max(1, Math.round(effect.size ?? 8));
  const smallW = Math.max(1, Math.floor(source.width / size));
  const smallH = Math.max(1, Math.floor(source.height / size));

  const small = acquireCanvasRenderTarget(pool, smallW, smallH);
  const sctx = small.context;
  sctx.save();
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = 'source-over';
  sctx.globalAlpha = 1;
  sctx.filter = 'none';
  sctx.imageSmoothingEnabled = true;
  sctx.clearRect(0, 0, smallW, smallH);
  sctx.drawImage(source.canvas, 0, 0, source.width, source.height, 0, 0, smallW, smallH);
  sctx.restore();

  const ctx = dest.context;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, dest.width, dest.height);
  ctx.drawImage(small.canvas, 0, 0, smallW, smallH, 0, 0, dest.width, dest.height);
  ctx.imageSmoothingEnabled = true;
  ctx.restore();

  releaseCanvasRenderTarget(pool, small);
}

export const defaultCanvasPixelateEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyPixelateEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as PixelateEffect);
};
