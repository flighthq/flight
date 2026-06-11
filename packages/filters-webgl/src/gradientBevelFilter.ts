import type { WebGLRenderStateInternal, WebGLRenderTarget } from '@flighthq/render-webgl';
import type { GradientBevelFilter } from '@flighthq/types';
import type { WebGLRenderState } from '@flighthq/types';

import { applyBlurFilterToWebGL } from './blurFilter';
import type { WebGLFilterLocations } from './filterPass';
import { clearWebGLFilterTarget, compileWebGLFilterProgram, drawWebGLFilterPass } from './filterPass';
import { createWebGLGradientRampTexture } from './gradientRamp';
import { applyBlitPass, applyTintPass } from './tintShader';

// Samples the blurred alpha at +offset and -offset to compute a bevel value
// in [-1, 1], mapped to [0, 1] for gradient lookup. Outputs the encoded
// bevel value in the red channel; alpha=1 (will be clipped later).
const BEVEL_ENCODE_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_offset;
out vec4 fragColor;
void main() {
  float high = texture(u_texture, v_texCoord - u_offset).a;
  float low = texture(u_texture, v_texCoord + u_offset).a;
  float bevelVal = clamp((high - low) * 0.5 + 0.5, 0.0, 1.0);
  fragColor = vec4(bevelVal, 0.0, 0.0, 1.0);
}`;

// Looks up the encoded bevel value (in .r) in the gradient ramp and clips
// the result to the source alpha (unit 1 holds the source).
const BEVEL_APPLY_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_ramp;
uniform sampler2D u_source;
out vec4 fragColor;
void main() {
  float bevelVal = texture(u_texture, v_texCoord).r;
  vec4 color = texture(u_ramp, vec2(bevelVal, 0.5));
  float srcAlpha = texture(u_source, v_texCoord).a;
  fragColor = color * srcAlpha;
}`;

type BevelEncodeLocations = WebGLFilterLocations & {
  locOffset: WebGLUniformLocation;
};

type BevelApplyLocations = WebGLFilterLocations & {
  locRamp: WebGLUniformLocation;
  locSource: WebGLUniformLocation;
};

const encodeShaders = new WeakMap<WebGLRenderState, BevelEncodeLocations>();
const applyShaders = new WeakMap<WebGLRenderState, BevelApplyLocations>();

/**
 * Applies a gradient bevel to `source`, writing the result to `dest`.
 * The gradient maps bevel depth (shadow edge → highlight edge) to colors.
 *
 * `scratch` must contain three render targets of the same dimensions as `dest`.
 * The filter allocates a temporary `WebGLTexture` internally on each call.
 */
export function applyGradientBevelFilterToWebGL(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  scratch: WebGLRenderTarget[],
  filter: Readonly<Omit<GradientBevelFilter, 'type'>>,
): void {
  const angle = ((filter.angle ?? 45) * Math.PI) / 180;
  const distance = filter.distance ?? 4;
  const quality = Math.max(1, Math.round(filter.quality ?? 1));
  const strength = filter.strength ?? 1;

  const [s0, s1, s2] = scratch;
  const internal = state as WebGLRenderStateInternal;
  const { gl } = internal;

  // Build blur basis → s1
  applyTintPass(state, source, s0, 0xffffff, 1, Math.min(1, strength));
  applyBlurFilterToWebGL(state, s0, s1, s2, { blurX: filter.blurX ?? 4, blurY: filter.blurY ?? 4, quality });

  // Encode bevel value from blurred alpha offset samples → s0
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance;
  applyBevelEncodePass(state, s1, s0, dx / s1.width, dy / s1.height);

  // Build gradient ramp, apply to encoded bevel value clipped to source alpha → s1
  const ramp = createWebGLGradientRampTexture(gl, filter.colors, filter.alphas, filter.ratios);
  applyBevelApplyPass(state, s0, ramp, source, s1);
  gl.deleteTexture(ramp);

  clearWebGLFilterTarget(state, dest);
  if (!(filter.bevelType && filter.bevelType !== 'full')) {
    applyBlitPass(state, source, dest);
  }
  applyBlitPass(state, s1, dest);
}

function applyBevelEncodePass(
  state: WebGLRenderState,
  blurred: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  dx: number,
  dy: number,
): void {
  const loc = getEncodeShader(state);
  drawWebGLFilterPass(state, blurred, dest, loc, (gl) => {
    gl.uniform2f(loc.locOffset, dx, dy);
  });
}

function applyBevelApplyPass(
  state: WebGLRenderState,
  encoded: WebGLRenderTarget,
  ramp: WebGLTexture,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
): void {
  const loc = getApplyShader(state);
  drawWebGLFilterPass(state, encoded, dest, loc, (gl) => {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ramp);
    gl.uniform1i(loc.locRamp, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(loc.locSource, 2);
    gl.activeTexture(gl.TEXTURE0);
  });
}

function getEncodeShader(state: WebGLRenderState): BevelEncodeLocations {
  let loc = encodeShaders.get(state);
  if (loc === undefined) {
    const gl = (state as WebGLRenderStateInternal).gl;
    const base = compileWebGLFilterProgram(gl, BEVEL_ENCODE_FRAGMENT_SRC);
    loc = { ...base, locOffset: gl.getUniformLocation(base.program, 'u_offset')! };
    encodeShaders.set(state, loc);
  }
  return loc;
}

function getApplyShader(state: WebGLRenderState): BevelApplyLocations {
  let loc = applyShaders.get(state);
  if (loc === undefined) {
    const gl = (state as WebGLRenderStateInternal).gl;
    const base = compileWebGLFilterProgram(gl, BEVEL_APPLY_FRAGMENT_SRC);
    loc = {
      ...base,
      locRamp: gl.getUniformLocation(base.program, 'u_ramp')!,
      locSource: gl.getUniformLocation(base.program, 'u_source')!,
    };
    applyShaders.set(state, loc);
  }
  return loc;
}
