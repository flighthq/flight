import type {
  CanvasRenderEffectRunner,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
  FilmGrainEffect,
} from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { acquireCanvasRenderTarget, releaseCanvasRenderTarget } from './canvasRenderEffectPipeline';

// Film grain (REAL): draw the scene, then overlay a tiled noise pattern at `intensity` via the
// 'overlay' composite op. The noise is generated once into a small scratch canvas (cell size from
// `size`, jittered by `seed`) and tiled across the frame as a repeating fill pattern.
export function applyFilmGrainEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  pool: CanvasRenderTargetPool,
  effect: Readonly<FilmGrainEffect>,
): void {
  const intensity = effect.intensity ?? 0.1;
  const size = Math.max(1, Math.round(effect.size ?? 1));
  const seed = effect.seed ?? 0;

  drawCanvasEffectPass(dest, source, 'none');

  // Build a tileable noise patch. A 64-cell square keeps the pattern allocation small while large
  // enough to avoid an obvious repeat.
  const cells = 64;
  const patchSize = cells * size;
  const noise = acquireCanvasRenderTarget(pool, patchSize, patchSize);
  const nctx = noise.context;
  nctx.save();
  nctx.setTransform(1, 0, 0, 1, 0, 0);
  nctx.globalCompositeOperation = 'source-over';
  nctx.filter = 'none';
  nctx.clearRect(0, 0, patchSize, patchSize);
  let s = seed;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      // Cheap deterministic hash so the grain is stable for a given seed and animatable by changing it.
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = Math.floor((s / 0x7fffffff) * 255);
      nctx.fillStyle = `rgb(${v},${v},${v})`;
      nctx.fillRect(x * size, y * size, size, size);
    }
  }
  nctx.restore();

  const ctx = dest.context;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = Math.max(0, Math.min(1, intensity));
  const pattern = ctx.createPattern(noise.canvas, 'repeat');
  if (pattern !== null) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, dest.width, dest.height);
  }
  ctx.restore();

  releaseCanvasRenderTarget(pool, noise);
}

export const defaultCanvasFilmGrainEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyFilmGrainEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as FilmGrainEffect);
};
