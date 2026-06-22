import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { ExposureEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Exposure: scale linear color by 2^stops. Single-pass reference recipe.
export function applyExposureEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<ExposureEffect>,
): void {
  const exposure = effect.exposure ?? 0;
  const program = getGlEffectProgram(state, 'exposure', EXPOSURE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_exposure'), Math.pow(2, exposure));
  });
}

export const defaultGlExposureEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyExposureEffectToGl(ctx.state, ctx.source, ctx.dest, effect as ExposureEffect);
};

const EXPOSURE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_exposure;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  o_color = vec4(c.rgb * u_exposure, c.a);
}`;
