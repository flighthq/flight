import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, GodRaysEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// God rays: radial light scattering from a screen-space light position (centerX, centerY). Marches
// SAMPLES steps along the ray from each fragment toward the light, accumulating color with per-step
// decay and weight, then scales by exposure. A true single-pass recipe — no depth needed. Reads
// u_texture0; u_resolution is set so the light direction is computed in a consistent space.
export function applyGodRaysEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<GodRaysEffect>,
): void {
  const centerX = effect.centerX ?? 0.5;
  const centerY = effect.centerY ?? 0.5;
  const density = effect.density ?? 0.96;
  const decay = effect.decay ?? 0.93;
  const weight = effect.weight ?? 0.4;
  const exposure = effect.exposure ?? 0.6;
  const samples = Math.max(1, Math.round(effect.samples ?? 64));
  const program = getGlEffectProgram(state, `atmospheric.godRays.${samples}`, buildGodRaysFragment(samples));
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_lightPosition'), centerX, centerY);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_density'), density);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_decay'), decay);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_weight'), weight);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_exposure'), exposure);
  });
}

export const defaultGlGodRaysEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyGodRaysEffectToGl(ctx.state, ctx.source, ctx.dest, effect as GodRaysEffect);
};

function buildGodRaysFragment(samples: number): string {
  return GOD_RAYS_FRAGMENT_HEAD + samples.toFixed(1) + GOD_RAYS_FRAGMENT_TAIL;
}

const GOD_RAYS_FRAGMENT_HEAD = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform vec2 u_lightPosition;
uniform float u_density;
uniform float u_decay;
uniform float u_weight;
uniform float u_exposure;
out vec4 o_color;
const float SAMPLES = `;

const GOD_RAYS_FRAGMENT_TAIL = `;
void main() {
  vec2 delta = (v_texCoord - u_lightPosition) * (u_density / SAMPLES);
  vec2 coord = v_texCoord;
  vec4 base = texture(u_texture0, v_texCoord);
  vec3 accum = base.rgb;
  float illumination = 1.0;
  for (int i = 0; i < int(SAMPLES); i++) {
    coord -= delta;
    vec3 s = texture(u_texture0, coord).rgb;
    s *= illumination * u_weight;
    accum += s;
    illumination *= u_decay;
  }
  o_color = vec4(base.rgb + accum * u_exposure, base.a);
}`;
