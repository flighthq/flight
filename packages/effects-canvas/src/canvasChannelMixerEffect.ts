import type { CanvasRenderEffectRunner, CanvasRenderTarget, ChannelMixerEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Channel mixer (PASSTHROUGH): an arbitrary 3x4 RGB->RGB matrix per pixel has no CSS filter equivalent;
// CSS has no programmable color matrix on a 2D context. Shader-only.
export function applyChannelMixerEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<ChannelMixerEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasChannelMixerEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyChannelMixerEffectToCanvas(ctx.source, ctx.dest, effect as ChannelMixerEffect);
};
