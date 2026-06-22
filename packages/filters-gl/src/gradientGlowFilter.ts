import type { GlRenderTarget } from '@flighthq/render-gl';
import { clearGlRenderTarget, compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GradientGlowFilter } from '@flighthq/types';
import type { GlFullscreenProgram, GlRenderState } from '@flighthq/types';

import { applyBoxBlurFilterToGl } from './blurFilter';
import { createGlGradientRampTexture } from './gradientRamp';
import { applyGlBlitPass, applyGlTintPass } from './tintShader';

// Uses the blurred alpha (unit 0) to index into a gradient ramp texture (unit 1).
// Outputs the gradient-colored glow at the correct intensity per pixel.
const GRADIENT_LOOKUP_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_ramp;
out vec4 fragColor;
void main() {
  float alpha = texture(u_texture, v_texCoord).a;
  fragColor = texture(u_ramp, vec2(alpha, 0.5));
}`;

type GradientLookupLocations = GlFullscreenProgram & {
  locRamp: WebGLUniformLocation;
};

const lookupShaders = new WeakMap<GlRenderState, GradientLookupLocations>();

/**
 * Applies a gradient glow to `source`, writing the result to `dest`.
 * The gradient ramp is built each call from `filter.colors`, `filter.alphas`,
 * and `filter.ratios` — cache the filter object to amortize this cost, or
 * pre-build a texture with `createGlGradientRampTexture` and draw with the
 * lower-level shader directly.
 *
 * Compositing order: gradient glow → source on top.
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`.
 * The filter allocates a temporary `WebGLTexture` internally on each call.
 */
export function applyGradientGlowFilterToGl(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  scratch: GlRenderTarget[],
  filter: Readonly<Omit<GradientGlowFilter, 'type'>>,
): void {
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const strength = filter.strength ?? 1;

  const [s0, s1, s2] = scratch;
  const gl = state.gl;

  // Extract alpha as a neutral (white) mask, then blur → s1
  applyGlTintPass(state, source, s0, 0xffffff, 1, Math.min(1, strength));
  applyBoxBlurFilterToGl(state, s0, s1, s2, { blurX: filter.blurX ?? 6, blurY: filter.blurY ?? 6, passes: quality });

  // Build gradient ramp texture and look up the blurred alpha → s0
  const ramp = createGlGradientRampTexture(gl, filter.colors, filter.alphas, filter.ratios);
  applyGradientLookupPass(state, s1, ramp, s0);
  gl.deleteTexture(ramp);

  clearGlRenderTarget(state, dest);
  applyGlBlitPass(state, s0, dest);
  applyGlBlitPass(state, source, dest);
}

function applyGradientLookupPass(
  state: GlRenderState,
  blurred: GlRenderTarget,
  ramp: WebGLTexture,
  dest: GlRenderTarget,
): void {
  const loc = getLookupShader(state);
  drawGlFullscreenPass(state, loc, [blurred.texture], dest, (gl) => {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ramp);
    gl.uniform1i(loc.locRamp, 1);
    gl.activeTexture(gl.TEXTURE0);
  });
}

function getLookupShader(state: GlRenderState): GradientLookupLocations {
  let loc = lookupShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, GRADIENT_LOOKUP_FRAGMENT_SRC);
    loc = { ...base, locRamp: gl.getUniformLocation(base.program, 'u_ramp')! };
    lookupShaders.set(state, loc);
  }
  return loc;
}
