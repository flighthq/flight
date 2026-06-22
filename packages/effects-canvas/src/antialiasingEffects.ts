import type { CanvasRenderEffectRunner, CanvasRenderTarget, FxaaEffect, SmaaEffect, TaaEffect } from '@flighthq/types';

import { passthroughCanvasEffectPass } from './canvasEffectCompositing';

// Anti-aliasing recipes on Canvas 2D. All three are per-pixel luminance edge-detection shaders (FXAA,
// SMAA) or need a temporal history buffer + motion vectors (TAA) — none of which the 2D draw-op /
// CSS-filter path can express — so each ships as a passthrough copy to keep the registry populated for
// parity. (Canvas already antialiases vector edges natively during the scene pass.)

// FXAA (PASSTHROUGH): luminance edge detection + directional blend is per-pixel neighbor sampling with
// no CSS/draw-op equivalent. Shader-only.
export function applyFxaaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<FxaaEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// SMAA (PASSTHROUGH): edge-aware blend weights against lookup textures are per-pixel shader work with
// no 2D draw-op path. Shader-only.
export function applySmaaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<SmaaEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

// TAA (PASSTHROUGH): temporal accumulation needs a history buffer and motion vectors absent from the
// single-frame Canvas context. Shader-only / temporal-only.
export function applyTaaEffectToCanvas(
  source: Readonly<CanvasRenderTarget>,
  dest: Readonly<CanvasRenderTarget>,
  _effect: Readonly<TaaEffect>,
): void {
  passthroughCanvasEffectPass(dest, source);
}

export const defaultCanvasFxaaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyFxaaEffectToCanvas(ctx.source, ctx.dest, effect as FxaaEffect);
};

export const defaultCanvasSmaaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applySmaaEffectToCanvas(ctx.source, ctx.dest, effect as SmaaEffect);
};

export const defaultCanvasTaaEffectRunner: CanvasRenderEffectRunner = (ctx, effect) => {
  applyTaaEffectToCanvas(ctx.source, ctx.dest, effect as TaaEffect);
};
