import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, PixelateEffect } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Pixelate: snap uv to the center of `size`-pixel blocks before sampling, producing hard mosaic blocks.
export function applyPixelateEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<PixelateEffect>,
): void {
  const size = effect.size ?? 8;
  const program = getGlEffectProgram(state, 'stylization.pixelate', PIXELATE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_size'), Math.max(1, size));
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultGlPixelateEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyPixelateEffectToGl(ctx.state, ctx.source, ctx.dest, effect as PixelateEffect);
};

const PIXELATE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_size;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 blocks = u_resolution / u_size;
  vec2 uv = (floor(v_texCoord * blocks) + 0.5) / blocks;
  o_color = texture(u_texture0, uv);
}`;
