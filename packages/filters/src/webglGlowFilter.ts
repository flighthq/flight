import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import { createWebGLRenderTarget, destroyWebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderState } from '@flighthq/types';

import type { GlowFilter } from './index';
import { applyWebGLBlurFilter } from './webglBlurFilter';
import { clearWebGLFilterTarget } from './webglFilterPass';
import { applyBlitPass, applyTintPass } from './webglTintShader';

/**
 * Applies a glow filter to `source` and writes the result to `dest`.
 * Rendering order: glow (centered, no offset) → source (unless knockout).
 * inner glow is not yet supported by the WebGL path.
 */
export function applyWebGLGlowFilter(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  options: Omit<GlowFilter, 'type'> = {},
): void {
  const color = options.color ?? 0xff0000;
  const alpha = options.alpha ?? 1;
  const strength = options.strength ?? 1;
  const blurX = options.blurX ?? 6;
  const blurY = options.blurY ?? 6;
  const quality = options.quality ?? 1;
  const knockout = options.knockout ?? false;

  const w = source.width;
  const h = source.height;

  const mask = createWebGLRenderTarget(state, w, h);
  const blurred = createWebGLRenderTarget(state, w, h);

  // Pass 1: tint source alpha with glow color → mask
  applyTintPass(state, source, mask, color, alpha, strength);

  // Pass 2–3: blur the tinted mask
  applyWebGLBlurFilter(state, mask, blurred, { blurX, blurY, quality });

  // Pass 4: clear dest, draw glow (centered, no offset)
  clearWebGLFilterTarget(state, dest);
  applyBlitPass(state, blurred, dest);

  // Pass 5: composite source on top (unless knockout)
  if (!knockout) {
    applyBlitPass(state, source, dest);
  }

  destroyWebGLRenderTarget(state, mask);
  destroyWebGLRenderTarget(state, blurred);
}
