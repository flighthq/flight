import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, SharpenEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Sharpen: unsharp mask via a 3x3 Laplacian kernel; `amount` scales the high-frequency boost.
export function applySharpenEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<SharpenEffect>,
): void {
  const amount = effect.amount ?? 0.5;
  const program = getGlEffectProgram(state, 'stylization.sharpen', SHARPEN_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_amount'), amount);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultGlSharpenEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applySharpenEffectToGl(ctx.state, ctx.source, ctx.dest, effect as SharpenEffect);
};

const SHARPEN_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_amount;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec3 c = texture(u_texture0, v_texCoord).rgb;
  vec3 n = texture(u_texture0, v_texCoord + vec2(0.0, -texel.y)).rgb;
  vec3 s = texture(u_texture0, v_texCoord + vec2(0.0, texel.y)).rgb;
  vec3 e = texture(u_texture0, v_texCoord + vec2(texel.x, 0.0)).rgb;
  vec3 w = texture(u_texture0, v_texCoord + vec2(-texel.x, 0.0)).rgb;
  vec3 high = c * 4.0 - n - s - e - w;
  float a = texture(u_texture0, v_texCoord).a;
  o_color = vec4(clamp(c + high * u_amount, 0.0, 1.0), a);
}`;
