import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, RadialBlurEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Radial blur: accumulate samples stepped from the current uv toward (centerX, centerY) scaled by
// `strength`, normalized by the sample count. Single-pass reference recipe.
export function applyRadialBlurEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<RadialBlurEffect>,
): void {
  const centerX = effect.centerX ?? 0.5;
  const centerY = effect.centerY ?? 0.5;
  const strength = effect.strength ?? 0.2;
  const samples = effect.samples ?? 16;
  const program = getGlEffectProgram(state, 'radialBlur', RADIAL_BLUR_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_center'), centerX, centerY);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_strength'), strength);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_samples'), samples);
  });
}

export const defaultGlRadialBlurEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyRadialBlurEffectToGl(ctx.state, ctx.source, ctx.dest, effect as RadialBlurEffect);
};

const RADIAL_BLUR_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_center;
uniform float u_strength;
uniform float u_samples;
out vec4 o_color;
const int SAMPLES = 16;
void main() {
  vec2 toCenter = u_center - v_texCoord;
  float count = min(u_samples, 16.0);
  vec4 sum = vec4(0.0);
  float taken = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    if (float(i) >= count) break;
    float t = count > 1.0 ? float(i) / (count - 1.0) : 0.0;
    vec2 uv = v_texCoord + toCenter * (t * u_strength);
    sum += texture(u_texture0, uv);
    taken += 1.0;
  }
  o_color = sum / max(taken, 1.0);
}`;
