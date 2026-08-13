import { unpackColorRgba } from '@flighthq/color/contract';
import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu/contract';
import type {
  InnerShadowEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types/contract';

import { applyWgpuEffectBlitOffsetPass, applyWgpuEffectBlitPass } from './wgpuEffectBlitShader';
import { applyWgpuEffectBoxBlur } from './wgpuEffectBoxBlur';
import { clearWgpuEffectTarget } from './wgpuEffectPass';
import { applyWgpuEffectInnerClipPass, applyWgpuEffectInvertTintPass } from './wgpuEffectTintShader';
import { registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';

// Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance, clip to the source alpha, then apply draw/hide source compositing.
// Full-frame realization: acquires the recipe's three scratch targets from the effect pool, runs the
// multi-pass recipe (invert-tint → box blur → offset → inner clip → composite), then releases them.
export function applyInnerShadowEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  pool: WgpuRenderTargetPool,
  effect: Readonly<InnerShadowEffect>,
): void {
  const src = source as WgpuRenderTarget;
  const dst = dest as WgpuRenderTarget;
  const descriptor = { width: source.width, height: source.height, format: source.format };
  const s0 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s1 = acquireWgpuRenderTarget(state, pool, descriptor);
  const s2 = acquireWgpuRenderTarget(state, pool, descriptor);

  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const color = effect.color ?? 0x000000ff;
  const alpha = effect.alpha ?? 1;
  const strength = effect.strength ?? 1;
  const quality = Math.max(1, Math.round(effect.quality ?? 1));
  const sourceMode = effect.sourceMode ?? 'draw';

  applyWgpuEffectInvertTintPass(state, src, s0, color, alpha, strength);
  applyWgpuEffectBoxBlur(state, s0, s1, s2, {
    blurX: effect.blurX ?? 4,
    blurY: effect.blurY ?? 4,
    edgeColor: getInvertTintEdgeColor(color, alpha, strength),
    passes: quality,
  });
  applyWgpuEffectBlitOffsetPass(state, s1, s0, dx, dy);
  applyWgpuEffectInnerClipPass(state, s0, src, s1);

  clearWgpuEffectTarget(state, dst);
  if (sourceMode === 'draw') {
    applyWgpuEffectBlitPass(state, src, dst);
  }
  applyWgpuEffectBlitPass(state, s1, dst);

  releaseWgpuRenderTarget(pool, s0);
  releaseWgpuRenderTarget(pool, s1);
  releaseWgpuRenderTarget(pool, s2);
}

export const defaultWgpuInnerShadowEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyInnerShadowEffectToWgpu(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as InnerShadowEffect);
};

export function registerWgpuInnerShadowEffect(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'InnerShadowEffect', defaultWgpuInnerShadowEffectRunner);
}

function getInvertTintEdgeColor(
  color: number,
  alpha: number,
  strength: number,
): readonly [number, number, number, number] {
  // The color is packed RGBA, so its own alpha multiplies the effect-level one before the premultiply.
  unpackColorRgba(scratchEdge, color);
  const edgeAlpha = Math.min(1, alpha * scratchEdge[3] * strength);
  return [scratchEdge[0] * edgeAlpha, scratchEdge[1] * edgeAlpha, scratchEdge[2] * edgeAlpha, edgeAlpha];
}

// Reused per draw by the edge-color computation above; never escapes this module.
const scratchEdge: [number, number, number, number] = [0, 0, 0, 0];
