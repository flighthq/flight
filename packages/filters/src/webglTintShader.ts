import type { WebGLRenderStateInternal } from '@flighthq/render-webgl';
import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderState } from '@flighthq/types';

import type { WebGLFilterLocations } from './webglFilterPass';
import { compileWebGLFilterProgram, drawWebGLFilterPass } from './webglFilterPass';

// Extracts the source alpha, tints it with a solid color, and outputs a
// premultiplied RGBA texture. Used as the first pass for drop shadow, glow,
// and bevel filters before blurring.
const TINT_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_color;
uniform float u_alpha;
uniform float u_strength;
out vec4 fragColor;

void main() {
  float a = min(1.0, texture(u_texture, v_texCoord).a * u_alpha * u_strength);
  fragColor = vec4(u_color * a, a);
}`;

// Blits a tinted texture at a UV offset. Out-of-bounds samples produce
// transparent output. Used to composite a shadow or glow at an offset position.
const BLIT_OFFSET_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_offset;
out vec4 fragColor;

void main() {
  vec2 uv = v_texCoord + u_offset;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0);
    return;
  }
  fragColor = texture(u_texture, uv);
}`;

// Pass-through blit — copies source to dest without modification.
const BLIT_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;

void main() {
  fragColor = texture(u_texture, v_texCoord);
}`;

type TintShaderLocations = WebGLFilterLocations & {
  locColor: WebGLUniformLocation;
  locAlpha: WebGLUniformLocation;
  locStrength: WebGLUniformLocation;
};

type BlitOffsetShaderLocations = WebGLFilterLocations & {
  locOffset: WebGLUniformLocation;
};

const _tintShaders = new WeakMap<WebGLRenderState, TintShaderLocations>();
const _blitOffsetShaders = new WeakMap<WebGLRenderState, BlitOffsetShaderLocations>();
const _blitShaders = new WeakMap<WebGLRenderState, WebGLFilterLocations>();

/**
 * Blits source into dest at a pixel offset (dx, dy in screen-space Y-down).
 * Pixels sampling outside the source bounds produce transparent output.
 * The UV offset is: (-dx/w, dy/h) due to render-target Y-axis convention.
 */
export function applyBlitOffsetPass(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  dx: number,
  dy: number,
): void {
  const loc = getBlitOffsetShader(state);
  drawWebGLFilterPass(state, source, dest, loc, (gl) => {
    gl.uniform2f(loc.locOffset, -dx / source.width, dy / source.height);
  });
}

/** Blits source directly into dest without modification (pass-through). */
export function applyBlitPass(state: WebGLRenderState, source: WebGLRenderTarget, dest: WebGLRenderTarget): void {
  const loc = getBlitShader(state);
  drawWebGLFilterPass(state, source, dest, loc, () => {});
}

/** Tints the source alpha with color, outputs a premultiplied mask into dest. */
export function applyTintPass(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  color: number,
  alpha: number,
  strength: number,
): void {
  const loc = getTintShader(state);
  drawWebGLFilterPass(state, source, dest, loc, (gl) => {
    gl.uniform3f(loc.locColor, ((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255);
    gl.uniform1f(loc.locAlpha, alpha);
    gl.uniform1f(loc.locStrength, strength);
  });
}

export function getBlitOffsetShader(state: WebGLRenderState): BlitOffsetShaderLocations {
  let loc = _blitOffsetShaders.get(state);
  if (loc === undefined) {
    const gl = (state as WebGLRenderStateInternal).gl;
    const base = compileWebGLFilterProgram(gl, BLIT_OFFSET_FRAGMENT_SRC);
    loc = {
      ...base,
      locOffset: gl.getUniformLocation(base.program, 'u_offset')!,
    };
    _blitOffsetShaders.set(state, loc);
  }
  return loc;
}

export function getBlitShader(state: WebGLRenderState): WebGLFilterLocations {
  let loc = _blitShaders.get(state);
  if (loc === undefined) {
    const gl = (state as WebGLRenderStateInternal).gl;
    loc = compileWebGLFilterProgram(gl, BLIT_FRAGMENT_SRC);
    _blitShaders.set(state, loc);
  }
  return loc;
}

export function getTintShader(state: WebGLRenderState): TintShaderLocations {
  let loc = _tintShaders.get(state);
  if (loc === undefined) {
    const gl = (state as WebGLRenderStateInternal).gl;
    const base = compileWebGLFilterProgram(gl, TINT_FRAGMENT_SRC);
    loc = {
      ...base,
      locColor: gl.getUniformLocation(base.program, 'u_color')!,
      locAlpha: gl.getUniformLocation(base.program, 'u_alpha')!,
      locStrength: gl.getUniformLocation(base.program, 'u_strength')!,
    };
    _tintShaders.set(state, loc);
  }
  return loc;
}
