import { computeBloomBlurRadius } from '@flighthq/effects';
import { applyGaussianBlurFilterToWebGL } from '@flighthq/filters-webgl';
import { acquireWebGLRenderTarget, drawWebGLFullscreenPass, releaseWebGLRenderTarget } from '@flighthq/render-webgl';
import type {
  BloomEffect,
  ExposureEffect,
  ToneMapEffect,
  WebGLRenderEffectRunner,
  WebGLRenderState,
  WebGLRenderTarget,
  WebGLRenderTargetPool,
} from '@flighthq/types';

import { getWebGLEffectProgram } from './effectProgramCache';

// Bloom: bright-pass → blur the bright branch (reusing the Tier-1 gaussian blur filter) → additively
// composite back. The multi-pass reference recipe — it acquires intermediate targets from the pool
// and releases them, branches, and reuses a filter, which is what makes it an effect and not a filter.
export function applyBloomEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  pool: WebGLRenderTargetPool,
  effect: Readonly<BloomEffect>,
): void {
  const threshold = effect.threshold ?? 0.8;
  const intensity = effect.intensity ?? 1;
  const radius = computeBloomBlurRadius(effect);
  const descriptor = { width: source.width, height: source.height, format: source.format };

  const bright = acquireWebGLRenderTarget(state, pool, descriptor);
  const blurred = acquireWebGLRenderTarget(state, pool, descriptor);
  const temp = acquireWebGLRenderTarget(state, pool, descriptor);

  const brightProgram = getWebGLEffectProgram(state, 'bloom.bright', BLOOM_BRIGHT_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, brightProgram, [source.texture], bright, (gl, program) => {
    gl.uniform1f(gl.getUniformLocation(program.program, 'u_threshold'), threshold);
  });

  applyGaussianBlurFilterToWebGL(state, bright, blurred, temp, { blurX: radius, blurY: radius });

  const compositeProgram = getWebGLEffectProgram(state, 'bloom.composite', BLOOM_COMPOSITE_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, compositeProgram, [source.texture, blurred.texture], dest, (gl, program) => {
    gl.uniform1f(gl.getUniformLocation(program.program, 'u_intensity'), intensity);
  });

  releaseWebGLRenderTarget(pool, bright);
  releaseWebGLRenderTarget(pool, blurred);
  releaseWebGLRenderTarget(pool, temp);
}

// Exposure: scale linear color by 2^stops. Single-pass reference recipe.
export function applyExposureEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<ExposureEffect>,
): void {
  const exposure = effect.exposure ?? 0;
  const program = getWebGLEffectProgram(state, 'exposure', EXPOSURE_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_exposure'), Math.pow(2, exposure));
  });
}

// Tone map: compress HDR to displayable range via the selected operator. Single-pass reference recipe.
export function applyToneMapEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<ToneMapEffect>,
): void {
  const operator = effect.operator ?? 'aces';
  const exposure = effect.exposure ?? 1;
  const program = getWebGLEffectProgram(state, `toneMap.${operator}`, buildToneMapFragment(operator));
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_exposure'), exposure);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_white'), effect.white ?? 1);
  });
}

export const defaultWebGLBloomEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyBloomEffectToWebGL(ctx.state, ctx.source, ctx.dest, ctx.pool, effect as BloomEffect);
};

export const defaultWebGLExposureEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyExposureEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as ExposureEffect);
};

export const defaultWebGLToneMapEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyToneMapEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as ToneMapEffect);
};

function buildToneMapFragment(operator: string): string {
  return TONEMAP_FRAGMENT_HEAD + (TONEMAP_OPERATORS[operator] ?? TONEMAP_OPERATORS.aces) + TONEMAP_FRAGMENT_TAIL;
}

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
