import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type {
  CameraMotionBlurEffect,
  DirectionalBlurEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  MotionBlurEffect,
  RadialBlurEffect,
} from '@flighthq/types';

import { getGlEffectProgram } from './effectProgramCache';

// Camera motion blur: a real single-pass radial/zoom blur scaled by intensity — smears each sample
// toward the screen center. A legitimate 2D effect on its own. Two richer variants are 2D-native
// follow-ups, not 3D-gated: feeding the actual camera/root transform delta as the smear vector (global
// velocity), and per-object motion blur reading ctx.sceneVelocityTexture (per-node prev-transform delta).
export function applyCameraMotionBlurEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<CameraMotionBlurEffect>,
): void {
  const intensity = effect.intensity ?? 0.5;
  const samples = effect.samples ?? 16;
  const program = getGlEffectProgram(state, 'cameraMotionBlur', CAMERA_MOTION_BLUR_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_samples'), samples);
  });
}

// Directional blur: accumulate samples stepped along `angle` over `length` texels, normalized by the
// sample count. Single-pass reference recipe. u_resolution converts the texel length into UV space.
export function applyDirectionalBlurEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<DirectionalBlurEffect>,
): void {
  const angle = effect.angle ?? 0;
  const length = effect.length ?? 8;
  const samples = effect.samples ?? 16;
  const program = getGlEffectProgram(state, 'directionalBlur', DIRECTIONAL_BLUR_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_angle'), angle);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_length'), length);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_samples'), samples);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

// Motion blur (per-object): the velocity-driven analog of the depth consumers (fog/DoF). When the scene
// produced a per-pixel velocity buffer (`velocityTexture`, rgba16f screen-space velocity in pixels in the
// RG channels), this is the real recipe — read each fragment's velocity, scale it by `intensity`, and
// accumulate `samples` taps spread along that vector centered on the fragment, smearing every object by
// its own motion. When velocity is absent (the scene did not write the buffer), u_hasVelocity=0 and it is
// a passthrough copy (sentinel path), preserving the pipeline stage without altering the image. Demonstrates
// the ctx.sceneVelocityTexture seam: real velocity path when present, sentinel copy when null.
export function applyMotionBlurEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  velocityTexture: WebGLTexture | null,
  effect: Readonly<MotionBlurEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const samples = effect.samples ?? 16;
  const program = getGlEffectProgram(state, 'motionBlur', MOTION_BLUR_FRAGMENT_SRC);
  const inputs = velocityTexture ? [source.texture, velocityTexture] : [source.texture];
  drawGlFullscreenPass(state, program, inputs, dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_samples'), samples);
    // u_resolution converts the pixel-space velocity vector into UV-space tap offsets.
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_hasVelocity'), velocityTexture ? 1 : 0);
  });
}

// Radial blur: accumulate samples stepped from the current uv toward (centerX, centerY) scaled by
// `strength`, normalized by the sample count. Single-pass reference recipe.
export function applyRadialBlurEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<RadialBlurEffect>,
): void {
  const centerX = effect.centerX ?? 0.5;
  const centerY = effect.centerY ?? 0.5;
  const strength = effect.strength ?? 0.2;
  const samples = effect.samples ?? 16;
  const program = getGlEffectProgram(state, 'radialBlur', RADIAL_BLUR_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_center'), centerX, centerY);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_strength'), strength);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_samples'), samples);
  });
}

export const defaultGlCameraMotionBlurEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyCameraMotionBlurEffectToGl(ctx.state, ctx.source, ctx.dest, effect as CameraMotionBlurEffect);
};

export const defaultGlDirectionalBlurEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyDirectionalBlurEffectToGl(ctx.state, ctx.source, ctx.dest, effect as DirectionalBlurEffect);
};

export const defaultGlMotionBlurEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyMotionBlurEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.sceneVelocityTexture, effect as MotionBlurEffect);
};

export const defaultGlRadialBlurEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyRadialBlurEffectToGl(ctx.state, ctx.source, ctx.dest, effect as RadialBlurEffect);
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

const MOTION_BLUR_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_intensity;
uniform float u_samples;
uniform vec2 u_resolution;
uniform float u_hasVelocity;
out vec4 o_color;
const int SAMPLES = 16;
void main() {
  vec4 base = texture(u_texture0, v_texCoord);
  if (u_hasVelocity < 0.5) {
    // Sentinel path: no velocity buffer written — passthrough copy.
    o_color = base;
    return;
  }
  // Velocity decode: rgba16f buffer stores screen-space velocity in pixels in the RG channels. Convert
  // to a UV-space smear vector via u_resolution and scale by intensity.
  vec2 velocityPixels = texture(u_texture1, v_texCoord).rg;
  vec2 smear = (velocityPixels / u_resolution) * u_intensity;
  float count = min(u_samples, 16.0);
  vec4 sum = vec4(0.0);
  float taken = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    if (float(i) >= count) break;
    // Center the taps on the fragment: t in [-0.5, 0.5] spreads the accumulation along the motion vector.
    float t = count > 1.0 ? (float(i) / (count - 1.0)) - 0.5 : 0.0;
    vec2 uv = v_texCoord + smear * t;
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
