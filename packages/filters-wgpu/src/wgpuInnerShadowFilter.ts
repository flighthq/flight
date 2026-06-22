import type { InnerShadowFilter } from '@flighthq/types';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { applyWgpuBlitOffsetPass, applyWgpuBlitPass } from './wgpuBlitShader';
import { applyBoxBlurFilterToWgpu } from './wgpuBlurFilter';
import { clearWgpuFilterTarget } from './wgpuFilterPass';
import { applyWgpuInnerClipPass, applyWgpuInvertTintPass } from './wgpuTintShader';

/**
 * Applies an inner shadow to `source`, writing the result to `dest`.
 * The shadow appears at interior edges of the source shape, offset by angle/distance.
 *
 * Algorithm:
 *   1. Invert-tint pass: extracts inverted alpha, tinted with shadow color.
 *   2. Blur pass.
 *   3. Offset pass: shifts the blurred shadow by the angle/distance.
 *   4. Clip pass: clips the offset shadow to source alpha (keeps shadow inside shape).
 *   5. Composite: source + clipped shadow.
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`.
 * The filter allocates nothing itself.
 */
export function applyInnerShadowFilterToWgpu(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget,
  scratch: WgpuRenderTarget[],
  filter: Readonly<Omit<InnerShadowFilter, 'kind'>>,
): void {
  const angle = ((filter.angle ?? 45) * Math.PI) / 180;
  const distance = filter.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const color = filter.color ?? 0;
  const alpha = filter.alpha ?? 1;
  const strength = filter.strength ?? 1;
  const quality = Math.max(1, Math.round(filter.quality ?? 1));

  const [s0, s1, s2] = scratch;

  applyWgpuInvertTintPass(state, source, s0, color, alpha, strength);
  applyBoxBlurFilterToWgpu(state, s0, s1, s2, {
    blurX: filter.blurX ?? 4,
    blurY: filter.blurY ?? 4,
    passes: quality,
  });
  applyWgpuBlitOffsetPass(state, s1, s0, dx, dy);
  applyWgpuInnerClipPass(state, s0, source, s1);

  clearWgpuFilterTarget(state, dest);
  applyWgpuBlitPass(state, source, dest);
  applyWgpuBlitPass(state, s1, dest);
}
