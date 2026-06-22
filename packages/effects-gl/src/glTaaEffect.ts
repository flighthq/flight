import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, TaaEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// TAA: passthrough copy of source → dest. Real temporal AA needs a history buffer + motion vectors to
// reproject and accumulate prior frames; neither is available in the single-frame effect context, so
// this is a placeholder that preserves the pipeline stage without altering the image.
export function applyTaaEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  _effect: Readonly<TaaEffect>,
): void {
  const program = getGlEffectProgram(state, 'antialiasing.taa', TAA_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, _noopSetUniforms);
}

export const defaultGlTaaEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyTaaEffectToGl(ctx.state, ctx.source, ctx.dest, effect as TaaEffect);
};

function _noopSetUniforms(): void {}

const TAA_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}`;
