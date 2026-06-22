import type { CanvasRenderEffectRunner, CanvasRenderTarget, VignetteEffect } from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';

// Vignette (REAL): draw the scene, then overlay a radial gradient — transparent inside `radius`,
// ramping to the vignette color over `softness` toward the corners — using the 'multiply' composite op
// so the edges darken toward the color. Intensity and the color's alpha scale the darkening.
export function applyVignetteEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<VignetteEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const radius = effect.radius ?? 0.75;
  const softness = effect.softness ?? 0.45;
  const color = effect.color ?? 0x000000ff;
  const colorAlpha = (color & 0xff) / 255;
  const darken = Math.max(0, Math.min(1, intensity * colorAlpha));

  drawCanvasEffectPass(dest, source, 'none');

  const ctx = dest.context;
  const w = dest.width;
  const h = dest.height;
  const cx = w * 0.5;
  const cy = h * 0.5;
  // The vignette math measures distance to the corner as 1.0 (matching the Gl recipe's diagonal
  // normalization), so the gradient's outer radius is half the diagonal.
  const outer = Math.sqrt(cx * cx + cy * cy);
  const inner = Math.max(0, Math.min(radius, 1)) * outer;
  const ramp = Math.max(0, inner - softness * outer);

  const gradient = ctx.createRadialGradient(cx, cy, ramp, cx, cy, outer);
  // Opaque-at-center color string with alpha replaced by the darken amount at the rim.
  const r = (color >>> 24) & 0xff;
  const g = (color >>> 16) & 0xff;
  const b = (color >>> 8) & 0xff;
  gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},${darken.toFixed(4)})`);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.filter = 'none';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export const defaultCanvasVignetteEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyVignetteEffectToCanvas(ctx.source, ctx.dest, effect as VignetteEffect);
};
