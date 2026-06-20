import { drawWebGLFullscreenPass } from '@flighthq/render-webgl';
import type {
  CameraMotionBlurEffect,
  DirectionalBlurEffect,
  RadialBlurEffect,
  WebGLRenderEffectRunner,
  WebGLRenderState,
  WebGLRenderTarget,
} from '@flighthq/types';

import { getWebGLEffectProgram } from './effectProgramCache';

// Camera motion blur: a real single-pass radial/zoom blur scaled by intensity — smears each sample
// toward the screen center. A legitimate 2D effect on its own. Two richer variants are 2D-native
// follow-ups, not 3D-gated: feeding the actual camera/root transform delta as the smear vector (global
// velocity), and per-object motion blur reading ctx.sceneVelocityTexture (per-node prev-transform delta).
export function applyCameraMotionBlurEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<CameraMotionBlurEffect>,
): void {
  const intensity = effect.intensity ?? 0.5;
  const samples = effect.samples ?? 16;
  const program = getWebGLEffectProgram(state, 'cameraMotionBlur', CAMERA_MOTION_BLUR_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_samples'), samples);
  });
}

// Directional blur: accumulate samples stepped along `angle` over `length` texels, normalized by the
// sample count. Single-pass reference recipe. u_resolution converts the texel length into UV space.
export function applyDirectionalBlurEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<DirectionalBlurEffect>,
): void {
  const angle = effect.angle ?? 0;
  const length = effect.length ?? 8;
  const samples = effect.samples ?? 16;
  const program = getWebGLEffectProgram(state, 'directionalBlur', DIRECTIONAL_BLUR_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_angle'), angle);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_length'), length);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_samples'), samples);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

// Radial blur: accumulate samples stepped from the current uv toward (centerX, centerY) scaled by
// `strength`, normalized by the sample count. Single-pass reference recipe.
export function applyRadialBlurEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<RadialBlurEffect>,
): void {
  const centerX = effect.centerX ?? 0.5;
  const centerY = effect.centerY ?? 0.5;
  const strength = effect.strength ?? 0.2;
  const samples = effect.samples ?? 16;
  const program = getWebGLEffectProgram(state, 'radialBlur', RADIAL_BLUR_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_center'), centerX, centerY);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_strength'), strength);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_samples'), samples);
  });
}

export const defaultWebGLCameraMotionBlurEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyCameraMotionBlurEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as CameraMotionBlurEffect);
};

export const defaultWebGLDirectionalBlurEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyDirectionalBlurEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as DirectionalBlurEffect);
};

export const defaultWebGLRadialBlurEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyRadialBlurEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as RadialBlurEffect);
};

const CAMERA_MOTION_BLUR_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_samples;
out vec4 o_color;
const int SAMPLES = 16;
void main() {
  vec2 toCenter = vec2(0.5) - v_texCoord;
  float count = min(u_samples, 16.0);
  vec4 sum = vec4(0.0);
  float taken = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    if (float(i) >= count) break;
    float t = count > 1.0 ? float(i) / (count - 1.0) : 0.0;
    vec2 uv = v_texCoord + toCenter * (t * u_intensity);
    sum += texture(u_texture0, uv);
    taken += 1.0;
  }
  o_color = sum / max(taken, 1.0);
}`;

const DIRECTIONAL_BLUR_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_angle;
uniform float u_length;
uniform float u_samples;
uniform vec2 u_resolution;
out vec4 o_color;
const int SAMPLES = 16;
void main() {
  vec2 dir = vec2(cos(u_angle), sin(u_angle)) * (u_length / u_resolution);
  float count = min(u_samples, 16.0);
  vec4 sum = vec4(0.0);
  float taken = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    if (float(i) >= count) break;
    float t = count > 1.0 ? (float(i) / (count - 1.0)) - 0.5 : 0.0;
    vec2 uv = v_texCoord + dir * t;
    sum += texture(u_texture0, uv);
    taken += 1.0;
  }
  o_color = sum / max(taken, 1.0);
}`;

const RADIAL_BLUR_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_center;
uniform float u_strength;
uniform float u_samples;
out vec4 o_color;
const int SAMPLES = 16;
void main() {
  vec2 toCenter = u_center - v_texCoord;
  float count = min(u_samples, 16.0);
  vec4 sum = vec4(0.0);
  float taken = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    if (float(i) >= count) break;
    float t = count > 1.0 ? float(i) / (count - 1.0) : 0.0;
    vec2 uv = v_texCoord + toCenter * (t * u_strength);
    sum += texture(u_texture0, uv);
    taken += 1.0;
  }
  o_color = sum / max(taken, 1.0);
}`;
