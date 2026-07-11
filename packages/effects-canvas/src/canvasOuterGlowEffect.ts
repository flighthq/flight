import type { CanvasRenderEffectRunner, CanvasRenderTarget, OuterGlowEffect } from '@flighthq/types';

import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { computeOuterGlowEffectCss } from './canvasEffectDropShadowCss';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then composite the source over the glow.
// Canvas 2D realizes the shadow/glow as a CSS `drop-shadow()` filter chain (the same string the DOM
// backend emits). Knockout and anisotropic-blur variants have no CSS equivalent; those pass the scene
// through unchanged rather than faking an approximation.
export function applyOuterGlowEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  effect: Readonly<OuterGlowEffect>,
): void {
  const css = computeOuterGlowEffectCss(effect);
  drawCanvasEffectPass(dest, source, css ?? 'none');
}

export const defaultCanvasOuterGlowEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyOuterGlowEffectToCanvas(ctx.source, ctx.dest, effect as OuterGlowEffect);
};
