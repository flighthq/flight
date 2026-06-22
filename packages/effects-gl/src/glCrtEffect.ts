import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { CrtEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// CRT: barrel-distort the uv (curvature), darken alternating scanlines, vignette the edges, and split
// the channels outward (chromatic aberration) for a tube-monitor look.
export function applyCrtEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<CrtEffect>,
): void {
  const curvature = effect.curvature ?? 0.1;
  const scanlineIntensity = effect.scanlineIntensity ?? 0.3;
  const vignette = effect.vignette ?? 0.3;
  const aberration = effect.aberration ?? 0.005;
  const program = getGlEffectProgram(state, 'stylization.crt', CRT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_curvature'), curvature);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_scanlineIntensity'), scanlineIntensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_vignette'), vignette);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_aberration'), aberration);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultGlCrtEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyCrtEffectToGl(ctx.state, ctx.source, ctx.dest, effect as CrtEffect);
};

const CRT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_curvature;
uniform float u_scanlineIntensity;
uniform float u_vignette;
uniform float u_aberration;
uniform vec2 u_resolution;
out vec4 o_color;
vec2 barrel(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c += c * u_curvature * dot(c, c);
  return c * 0.5 + 0.5;
}
void main() {
  vec2 uv = barrel(v_texCoord);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 off = vec2(u_aberration, 0.0);
  float r = texture(u_texture0, uv + off).r;
  float g = texture(u_texture0, uv).g;
  float b = texture(u_texture0, uv - off).b;
  float a = texture(u_texture0, uv).a;
  vec3 col = vec3(r, g, b);
  float line = sin(uv.y * u_resolution.y * 3.14159265) * 0.5 + 0.5;
  col *= 1.0 - u_scanlineIntensity * (1.0 - line);
  vec2 vc = uv * 2.0 - 1.0;
  col *= 1.0 - u_vignette * dot(vc, vc);
  o_color = vec4(col, a);
}`;
