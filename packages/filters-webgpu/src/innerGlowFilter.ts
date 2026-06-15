import type { InnerGlowFilter } from '@flighthq/types';
import type { WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';

import { applyBoxBlurFilterToWebGPU } from './blurFilter';
import { clearWebGPUFilterTarget } from './filterPass';
import { applyWebGPUBlitPass, applyWebGPUInnerClipPass, applyWebGPUInvertTintPass } from './tintShader';

/**
 * Applies an inner glow to `source`, writing the result to `dest`.
 * The glow appears at the interior edges of the source shape.
 *
 * Algorithm:
 *   1. Invert-tint pass: extracts inverted alpha, tinted with glow color.
 *   2. Blur pass: spreads the inverted tint toward the interior.
 *   3. Clip pass: multiplies the blurred glow by the source alpha to confine
 *      it inside the shape boundary.
 *   4. Composite: source + clipped glow.
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`.
 * The filter allocates nothing itself.
 */
export function applyInnerGlowFilterToWebGPU(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  scratch: WebGPURenderTarget[],
  filter: Readonly<Omit<InnerGlowFilter, 'type'>>,
): void {
  const color = filter.color ?? 0xff0000;
  const alpha = filter.alpha ?? 1;
  const strength = filter.strength ?? 1;
  const quality = Math.max(1, Math.round(filter.quality ?? 1));

  const [s0, s1, s2] = scratch;

  applyWebGPUInvertTintPass(state, source, s0, color, alpha, strength);
  applyBoxBlurFilterToWebGPU(state, s0, s1, s2, {
    blurX: filter.blurX ?? 6,
    blurY: filter.blurY ?? 6,
    passes: quality,
  });
  applyWebGPUInnerClipPass(state, s1, source, s0);

  clearWebGPUFilterTarget(state, dest);
  applyWebGPUBlitPass(state, source, dest);
  applyWebGPUBlitPass(state, s0, dest);
}
