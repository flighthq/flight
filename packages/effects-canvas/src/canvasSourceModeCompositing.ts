import type { CanvasEffectSourceMode, CanvasRenderTarget } from '@flighthq/types/contract';

export function clearCanvasTarget(dest: Readonly<CanvasRenderTarget>): void {
  const ctx = dest.context;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, dest.width, dest.height);
  ctx.restore();
}

export function compositeCanvasImage(
  dest: Readonly<CanvasRenderTarget>,
  source: Readonly<CanvasRenderTarget>,
  dx = 0,
  dy = 0,
  compositeOperation: GlobalCompositeOperation = 'source-over',
): void {
  const ctx = dest.context;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = compositeOperation;
  ctx.filter = 'none';
  ctx.drawImage(source.canvas, dx, dy);
  ctx.restore();
}

export function compositeCanvasSourceMode(
  dest: Readonly<CanvasRenderTarget>,
  source: Readonly<CanvasRenderTarget>,
  sourceMode: CanvasEffectSourceMode,
): void {
  if (sourceMode === 'hide') return;
  compositeCanvasImage(dest, source, 0, 0, sourceMode === 'knockout' ? 'destination-out' : 'source-over');
}

// The complement of drawCanvasTintedAlphaMask: tint everywhere the source is NOT, with alpha
// proportional to the inverted source alpha. This is what makes an INNER effect inner — the glow or
// shadow originates outside the silhouette and is later blurred across the boundary and clipped back to
// the shape, so the light appears to fall inward from the edge. Blurring the shape's own silhouette
// instead produces an outer effect no amount of clipping can turn inward.
//
// Realized as a full-target fill knocked out by the source rather than a per-pixel inversion, which is
// the same result without a getImageData round trip.
export function drawCanvasInvertedTintedAlphaMask(
  dest: Readonly<CanvasRenderTarget>,
  source: Readonly<CanvasRenderTarget>,
  color: number,
  alpha: number,
  strength: number,
  offsetX = 0,
  offsetY = 0,
): void {
  const ctx = dest.context;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, dest.width, dest.height);
  ctx.fillStyle = cssRgbaFromColor(color, Math.min(1, alpha * strength));
  ctx.fillRect(0, 0, dest.width, dest.height);
  // Knocking out with the source is the inversion. An offset here shifts which side of the boundary the
  // tint survives on, which is how an inner shadow gets its direction.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(source.canvas, offsetX, offsetY);
  ctx.restore();
}

export function drawCanvasTintedAlphaMask(
  dest: Readonly<CanvasRenderTarget>,
  source: Readonly<CanvasRenderTarget>,
  color: number,
  alpha: number,
  strength: number,
): void {
  const ctx = dest.context;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, dest.width, dest.height);
  ctx.drawImage(source.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = cssRgbaFromColor(color, alpha * strength);
  ctx.fillRect(0, 0, dest.width, dest.height);
  ctx.restore();
}

// Takes Flight's packed sRGB `0xRRGGBBAA`; the color's own alpha multiplies the caller's alpha, which is
// the effect-level opacity. One decode point for every canvas tint, so no call site repeats the split.
function cssRgbaFromColor(color: number, alpha: number): string {
  const r = (color >>> 24) & 0xff;
  const g = (color >>> 16) & 0xff;
  const b = (color >>> 8) & 0xff;
  const a = Math.max(0, Math.min(1, alpha * ((color & 0xff) / 255)));
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
