import type { CanvasRenderEffectRunner, CanvasRenderTarget, ScanlinesEffect } from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';

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

export const defaultCanvasScanlinesEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyScanlinesEffectToCanvas(ctx.source, ctx.dest, effect as ScanlinesEffect);
};
