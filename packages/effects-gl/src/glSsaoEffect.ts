import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, SsaoEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// SSAO: ambient-occlusion approximation. Real SSAO reconstructs view-space position/normals from a
// sampleable DEPTH texture and accumulates occlusion over `samples` kernel offsets within `radius`,
// gated by `bias`; none of that depth data exists in the color-only context. This stand-in darkens
// fragments by local luminance variation (high-contrast neighborhoods read as creases/contact) scaled
// by intensity, sampling neighbors via u_resolution-derived texel steps.
export function applySsaoEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<SsaoEffect>,
): void {
  const radius = effect.radius ?? 1;
  const intensity = effect.intensity ?? 1;
  const program = getGlEffectProgram(state, 'atmospheric.ssao', SSAO_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_radius'), radius);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
  });
}

export const defaultGlSsaoEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applySsaoEffectToGl(ctx.state, ctx.source, ctx.dest, effect as SsaoEffect);
};

const SSAO_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform float u_radius;
uniform float u_intensity;
out vec4 o_color;
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 texel = (1.0 / u_resolution) * max(u_radius, 1.0);
  vec4 center = texture(u_texture0, v_texCoord);
  float lc = luma(center.rgb);
  float variation = 0.0;
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb));
  variation *= 0.25;
  float occlusion = clamp(variation * u_intensity, 0.0, 1.0);
  o_color = vec4(center.rgb * (1.0 - occlusion), center.a);
}`;
