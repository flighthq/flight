import type { CanvasRenderEffectRunner, CanvasRenderTarget, FXAAEffect, SMAAEffect, TAAEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Anti-aliasing recipes on Canvas 2D. All three are per-pixel luminance edge-detection shaders (FXAA,
// SMAA) or need a temporal history buffer + motion vectors (TAA) — none of which the 2D draw-op /
// CSS-filter path can express — so each ships as a passthrough copy to keep the registry populated for
// parity. (Canvas already antialiases vector edges natively during the scene pass.)

// FXAA (PASSTHROUGH): luminance edge detection + directional blend is per-pixel neighbor sampling with
// no CSS/draw-op equivalent. Shader-only.
export function applyFXAAEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<FXAAEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// SMAA (PASSTHROUGH): edge-aware blend weights against lookup textures are per-pixel shader work with
// no 2D draw-op path. Shader-only.
export function applySMAAEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<SMAAEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// TAA (PASSTHROUGH): temporal accumulation needs a history buffer and motion vectors absent from the
// single-frame Canvas context. Shader-only / temporal-only.
export function applyTAAEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<TAAEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasFXAAEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyFXAAEffectToCanvas(ctx.source, ctx.dest, effect as FXAAEffect);
};

export const defaultCanvasSMAAEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySMAAEffectToCanvas(ctx.source, ctx.dest, effect as SMAAEffect);
};

export const defaultCanvasTAAEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyTAAEffectToCanvas(ctx.source, ctx.dest, effect as TAAEffect);
};
