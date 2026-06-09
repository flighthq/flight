import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import { createWebGLRenderTarget, destroyWebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderState } from '@flighthq/types';

import type { DropShadowFilter } from './index';
import { applyWebGLBlurFilter } from './webglBlurFilter';
import { clearWebGLFilterTarget } from './webglFilterPass';
import { applyBlitOffsetPass, applyBlitPass, applyTintPass } from './webglTintShader';

/**
 * Applies a drop shadow filter to `source` and writes the result to `dest`.
 * Rendering order: shadow (at offset, behind object) → source (unless
 * hideObject is true). Uses three internal render targets for the tint,
 * blur, and final composition passes.
 *
 * inner and knockout shadows are not yet supported by the WebGL path.
 */
export function applyWebGLDropShadowFilter(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  options: Omit<DropShadowFilter, 'type'> = {},
): void {
  const angle = ((options.angle ?? 45) * Math.PI) / 180;
  const distance = options.distance ?? 4;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  const color = options.color ?? 0;
  const alpha = options.alpha ?? 1;
  const strength = options.strength ?? 1;
  const blurX = options.blurX ?? 4;
  const blurY = options.blurY ?? 4;
  const quality = options.quality ?? 1;
  const hideObject = options.hideObject ?? false;

  const w = source.width;
  const h = source.height;

  const mask = createWebGLRenderTarget(state, w, h);
  const blurTemp = createWebGLRenderTarget(state, w, h);

  // Pass 1: extract alpha and tint with shadow color → mask
  applyTintPass(state, source, mask, color, alpha, strength);

  // Pass 2–3: blur the tinted mask (mask ↔ blurTemp ping-pong)
  applyWebGLBlurFilter(state, mask, blurTemp, { blurX, blurY, quality });

  // blurTemp now holds the blurred, tinted shadow mask.

  // Pass 4: clear dest, draw shadow at offset
  clearWebGLFilterTarget(state, dest);
  applyBlitOffsetPass(state, blurTemp, dest, dx, dy);

  // Pass 5: composite source over shadow (unless hideObject)
  if (!hideObject) {
    applyBlitPass(state, source, dest);
  }

  destroyWebGLRenderTarget(state, mask);
  destroyWebGLRenderTarget(state, blurTemp);
}
