import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, ScreenSpaceFogEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Screen-space fog: blends the scene toward an unpacked fog color by distance. When the scene supplied a
// sampleable DEPTH texture (`depthTexture`), this is the real recipe — fog factor = 1 - exp(-density *
// depth) over the [near, far] window, read per fragment. When depth is absent (a flat 2D scene that did
// not write depth), it falls back to the screen-Y gradient as a depth proxy (bottom of frame reads as
// "far"). color is a packed RGBA int unpacked to 0..1 floats on the JS side. Demonstrates the
// ctx.sceneDepthTexture seam: real depth path when present, sentinel proxy when null.
export function applyScreenSpaceFogEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  depthTexture: WebGLTexture | null,
  effect: Readonly<ScreenSpaceFogEffect>,
): void {
  const packed = effect.color ?? 0xc8d2dcff;
  const r = ((packed >>> 24) & 0xff) / 255;
  const g = ((packed >>> 16) & 0xff) / 255;
  const b = ((packed >>> 8) & 0xff) / 255;
  const density = effect.density ?? 1;
  const near = effect.near ?? 0;
  const far = effect.far ?? 1;
  const program = getGlEffectProgram(state, 'atmospheric.screenSpaceFog', SCREEN_SPACE_FOG_FRAGMENT_SRC);
  const inputs = depthTexture ? [source.texture, depthTexture] : [source.texture];
  drawGlFullscreenPass(state, program, inputs, dest, (gl, p) => {
    gl.uniform3f(gl.getUniformLocation(p.program, 'u_fogColor'), r, g, b);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_density'), density);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_near'), near);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_far'), far);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_hasDepth'), depthTexture ? 1 : 0);
  });
}

export const defaultGlScreenSpaceFogEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyScreenSpaceFogEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.sceneDepthTexture, effect as ScreenSpaceFogEffect);
};

const SCREEN_SPACE_FOG_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform vec3 u_fogColor;
uniform float u_density;
uniform float u_near;
uniform float u_far;
uniform float u_hasDepth;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float fog;
  if (u_hasDepth > 0.5) {
    // Real depth path: window-space depth remapped over [near, far], exponential fog by density.
    float depth = texture(u_texture1, v_texCoord).r;
    float d = clamp((depth - u_near) / max(u_far - u_near, 1e-4), 0.0, 1.0);
    fog = clamp(1.0 - exp(-u_density * d), 0.0, 1.0);
  } else {
    // Sentinel path: no depth written (flat 2D scene) — screen-Y gradient as a depth proxy.
    fog = clamp((1.0 - v_texCoord.y) * u_density, 0.0, 1.0);
  }
  o_color = vec4(mix(c.rgb, u_fogColor, fog), c.a);
}`;
