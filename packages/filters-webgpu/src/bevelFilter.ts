import type { BevelFilter } from '@flighthq/types';
import type { WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';

import { applyBoxBlurFilterToWebGPU } from './blurFilter';
import { clearWebGPUFilterTarget } from './filterPass';
import { applyBlitOffsetPass, applyBlitPass, applyTintPass } from './tintShader';

/**
 * Applies a bevel filter to `source`, writing the result to `dest`.
 *
 * Compositing order:
 *   1. Shadow layer (blurred alpha at +offset, shadow color)
 *   2. Highlight layer (blurred alpha at -offset, highlight color)
 *   3. Source on top (unless `knockout`)
 *
 * `bevelType` controls which layers are drawn:
 *   - `'full'` (default): both shadow and highlight
 *   - `'outer'`: shadow and highlight placed outside the source boundary
 *   - `'inner'`: shadow and highlight placed inside the source boundary
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`.
 * The filter allocates nothing itself.
 */
export function applyBevelFilterToWebGPU(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  scratch: WebGPURenderTarget[],
  filter: Readonly<Omit<BevelFilter, 'type'>>,
): void {
  const angle = ((filter.angle ?? 45) * Math.PI) / 180;
  const distance = filter.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const shadowColor = filter.shadowColor ?? 0x000000;
  const shadowAlpha = filter.shadowAlpha ?? 1;
  const highlightColor = filter.highlightColor ?? 0xffffff;
  const highlightAlpha = filter.highlightAlpha ?? 1;
  const strength = filter.strength ?? 1;
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const knockout = filter.knockout ?? false;
  const bevelType = filter.bevelType ?? 'full';

  const [tinted, blurred, blurTemp] = scratch;

  applyTintPass(state, source, tinted, 0xffffff, 1, strength);
  applyBoxBlurFilterToWebGPU(state, tinted, blurred, blurTemp, {
    blurX: filter.blurX ?? 4,
    blurY: filter.blurY ?? 4,
    passes: quality,
  });

  clearWebGPUFilterTarget(state, dest);

  if (bevelType === 'full' || bevelType === 'outer') {
    applyTintPass(state, blurred, tinted, shadowColor, shadowAlpha, 1);
    applyBlitOffsetPass(state, tinted, dest, dx, dy);
    applyTintPass(state, blurred, tinted, highlightColor, highlightAlpha, 1);
    applyBlitOffsetPass(state, tinted, dest, -dx, -dy);
  } else {
    // inner: shadow at -offset, highlight at +offset
    applyTintPass(state, blurred, tinted, shadowColor, shadowAlpha, 1);
    applyBlitOffsetPass(state, tinted, dest, -dx, -dy);
    applyTintPass(state, blurred, tinted, highlightColor, highlightAlpha, 1);
    applyBlitOffsetPass(state, tinted, dest, dx, dy);
  }

  if (!knockout) {
    applyBlitPass(state, source, dest);
  }
}
