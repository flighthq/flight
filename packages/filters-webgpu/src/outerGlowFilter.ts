import type { OuterGlowFilter } from '@flighthq/types';
import type { WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';

import { applyBoxBlurFilterToWebGPU } from './blurFilter';
import { clearWebGPUFilterTarget } from './filterPass';
import { applyBlitPass, applyTintPass } from './tintShader';

/**
 * Applies an outer glow filter to `source`, writing the result to `dest`.
 * Compositing order: glow (centered, no offset) → source (unless `knockout`).
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`
 * (tint mask, blurred glow, and the blur's ping-pong temp). The filter
 * allocates nothing itself.
 */
export function applyOuterGlowFilterToWebGPU(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  scratch: WebGPURenderTarget[],
  filter: Readonly<Omit<OuterGlowFilter, 'type'>>,
): void {
  const color = filter.color ?? 0xff0000;
  const alpha = filter.alpha ?? 1;
  const strength = filter.strength ?? 1;
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const knockout = filter.knockout ?? false;

  const tintStrength = Math.min(1, strength);
  const glowPasses = Math.max(1, Math.floor(strength));

  const [mask, blurred, blurTemp] = scratch;

  applyTintPass(state, source, mask, color, alpha, tintStrength);
  applyBoxBlurFilterToWebGPU(state, mask, blurred, blurTemp, {
    blurX: filter.blurX ?? 6,
    blurY: filter.blurY ?? 6,
    passes: quality,
  });

  clearWebGPUFilterTarget(state, dest);
  for (let i = 0; i < glowPasses; i++) {
    applyBlitPass(state, blurred, dest);
  }

  if (!knockout) {
    applyBlitPass(state, source, dest);
  }
}
