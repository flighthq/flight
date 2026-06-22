import type { CanvasRenderEffectRunner, CanvasRenderTarget, GlitchEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Glitch (PASSTHROUGH): per-pixel RGB channel separation and hashed block tears have no 2D draw-op
// equivalent (like chromaticAberration). Shader-only.
export function applyGlitchEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<GlitchEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasGlitchEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyGlitchEffectToCanvas(ctx.source, ctx.dest, effect as GlitchEffect);
};
