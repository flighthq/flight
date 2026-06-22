import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { BokehDepthOfFieldEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Bokeh depth-of-field: a disc-shaped blur. When the scene supplied a sampleable depth texture
// (ctx.sceneDepthTexture), it computes a per-pixel circle of confusion from focusDistance/focusRange and
// scales the disc radius by it (the real DoF). When depth is absent it falls back to a uniform disc blur
// of radius maxBlur. The second real consumer of the depth seam, alongside screen-space fog.
export function applyBokehDepthOfFieldEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  depthTexture: WebGLTexture | null,
  effect: Readonly<BokehDepthOfFieldEffect>,
): void {
  const maxBlur = effect.maxBlur ?? 4;
  const focusDistance = effect.focusDistance ?? 0.5;
  const focusRange = effect.focusRange ?? 0.2;
  const program = getGlEffectProgram(state, 'lens.bokehDoF', BOKEH_DOF_FRAGMENT_SRC);
  const inputs = depthTexture ? [source.texture, depthTexture] : [source.texture];
  drawGlFullscreenPass(state, program, inputs, dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_maxBlur'), maxBlur);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_focusDistance'), focusDistance);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_focusRange'), focusRange);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_hasDepth'), depthTexture ? 1 : 0);
  });
}

export const defaultGlBokehDepthOfFieldEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyBokehDepthOfFieldEffectToGl(
    ctx.state,
    ctx.source,
    ctx.dest,
    ctx.sceneDepthTexture,
    effect as BokehDepthOfFieldEffect,
  );
};

const BOKEH_DOF_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_maxBlur;
uniform vec2 u_resolution;
uniform float u_focusDistance;
uniform float u_focusRange;
uniform float u_hasDepth;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  // Circle of confusion: with depth, blur scales by distance from the focus plane; without, full blur.
  float coc = 1.0;
  if (u_hasDepth > 0.5) {
    float depth = texture(u_texture1, v_texCoord).r;
    coc = clamp(abs(depth - u_focusDistance) / max(u_focusRange, 1e-4), 0.0, 1.0);
  }
  float blur = u_maxBlur * coc;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 0.39269908; // golden-ish angular step over the disc
    float r = (float(i % 4) + 1.0) * 0.25;
    vec2 offset = vec2(cos(a), sin(a)) * r * blur * texel;
    sum += texture(u_texture0, v_texCoord + offset);
    total += 1.0;
  }
  o_color = sum / total;
}`;
