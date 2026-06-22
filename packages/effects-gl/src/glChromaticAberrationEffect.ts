import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { ChromaticAberrationEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Chromatic aberration: sample the R/G/B channels at progressively larger offsets so colors fringe
// apart. When radial, the offset scales with distance from the optical center (true lens behavior);
// otherwise it is a uniform horizontal split.
export function applyChromaticAberrationEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<ChromaticAberrationEffect>,
): void {
  const intensity = effect.intensity ?? 0.005;
  const radial = effect.radial ?? true;
  const program = getGlEffectProgram(state, 'lens.chromaticAberration', CHROMATIC_ABERRATION_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_radial'), radial ? 1 : 0);
  });
}

export const defaultGlChromaticAberrationEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyChromaticAberrationEffectToGl(ctx.state, ctx.source, ctx.dest, effect as ChromaticAberrationEffect);
};

const CHROMATIC_ABERRATION_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_radial;
out vec4 o_color;
void main() {
  vec2 centered = v_texCoord - 0.5;
  float scale = mix(1.0, length(centered) * 2.0, u_radial);
  vec2 dir = mix(vec2(1.0, 0.0), normalize(centered + vec2(1e-5)), u_radial);
  vec2 offset = dir * u_intensity * scale;
  float r = texture(u_texture0, v_texCoord + offset).r;
  float g = texture(u_texture0, v_texCoord).g;
  float b = texture(u_texture0, v_texCoord - offset).b;
  float a = texture(u_texture0, v_texCoord).a;
  o_color = vec4(r, g, b, a);
}`;
