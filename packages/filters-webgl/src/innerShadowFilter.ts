import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import type { InnerShadowFilter } from '@flighthq/types';
import type { WebGLRenderState } from '@flighthq/types';

import { applyBoxBlurFilterToWebGL } from './blurFilter';
import type { WebGLDualSourceLocations } from './filterPass';
import { clearWebGLFilterTarget, compileWebGLFilterProgram, drawWebGLDualSourcePass } from './filterPass';
import { applyWebGLBlitOffsetPass, applyWebGLBlitPass, applyWebGLInvertTintPass } from './tintShader';

// Why: all filter passes use ONE/ONE_MINUS_SRC_ALPHA premultiplied blending — they never
// implicitly clear their destination. Reusing a scratch target without clearing first means
// the previous pass's content bleeds through wherever the new pass's alpha is 0. Clearing
// before each reuse gives clean replacement semantics.

// Same clip shader as innerGlowFilter — clips unit-0 glow to unit-1 source alpha.
const INNER_CLIP_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_texture2;
out vec4 fragColor;
void main() {
  vec4 shadow = texture(u_texture, v_texCoord);
  float srcAlpha = texture(u_texture2, v_texCoord).a;
  fragColor = shadow * srcAlpha;
}`;

type InnerClipLocations = WebGLDualSourceLocations;

const clipShaders = new WeakMap<WebGLRenderState, InnerClipLocations>();

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
export function applyInnerShadowFilterToWebGL(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  scratch: WebGLRenderTarget[],
  filter: Readonly<Omit<InnerShadowFilter, 'type'>>,
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

  // Pass 1: invert source alpha and tint with shadow color → s0
  applyWebGLInvertTintPass(state, source, s0, color, alpha, strength);

  // Pass 2: blur → s1 (s2 is ping-pong temp)
  applyBoxBlurFilterToWebGL(state, s0, s1, s2, { blurX: filter.blurX ?? 4, blurY: filter.blurY ?? 4, passes: quality });

  // Pass 3: shift the blurred shadow by the offset → s0 (s1 no longer needed).
  // s0 still holds pass-1 content; clear it so the offset blit doesn't blend on top of it.
  clearWebGLFilterTarget(state, s0);
  applyWebGLBlitOffsetPass(state, s1, s0, dx, dy);

  // Pass 4: clip offset shadow (s0) to source alpha → s1.
  // s1 still holds pass-2 blur content; clear it before the clip blit.
  clearWebGLFilterTarget(state, s1);
  applyWebGLInnerClipPass(state, s0, source, s1);

  // Final composite: source first, then clipped shadow on top
  clearWebGLFilterTarget(state, dest);
  applyWebGLBlitPass(state, source, dest);
  applyWebGLBlitPass(state, s1, dest);
}

function applyWebGLInnerClipPass(
  state: WebGLRenderState,
  shadow: WebGLRenderTarget,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
): void {
  const loc = getClipShader(state);
  drawWebGLDualSourcePass(state, shadow, source, dest, loc, () => {});
}

function getClipShader(state: WebGLRenderState): InnerClipLocations {
  let loc = clipShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileWebGLFilterProgram(gl, INNER_CLIP_FRAGMENT_SRC);
    loc = { ...base, locTexture2: gl.getUniformLocation(base.program, 'u_texture2')! };
    clipShaders.set(state, loc);
  }
  return loc;
}
