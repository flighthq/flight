import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, SmaaEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// SMAA: a single-pass edge-aware blur approximation. Full SMAA needs separate edge-detection and
// blend-weight passes against precomputed area/search lookup textures; this single-pass approximation
// softens detected edges only and is acceptable until the multi-pass recipe lands.
export function applySmaaEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<SmaaEffect>,
): void {
  const threshold = effect.threshold ?? 0.1;
  const program = getGlEffectProgram(state, 'antialiasing.smaa', SMAA_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_threshold'), threshold);
  });
}

export const defaultGlSmaaEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applySmaaEffectToGl(ctx.state, ctx.source, ctx.dest, effect as SmaaEffect);
};

const SMAA_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform float u_threshold;
out vec4 o_color;
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec4 center = texture(u_texture0, v_texCoord);
  float lumaC = luma(center.rgb);
  float lumaL = luma(texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb);
  float lumaR = luma(texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb);
  float lumaT = luma(texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb);
  float lumaB = luma(texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb);
  float edge = max(abs(lumaC - lumaL), max(abs(lumaC - lumaR), max(abs(lumaC - lumaT), abs(lumaC - lumaB))));
  if (edge < u_threshold) {
    o_color = center;
    return;
  }
  vec3 blurred = (
    texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb +
    center.rgb) / 5.0;
  o_color = vec4(blurred, center.a);
}`;
