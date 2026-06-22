import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, SsrEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// SSR: screen-space reflections. The real recipe ray-marches reflected rays against a sampleable DEPTH
// buffer using view-space normals, walking `steps` increments up to `maxDistance` at the given
// `resolution`; depth and normals are absent in the color-only context, so this is a passthrough copy
// that preserves the pipeline stage. maxDistance/resolution/steps are reserved for the depth-driven recipe.
export function applySsrEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  effect: Readonly<SsrEffect>,
): void {
  const program = getGlEffectProgram(state, 'atmospheric.ssr', SSR_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, () => {});
}

export const defaultGlSsrEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applySsrEffectToGl(ctx.state, ctx.source, ctx.dest, effect as SsrEffect);
};

const SSR_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}`;
