import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type {
  FxaaEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  SmaaEffect,
  TaaEffect,
} from '@flighthq/types';

import { getGlEffectProgram } from './effectProgramCache';

// Anti-aliasing recipes. FXAA is a full luminance-based single-pass implementation; SMAA is a
// single-pass edge-aware approximation; TAA is a passthrough placeholder. Each samples u_texture0 and,
// where it reads neighbors, needs u_resolution set from the source dimensions to size the texel step.

// FXAA: luminance edge detection + directional blend along the detected edge. Single-pass reference
// recipe. Reads u_texture0; u_resolution gives the texel size; u_edgeThreshold gates edge detection.
export function applyFxaaEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<FxaaEffect>,
): void {
  const edgeThreshold = effect.edgeThreshold ?? 0.0312;
  const program = getGlEffectProgram(state, 'antialiasing.fxaa', FXAA_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_edgeThreshold'), edgeThreshold);
  });
}

// SMAA: a single-pass edge-aware blur approximation. Full SMAA needs separate edge-detection and
// blend-weight passes against precomputed area/search lookup textures; this single-pass approximation
// softens detected edges only and is acceptable until the multi-pass recipe lands.
export function applySmaaEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<SmaaEffect>,
): void {
  const threshold = effect.threshold ?? 0.1;
  const program = getGlEffectProgram(state, 'antialiasing.smaa', SMAA_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_threshold'), threshold);
  });
}

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

export const defaultGlFxaaEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyFxaaEffectToGl(ctx.state, ctx.source, ctx.dest, effect as FxaaEffect);
};

export const defaultGlSmaaEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applySmaaEffectToGl(ctx.state, ctx.source, ctx.dest, effect as SmaaEffect);
};

export const defaultGlTaaEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyTaaEffectToGl(ctx.state, ctx.source, ctx.dest, effect as TaaEffect);
};

function _noopSetUniforms(): void {}

const FXAA_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform float u_edgeThreshold;
out vec4 o_color;
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec3 rgbM = texture(u_texture0, v_texCoord).rgb;
  vec3 rgbNW = texture(u_texture0, v_texCoord + vec2(-1.0, -1.0) * texel).rgb;
  vec3 rgbNE = texture(u_texture0, v_texCoord + vec2(1.0, -1.0) * texel).rgb;
  vec3 rgbSW = texture(u_texture0, v_texCoord + vec2(-1.0, 1.0) * texel).rgb;
  vec3 rgbSE = texture(u_texture0, v_texCoord + vec2(1.0, 1.0) * texel).rgb;
  float lumaM = luma(rgbM);
  float lumaNW = luma(rgbNW);
  float lumaNE = luma(rgbNE);
  float lumaSW = luma(rgbSW);
  float lumaSE = luma(rgbSE);
  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  float range = lumaMax - lumaMin;
  if (range < max(u_edgeThreshold, lumaMax * 0.125)) {
    o_color = vec4(rgbM, texture(u_texture0, v_texCoord).a);
    return;
  }
  vec2 dir;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));
  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 0.0078125);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * texel;
  vec3 rgbA = 0.5 * (
    texture(u_texture0, v_texCoord + dir * (1.0 / 3.0 - 0.5)).rgb +
    texture(u_texture0, v_texCoord + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (
    texture(u_texture0, v_texCoord + dir * -0.5).rgb +
    texture(u_texture0, v_texCoord + dir * 0.5).rgb);
  float lumaB = luma(rgbB);
  vec3 result = (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
  o_color = vec4(result, texture(u_texture0, v_texCoord).a);
}`;

const SMAA_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform float u_threshold;
out vec4 o_color;
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec4 center = texture(u_texture0, v_texCoord);
  float lumaC = luma(center.rgb);
  float lumaL = luma(texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb);
  float lumaR = luma(texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb);
  float lumaT = luma(texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb);
  float lumaB = luma(texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb);
  float edge = max(abs(lumaC - lumaL), max(abs(lumaC - lumaR), max(abs(lumaC - lumaT), abs(lumaC - lumaB))));
  if (edge < u_threshold) {
    o_color = center;
    return;
  }
  vec3 blurred = (
    texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb +
    center.rgb) / 5.0;
  o_color = vec4(blurred, center.a);
}`;

const TAA_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}`;
