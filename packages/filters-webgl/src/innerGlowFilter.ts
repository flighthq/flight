import type { WebGLRenderStateInternal, WebGLRenderTarget } from '@flighthq/render-webgl';
import type { InnerGlowFilter } from '@flighthq/types';
import type { WebGLRenderState } from '@flighthq/types';

import { applyBlurFilterToWebGL } from './blurFilter';
import type { WebGLDualSourceLocations } from './filterPass';
import { clearWebGLFilterTarget, compileWebGLFilterProgram, drawWebGLDualSourcePass } from './filterPass';
import { applyBlitPass, applyInvertTintPass } from './tintShader';

// Clips unit-0 (blurred inverted-alpha mask) to the source alpha from unit-1.
// The blurred inverted alpha is highest near interior edges; clipping to
// source alpha removes any glow that spilled outside the shape boundary.
const INNER_CLIP_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_texture2;
out vec4 fragColor;
void main() {
  vec4 glow = texture(u_texture, v_texCoord);
  float srcAlpha = texture(u_texture2, v_texCoord).a;
  fragColor = glow * srcAlpha;
}`;

type InnerClipLocations = WebGLDualSourceLocations;

const clipShaders = new WeakMap<WebGLRenderState, InnerClipLocations>();

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
export function applyInnerGlowFilterToWebGL(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  scratch: WebGLRenderTarget[],
  filter: Readonly<Omit<InnerGlowFilter, 'type'>>,
): void {
  const color = filter.color ?? 0xff0000;
  const alpha = filter.alpha ?? 1;
  const strength = filter.strength ?? 1;
  const quality = Math.max(1, Math.round(filter.quality ?? 1));

  const [s0, s1, s2] = scratch;

  // Pass 1: invert source alpha and tint with glow color → s0
  applyInvertTintPass(state, source, s0, color, alpha, strength);

  // Pass 2: blur → s1 (s2 is ping-pong temp)
  applyBlurFilterToWebGL(state, s0, s1, s2, { blurX: filter.blurX ?? 6, blurY: filter.blurY ?? 6, quality });

  // Pass 3: clip blurred glow (s1) to source alpha, output to s0 (s1 no longer needed)
  applyInnerClipPass(state, s1, source, s0);

  // Final composite: source first, then clipped glow on top
  clearWebGLFilterTarget(state, dest);
  applyBlitPass(state, source, dest);
  applyBlitPass(state, s0, dest);
}

function applyInnerClipPass(
  state: WebGLRenderState,
  glow: WebGLRenderTarget,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
): void {
  const loc = getClipShader(state);
  drawWebGLDualSourcePass(state, glow, source, dest, loc, () => {});
}

function getClipShader(state: WebGLRenderState): InnerClipLocations {
  let loc = clipShaders.get(state);
  if (loc === undefined) {
    const gl = (state as WebGLRenderStateInternal).gl;
    const base = compileWebGLFilterProgram(gl, INNER_CLIP_FRAGMENT_SRC);
    loc = { ...base, locTexture2: gl.getUniformLocation(base.program, 'u_texture2')! };
    clipShaders.set(state, loc);
  }
  return loc;
}
