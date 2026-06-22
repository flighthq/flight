import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlitchEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Glitch: split the frame into horizontal blocks, displace each by a per-block hash (data-mosh tear),
// separate the RGB channels, and corrupt the occasional block to white. `seed` animates it.
export function applyGlitchEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<GlitchEffect>,
): void {
  const intensity = effect.intensity ?? 0.5;
  const blockSize = effect.blockSize ?? 24;
  const colorShift = effect.colorShift ?? 8;
  const seed = effect.seed ?? 0;
  const program = getGlEffectProgram(state, 'stylization.glitch', GLITCH_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_blockSize'), blockSize);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_colorShift'), colorShift);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_seed'), seed);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultGlGlitchEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyGlitchEffectToGl(ctx.state, ctx.source, ctx.dest, effect as GlitchEffect);
};

const GLITCH_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_blockSize;
uniform float u_colorShift;
uniform float u_seed;
uniform vec2 u_resolution;
out vec4 o_color;
float ghash(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  float blockSize = max(2.0, u_blockSize);
  float block = floor(v_texCoord.y * u_resolution.y / blockSize);
  float r = ghash(block + u_seed * 7.0);
  float tear = step(1.0 - u_intensity * 0.6, r);
  float shiftPx = (ghash(block * 1.7 + u_seed) - 0.5) * 2.0 * tear * u_intensity * 40.0;
  vec2 baseUv = vec2(v_texCoord.x + shiftPx / u_resolution.x, v_texCoord.y);
  float cs = (u_colorShift * (0.4 + tear)) / u_resolution.x;
  float rC = texture(u_texture0, vec2(baseUv.x + cs, baseUv.y)).r;
  float gC = texture(u_texture0, baseUv).g;
  float bC = texture(u_texture0, vec2(baseUv.x - cs, baseUv.y)).b;
  float a = texture(u_texture0, baseUv).a;
  vec3 col = vec3(rC, gC, bC);
  float corrupt = step(0.985 - u_intensity * 0.04, ghash(block * 3.3 + u_seed * 2.0));
  col = mix(col, vec3(1.0), corrupt * 0.6);
  o_color = vec4(col, a);
}`;
