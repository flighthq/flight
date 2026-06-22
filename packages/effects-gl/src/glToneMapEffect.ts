import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, ToneMapEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Tone map: compress HDR to displayable range via the selected operator. Single-pass reference recipe.
export function applyToneMapEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<ToneMapEffect>,
): void {
  const operator = effect.operator ?? 'aces';
  const exposure = effect.exposure ?? 1;
  const program = getGlEffectProgram(state, `toneMap.${operator}`, buildToneMapFragment(operator));
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_exposure'), exposure);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_white'), effect.white ?? 1);
  });
}

export const defaultGlToneMapEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyToneMapEffectToGl(ctx.state, ctx.source, ctx.dest, effect as ToneMapEffect);
};

function buildToneMapFragment(operator: string): string {
  return TONEMAP_FRAGMENT_HEAD + (TONEMAP_OPERATORS[operator] ?? TONEMAP_OPERATORS.aces) + TONEMAP_FRAGMENT_TAIL;
}

const TONEMAP_FRAGMENT_HEAD = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_exposure;
uniform float u_white;
out vec4 o_color;
vec3 tonemap(vec3 x) {`;

const TONEMAP_FRAGMENT_TAIL = `}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 mapped = tonemap(c.rgb * u_exposure);
  o_color = vec4(clamp(mapped, 0.0, 1.0), c.a);
}`;

const TONEMAP_OPERATORS: Record<string, string> = {
  aces: `
  vec3 a = x * (2.51 * x + 0.03);
  vec3 b = x * (2.43 * x + 0.59) + 0.14;
  return a / b;`,
  reinhard: `
  return x / (1.0 + x / (u_white * u_white));`,
  filmic: `
  vec3 X = max(vec3(0.0), x - 0.004);
  return (X * (6.2 * X + 0.5)) / (X * (6.2 * X + 1.7) + 0.06);`,
  uncharted2: `
  float A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30;
  vec3 v = ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
  return v;`,
  agx: `
  vec3 v = clamp((x - 0.004) / (1.0 + x), 0.0, 1.0);
  return pow(v, vec3(0.8));`,
};
