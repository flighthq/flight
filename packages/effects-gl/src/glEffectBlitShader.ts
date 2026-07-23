import { compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderTarget } from '@flighthq/types';
import type { GlFullscreenProgram, GlRenderState } from '@flighthq/types';

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

// Emits source alpha for a destination-out erase pass; blend state supplies the coverage operator.
const ERASE_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  float a = texture(u_texture, v_texCoord).a;
  fragColor = vec4(0.0, 0.0, 0.0, a);
}`;

type BlitOffsetShaderLocations = GlFullscreenProgram & {
  locOffset: WebGLUniformLocation;
};

const blitOffsetShaders = new WeakMap<GlRenderState, BlitOffsetShaderLocations>();
const blitShaders = new WeakMap<GlRenderState, GlFullscreenProgram>();
const eraseShaders = new WeakMap<GlRenderState, GlFullscreenProgram>();

/**
 * Blits source into dest at a pixel offset (dx, dy in screen-space Y-down).
 * Pixels sampling outside the source bounds produce transparent output.
 */
export function applyGlEffectBlitOffsetPass(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  dx: number,
  dy: number,
): void {
  const loc = getGlBlitOffsetShader(state);
  drawGlFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform2f(loc.locOffset, -dx / source.width, dy / source.height);
  });
}

/** Blits source directly into dest without modification. */
export function applyGlEffectBlitPass(state: GlRenderState, source: GlRenderTarget, dest: GlRenderTarget): void {
  const loc = getGlBlitShader(state);
  drawGlFullscreenPass(state, loc, [source.texture], dest, () => {});
}

/** Erases dest by the source alpha mask, equivalent to destination-out compositing. */
export function applyGlEffectErasePass(state: GlRenderState, source: GlRenderTarget, dest: GlRenderTarget): void {
  const loc = getGlEraseShader(state);
  drawGlFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
  });
}

function getGlBlitOffsetShader(state: GlRenderState): BlitOffsetShaderLocations {
  let loc = blitOffsetShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, BLIT_OFFSET_FRAGMENT_SRC);
    loc = { ...base, locOffset: gl.getUniformLocation(base.program, 'u_offset')! };
    blitOffsetShaders.set(state, loc);
  }
  return loc;
}

function getGlBlitShader(state: GlRenderState): GlFullscreenProgram {
  let loc = blitShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    loc = compileGlFullscreenProgram(gl, BLIT_FRAGMENT_SRC);
    blitShaders.set(state, loc);
  }
  return loc;
}

function getGlEraseShader(state: GlRenderState): GlFullscreenProgram {
  let loc = eraseShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    loc = compileGlFullscreenProgram(gl, ERASE_FRAGMENT_SRC);
    eraseShaders.set(state, loc);
  }
  return loc;
}
