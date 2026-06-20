import type {
  CanvasRenderEffectRunner,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
  CRTEffect,
  DitherEffect,
  FilmGrainEffect,
  HalftoneEffect,
  KuwaharaEffect,
  OutlineEffect,
  PixelateEffect,
  ScanlinesEffect,
  SharpenEffect,
  SketchEffect,
} from '@flighthq/types';

import { drawCanvasEffectPass, passthroughCanvasEffectPass } from './canvasEffectCompositing';
import { acquireCanvasRenderTarget, releaseCanvasRenderTarget } from './renderEffectPipeline';

// Stylization recipes on Canvas 2D. Scanlines, pixelate, and film grain have real draw-op
// realizations (line overlay, downscale/upscale with smoothing off, noise overlay). CRT, dither,
// halftone, kuwahara, outline, sharpen, and sketch are per-pixel neighbor-sampling or quantization
// shaders the CSS filter grammar and 2D draw ops cannot express, so they ship as passthrough copies.

// CRT (PASSTHROUGH): barrel distortion + channel split + scanlines + vignette as one shader; the
// distortion and channel split have no 2D draw-op path. Shader-only. (Scanlines alone is realized
// separately by applyScanlinesEffectToCanvas.)
export function applyCRTEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<CRTEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Dither (PASSTHROUGH): ordered-Bayer quantization is per-pixel threshold math with no CSS/draw-op
// equivalent. Shader-only.
export function applyDitherEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<DitherEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

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

// Halftone (PASSTHROUGH): a rotated dot grid carved by per-pixel luminance has no 2D draw-op path.
// Shader-only.
export function applyHalftoneEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<HalftoneEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Kuwahara (PASSTHROUGH): edge-preserving quadrant variance smoothing is a per-pixel neighborhood
// shader with no CSS/draw-op equivalent. Shader-only.
export function applyKuwaharaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<KuwaharaEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Outline (PASSTHROUGH): Sobel edge detection on luminance is a per-pixel neighbor-sampling shader with
// no 2D draw-op path. Shader-only.
export function applyOutlineEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<OutlineEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

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

// Scanlines (REAL): draw the scene, then overlay evenly spaced darkening bands. `count` horizontal
// lines span the frame; each darkens its row by `intensity` via a 'multiply' fill.
export function applyScanlinesEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<ScanlinesEffect>,
): void {
  const count = Math.max(1, Math.round(effect.count ?? 240));
  const intensity = Math.max(0, Math.min(1, effect.intensity ?? 0.3));

  drawCanvasEffectPass(dest, source, 'none');

  const ctx = dest.context;
  const w = dest.width;
  const h = dest.height;
  const spacing = h / count;
  const lineHeight = Math.max(1, spacing * 0.5);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.filter = 'none';
  const dark = 1 - intensity;
  const channel = Math.round(dark * 255);
  ctx.fillStyle = `rgb(${channel},${channel},${channel})`;
  for (let y = 0; y < h; y += spacing) {
    ctx.fillRect(0, Math.round(y), w, lineHeight);
  }
  ctx.restore();
}

// Sharpen (PASSTHROUGH): a Laplacian unsharp-mask kernel is per-pixel neighbor math with no CSS/draw-op
// equivalent. Shader-only.
export function applySharpenEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<SharpenEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// Sketch (PASSTHROUGH): luminance edge detection inverted into pencil strokes is a per-pixel
// neighbor-sampling shader with no 2D draw-op path. Shader-only.
export function applySketchEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<SketchEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasCRTEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyCRTEffectToCanvas(ctx.source, ctx.dest, effect as CRTEffect);
};

export const defaultCanvasDitherEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyDitherEffectToCanvas(ctx.source, ctx.dest, effect as DitherEffect);
};

export const defaultCanvasFilmGrainEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyFilmGrainEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as FilmGrainEffect);
};

export const defaultCanvasHalftoneEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyHalftoneEffectToCanvas(ctx.source, ctx.dest, effect as HalftoneEffect);
};

export const defaultCanvasKuwaharaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyKuwaharaEffectToCanvas(ctx.source, ctx.dest, effect as KuwaharaEffect);
};

export const defaultCanvasOutlineEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyOutlineEffectToCanvas(ctx.source, ctx.dest, effect as OutlineEffect);
};

export const defaultCanvasPixelateEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyPixelateEffectToCanvas(ctx.source, ctx.dest, ctx.pool, effect as PixelateEffect);
};

export const defaultCanvasScanlinesEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyScanlinesEffectToCanvas(ctx.source, ctx.dest, effect as ScanlinesEffect);
};

export const defaultCanvasSharpenEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySharpenEffectToCanvas(ctx.source, ctx.dest, effect as SharpenEffect);
};

export const defaultCanvasSketchEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySketchEffectToCanvas(ctx.source, ctx.dest, effect as SketchEffect);
};
