import { computeBloomBlurRadius, computeBloomIntensity, computeBloomThreshold } from '@flighthq/effects';
import { acquireGlRenderTarget, drawGlFullscreenPass, releaseGlRenderTarget } from '@flighthq/render-gl';
import type {
  BloomEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GlRenderTargetPool,
} from '@flighthq/types';

import { applyGaussianBlurToGl } from './glBlurEffect';
import { getGlEffectProgram } from './glEffectProgramCache';

// Bloom: bright-pass → blur the bright branch (via the effects-owned separable gaussian blur) →
// additively composite back. The multi-pass reference recipe — it acquires intermediate targets from
// the pool and releases them, branches, and reuses the blur primitive, which is what makes it an effect.
export function applyBloomEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  pool: GlRenderTargetPool,
  effect: Readonly<BloomEffect>,
): void {
  const threshold = computeBloomThreshold(effect);
  const intensity = computeBloomIntensity(effect);
  const radius = computeBloomBlurRadius(effect);
  const descriptor = { width: source.width, height: source.height, format: source.format };

  const bright = acquireGlRenderTarget(state, pool, descriptor);
  const blurred = acquireGlRenderTarget(state, pool, descriptor);
  const temp = acquireGlRenderTarget(state, pool, descriptor);

  const brightProgram = getGlEffectProgram(state, 'bloom.bright', BLOOM_BRIGHT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, brightProgram, [source.texture], bright, (gl, program) => {
    gl.uniform1f(gl.getUniformLocation(program.program, 'u_threshold'), threshold);
  });

  applyGaussianBlurToGl(state, bright, blurred, temp, { blurX: radius, blurY: radius });

  const compositeProgram = getGlEffectProgram(state, 'bloom.composite', BLOOM_COMPOSITE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, compositeProgram, [source.texture, blurred.texture], dest, (gl, program) => {
    gl.uniform1f(gl.getUniformLocation(program.program, 'u_intensity'), intensity);
  });

  releaseGlRenderTarget(pool, bright);
  releaseGlRenderTarget(pool, blurred);
  releaseGlRenderTarget(pool, temp);
}

export const defaultGlBloomEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyBloomEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as BloomEffect);
};

const BLOOM_BRIGHT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float k = step(u_threshold, l);
  o_color = vec4(c.rgb * k, c.a);
}`;

const BLOOM_COMPOSITE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 scene = texture(u_texture0, v_texCoord);
  vec4 bloom = texture(u_texture1, v_texCoord);
  o_color = vec4(scene.rgb + bloom.rgb * u_intensity, scene.a);
}`;
