import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { DirectionalBlurEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Directional blur: accumulate samples stepped along `angle` over `length` texels, normalized by the
// sample count. Single-pass reference recipe. u_resolution converts the texel length into UV space.
export function applyDirectionalBlurEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<DirectionalBlurEffect>,
): void {
  const angle = effect.angle ?? 0;
  const length = effect.length ?? 8;
  const samples = effect.samples ?? 16;
  const program = getGlEffectProgram(state, 'directionalBlur', DIRECTIONAL_BLUR_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_angle'), angle);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_length'), length);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_samples'), samples);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultGlDirectionalBlurEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyDirectionalBlurEffectToGl(ctx.state, ctx.source, ctx.dest, effect as DirectionalBlurEffect);
};

const DIRECTIONAL_BLUR_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_angle;
uniform float u_length;
uniform float u_samples;
uniform vec2 u_resolution;
out vec4 o_color;
const int SAMPLES = 16;
void main() {
  vec2 dir = vec2(cos(u_angle), sin(u_angle)) * (u_length / u_resolution);
  float count = min(u_samples, 16.0);
  vec4 sum = vec4(0.0);
  float taken = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    if (float(i) >= count) break;
    float t = count > 1.0 ? (float(i) / (count - 1.0)) - 0.5 : 0.0;
    vec2 uv = v_texCoord + dir * t;
    sum += texture(u_texture0, uv);
    taken += 1.0;
  }
  o_color = sum / max(taken, 1.0);
}`;
