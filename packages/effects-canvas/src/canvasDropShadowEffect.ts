import type { CanvasRenderEffectRunner, CanvasRenderTarget, DropShadowEffect } from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { computeDropShadowEffectCss } from './canvasEffectDropShadowCss';

// Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance, then composite the source over the shadow.
// Canvas 2D realizes the shadow/glow as a CSS `drop-shadow()` filter chain (the same string the DOM
// backend emits). Knockout and anisotropic-blur variants have no CSS equivalent; those pass the scene
// through unchanged rather than faking an approximation.
export function applyDropShadowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<DropShadowEffect>,
): void {
  const css = computeDropShadowEffectCss(effect);
  drawCanvasEffectPass(dest, source, css ?? 'none');
}

export const defaultCanvasDropShadowEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyDropShadowEffectToCanvas(ctx.source, ctx.dest, effect as DropShadowEffect);
};
