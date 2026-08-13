import { unpackColorRgba } from '@flighthq/color/contract';
import { compileGlFullscreenProgram, drawGlFullscreenPass } from '@flighthq/render-gl/contract';
import type { GlRenderTarget } from '@flighthq/types/contract';
import type { GlFullscreenProgram, GlRenderState } from '@flighthq/types/contract';

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

const tintShaders = new WeakMap<WebGL2RenderingContext, TintShaderLocations>();
const invertTintShaders = new WeakMap<WebGL2RenderingContext, TintShaderLocations>();

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
    unpackColorRgba(scratchTint, color);
    gl.uniform3f(loc.locColor, scratchTint[0], scratchTint[1], scratchTint[2]);
    gl.uniform1f(loc.locAlpha, alpha * scratchTint[3]);
    gl.uniform1f(loc.locStrength, strength);
    gl.blendFunc(gl.ONE, gl.ZERO);
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
    unpackColorRgba(scratchTint, color);
    gl.uniform3f(loc.locColor, scratchTint[0], scratchTint[1], scratchTint[2]);
    gl.uniform1f(loc.locAlpha, alpha * scratchTint[3]);
    gl.uniform1f(loc.locStrength, strength);
    gl.blendFunc(gl.ONE, gl.ZERO);
  });
}

function getGlInvertTintShader(state: GlRenderState): TintShaderLocations {
  let loc = invertTintShaders.get(state.gl);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, INVERT_TINT_FRAGMENT_SRC);
    loc = {
      ...base,
      locColor: gl.getUniformLocation(base.program, 'u_color')!,
      locAlpha: gl.getUniformLocation(base.program, 'u_alpha')!,
      locStrength: gl.getUniformLocation(base.program, 'u_strength')!,
    };
    invertTintShaders.set(state.gl, loc);
  }
  return loc;
}

function getGlTintShader(state: GlRenderState): TintShaderLocations {
  let loc = tintShaders.get(state.gl);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileGlFullscreenProgram(gl, TINT_FRAGMENT_SRC);
    loc = {
      ...base,
      locColor: gl.getUniformLocation(base.program, 'u_color')!,
      locAlpha: gl.getUniformLocation(base.program, 'u_alpha')!,
      locStrength: gl.getUniformLocation(base.program, 'u_strength')!,
    };
    tintShaders.set(state.gl, loc);
  }
  return loc;
}

// Reused across passes: the unpack writes into it on every draw, so it never escapes this module.
const scratchTint: [number, number, number, number] = [0, 0, 0, 0];
