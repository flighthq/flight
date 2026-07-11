import type { GlRenderTarget } from '@flighthq/render-gl';
import { compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlFullscreenProgram, GlRenderState } from '@flighthq/types';

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

type TintShaderLocations = GlFullscreenProgram & {
  locColor: WebGLUniformLocation;
  locAlpha: WebGLUniformLocation;
  locStrength: WebGLUniformLocation;
};

const tintShaders = new WeakMap<GlRenderState, TintShaderLocations>();
const invertTintShaders = new WeakMap<GlRenderState, TintShaderLocations>();

/** Tints the INVERTED source alpha with color, outputs a premultiplied mask. Used for inner effects. */
export function applyGlEffectInvertTintPass(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  color: number,
  alpha: number,
  strength: number,
): void {
  const loc = getGlInvertTintShader(state);
  drawGlFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform3f(loc.locColor, ((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255);
    gl.uniform1f(loc.locAlpha, alpha);
    gl.uniform1f(loc.locStrength, strength);
  });
}

/** Tints the source alpha with color, outputs a premultiplied mask into dest. */
export function applyGlEffectTintPass(
  state: GlRenderState,
  source: GlRenderTarget,
  dest: GlRenderTarget,
  color: number,
  alpha: number,
  strength: number,
): void {
  const loc = getGlTintShader(state);
  drawGlFullscreenPass(state, loc, [source.texture], dest, (gl) => {
    gl.uniform3f(loc.locColor, ((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255);
    gl.uniform1f(loc.locAlpha, alpha);
    gl.uniform1f(loc.locStrength, strength);
  });
}

function getGlInvertTintShader(state: GlRenderState): TintShaderLocations {
  let loc = invertTintShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, INVERT_TINT_FRAGMENT_SRC);
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

function getGlTintShader(state: GlRenderState): TintShaderLocations {
  let loc = tintShaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, TINT_FRAGMENT_SRC);
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
