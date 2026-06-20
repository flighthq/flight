import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import { compileWebGLFullscreenProgram, drawWebGLFullscreenPass } from '@flighthq/render-webgl';
import type { WebGLFullscreenProgram, WebGLRenderState } from '@flighthq/types';

// Extracts the source alpha, tints it with a solid color, and outputs a
// premultiplied RGBA texture.
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

// Extracts the INVERTED source alpha, tints it with a solid color, and outputs
// a premultiplied RGBA texture. Used as the first pass for inner glow/shadow.
const INVERT_TINT_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_color;
uniform float u_alpha;
uniform float u_strength;
out vec4 fragColor;
void main() {
  float a = min(1.0, (1.0 - texture(u_texture, v_texCoord).a) * u_alpha * u_strength);
  fragColor = vec4(u_color * a, a);
}`;

// Blits a tinted texture at a UV offset. Out-of-bounds samples produce transparent output.
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

// Pass-through blit.
const BLIT_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_texCoord);
}`;

type TintShaderLocations = WebGLFullscreenProgram & {
  locColor: WebGLUniformLocation;
  locAlpha: WebGLUniformLocation;
  locStrength: WebGLUniformLocation;
};

type BlitOffsetShaderLocations = WebGLFullscreenProgram & {
  locOffset: WebGLUniformLocation;
};

const tintShaders = new WeakMap<WebGLRenderState, TintShaderLocations>();
const invertTintShaders = new WeakMap<WebGLRenderState, TintShaderLocations>();
const blitOffsetShaders = new WeakMap<WebGLRenderState, BlitOffsetShaderLocations>();
const blitShaders = new WeakMap<WebGLRenderState, WebGLFullscreenProgram>();

/**
 * Blits source into dest at a pixel offset (dx, dy in screen-space Y-down).
 * Pixels sampling outside the source bounds produce transparent output.
 */
export function applyWebGLBlitOffsetPass(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  dx: number,
  dy: number,
): void {
  const loc = getWebGLBlitOffsetShader(state);
  drawWebGLFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform2f(loc.locOffset, -dx / source.width, dy / source.height);
  });
}

/** Blits source directly into dest without modification. */
export function applyWebGLBlitPass(state: WebGLRenderState, source: WebGLRenderTarget, dest: WebGLRenderTarget): void {
  const loc = getWebGLBlitShader(state);
  drawWebGLFullscreenPass(state, loc, [source.texture], dest, () => {});
}

/** Tints the INVERTED source alpha with color, outputs a premultiplied mask. Used for inner effects. */
export function applyWebGLInvertTintPass(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  color: number,
  alpha: number,
  strength: number,
): void {
  const loc = getWebGLInvertTintShader(state);
  drawWebGLFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform3f(loc.locColor, ((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255);
    gl.uniform1f(loc.locAlpha, alpha);
    gl.uniform1f(loc.locStrength, strength);
  });
}

/** Tints the source alpha with color, outputs a premultiplied mask into dest. */
export function applyWebGLTintPass(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  color: number,
  alpha: number,
  strength: number,
): void {
  const loc = getWebGLTintShader(state);
  drawWebGLFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform3f(loc.locColor, ((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255);
    gl.uniform1f(loc.locAlpha, alpha);
    gl.uniform1f(loc.locStrength, strength);
  });
}

export function getWebGLBlitOffsetShader(state: WebGLRenderState): BlitOffsetShaderLocations {
  let loc = blitOffsetShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileWebGLFullscreenProgram(gl, BLIT_OFFSET_FRAGMENT_SRC);
    loc = { ...base, locOffset: gl.getUniformLocation(base.program, 'u_offset')! };
    blitOffsetShaders.set(state, loc);
  }
  return loc;
}

export function getWebGLBlitShader(state: WebGLRenderState): WebGLFullscreenProgram {
  let loc = blitShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    loc = compileWebGLFullscreenProgram(gl, BLIT_FRAGMENT_SRC);
    blitShaders.set(state, loc);
  }
  return loc;
}

export function getWebGLInvertTintShader(state: WebGLRenderState): TintShaderLocations {
  let loc = invertTintShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileWebGLFullscreenProgram(gl, INVERT_TINT_FRAGMENT_SRC);
    loc = {
      ...base,
      locColor: gl.getUniformLocation(base.program, 'u_color')!,
      locAlpha: gl.getUniformLocation(base.program, 'u_alpha')!,
      locStrength: gl.getUniformLocation(base.program, 'u_strength')!,
    };
    invertTintShaders.set(state, loc);
  }
  return loc;
}

export function getWebGLTintShader(state: WebGLRenderState): TintShaderLocations {
  let loc = tintShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileWebGLFullscreenProgram(gl, TINT_FRAGMENT_SRC);
    loc = {
      ...base,
      locColor: gl.getUniformLocation(base.program, 'u_color')!,
      locAlpha: gl.getUniformLocation(base.program, 'u_alpha')!,
      locStrength: gl.getUniformLocation(base.program, 'u_strength')!,
    };
    tintShaders.set(state, loc);
  }
  return loc;
}
