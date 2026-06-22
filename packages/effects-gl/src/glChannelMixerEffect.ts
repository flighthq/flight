import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { ChannelMixerEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Channel mixer: apply a 3x4 row-major RGB->RGB matrix plus per-row offset, uploaded as 12 floats.
export function applyChannelMixerEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<ChannelMixerEffect>,
): void {
  const matrix = new Float32Array(12);
  for (let i = 0; i < 12; i++) matrix[i] = effect.matrix[i] ?? IDENTITY_CHANNEL_MIXER[i];
  const program = getGlEffectProgram(state, 'colorGrade.channelMixer', CHANNEL_MIXER_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1fv(gl.getUniformLocation(p.program, 'u_matrix'), matrix);
  });
}

export const defaultGlChannelMixerEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyChannelMixerEffectToGl(ctx.state, ctx.source, ctx.dest, effect as ChannelMixerEffect);
};

const IDENTITY_CHANNEL_MIXER: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

const CHANNEL_MIXER_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_matrix[12];
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float r = u_matrix[0] * c.r + u_matrix[1] * c.g + u_matrix[2] * c.b + u_matrix[3];
  float g = u_matrix[4] * c.r + u_matrix[5] * c.g + u_matrix[6] * c.b + u_matrix[7];
  float b = u_matrix[8] * c.r + u_matrix[9] * c.g + u_matrix[10] * c.b + u_matrix[11];
  o_color = vec4(clamp(vec3(r, g, b), 0.0, 1.0), c.a);
}`;
