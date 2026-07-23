import type { CanvasEffectSourceMode, CanvasRenderTarget } from '@flighthq/types';

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

function cssRgbaFromColor(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
