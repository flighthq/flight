import {
  acquireGlRenderTarget,
  drawGlFullscreenPass,
  getGlRenderTextureTarget,
  releaseGlRenderTarget,
  withGlRenderState,
  writeGlRenderTextureTarget,
} from '@flighthq/render-gl/contract';
import type {
  BlurEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  RenderTexture,
} from '@flighthq/types/contract';

import { getGlEffectProgram, getGlEffectUniformLocation } from './glEffectProgramCache';
import { registerGlRenderEffect } from './glRenderEffectRegistry';

// Plain separable Gaussian blur: two axis passes (source → temp horizontally, temp → dest vertically),
// each a single weighted fullscreen pass with radius ⌈3σ⌉. `blurX`/`blurY` are the Gaussian standard
// deviations (CSS `blur(Xpx)` uses sigma = X), so this matches the CSS and surface Gaussian references.
// The effects-owned blur primitive — the shared gaussian pass BloomEffect and the plain BlurEffect both
// use, so the effects backend owns its blur outright rather than delegating to a filters backend.

// Applies a `BlurEffect` descriptor to `source`, compositing into `dest`. Neither `dest` nor the
// distinct ping-pong `temp` target is cleared by this entry point.
export function applyBlurEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  temp: Readonly<GlRenderTarget>,
  effect: Readonly<BlurEffect>,
): void {
  applyGaussianBlurToGl(state, source, dest, temp, { blurX: effect.blurX, blurY: effect.blurY });
}

// RenderTexture-facing BlurEffect apply. It composites and never clears; clear reused `dest` and
// `temp` first with `clearGlRenderTexture` when each frame should replace the previous result.
export function applyBlurEffectToGlRenderTextures(
  state: GlRenderState,
  source: Readonly<RenderTexture>,
  dest: RenderTexture,
  temp: RenderTexture,
  effect: Readonly<BlurEffect>,
): boolean {
  return applyGaussianBlurToGlRenderTextures(state, source, dest, temp, effect);
}

// Applies a faithful separable Gaussian blur to `source`, compositing into `dest`. `blurX`/`blurY` are the
// Gaussian standard deviations in pixels (default 4). Runs two unconditional separable passes,
// source → temp (X) then temp → dest (Y); neither destination is cleared. `temp` is a ping-pong
// scratch distinct from both.
export function applyGaussianBlurToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  temp: Readonly<GlRenderTarget>,
  options: Readonly<{ blurX?: number; blurY?: number }>,
): void {
  const sigmaX = options.blurX ?? 4;
  const sigmaY = options.blurY ?? 4;
  const radiusX = sigmaX > 0 ? Math.ceil(sigmaX * 3) : 0;
  const radiusY = sigmaY > 0 ? Math.ceil(sigmaY * 3) : 0;
  applyGlGaussianBlurPass(state, source, temp, sigmaX, radiusX, 1, 0);
  applyGlGaussianBlurPass(state, temp, dest, sigmaY, radiusY, 0, 1);
}

// RenderTexture-facing target-to-target apply. Both passes composite and never clear; callers reusing
// `dest` or `temp` across frames must first clear them with `clearGlRenderTexture`. The hidden
// GlRenderTargets never leave this backend wrapper; success publishes both writes.
export function applyGaussianBlurToGlRenderTextures(
  state: GlRenderState,
  source: Readonly<RenderTexture>,
  dest: RenderTexture,
  temp: RenderTexture,
  options: Readonly<{ blurX?: number; blurY?: number }>,
): boolean {
  if (source === dest || source === temp || dest === temp) {
    throw new Error('applyGaussianBlurToGlRenderTextures: source, destination, and scratch must be distinct');
  }
  const sourceTarget = getGlRenderTextureTarget(state, source);
  if (sourceTarget === null) return false;
  withGlRenderState(state, () => {
    writeGlRenderTextureTarget(state, temp, (tempTarget) => {
      writeGlRenderTextureTarget(state, dest, (destTarget) => {
        applyGaussianBlurToGl(state, sourceTarget, destTarget, tempTarget, options);
      });
    });
  });
  return true;
}

export const defaultGlBlurEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  const descriptor = { width: ctx.source.width, height: ctx.source.height, format: ctx.source.format };
  const temp = acquireGlRenderTarget(ctx.state, ctx.pool, descriptor);
  applyBlurEffectToGl(ctx.state, ctx.source, ctx.dest, temp, effect as BlurEffect);
  releaseGlRenderTarget(ctx.pool, temp);
};

export function registerGlBlurEffect(state: GlRenderState): void {
  registerGlRenderEffect(state, 'BlurEffect', defaultGlBlurEffectRunner);
}

function applyGlGaussianBlurPass(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  sigma: number,
  radius: number,
  dirX: number,
  dirY: number,
): void {
  const program = getGlEffectProgram(state, 'blur.gaussian', GAUSSIAN_BLUR_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(getGlEffectUniformLocation(state, p, 'u_texelSize'), 1 / source.width, 1 / source.height);
    gl.uniform1f(getGlEffectUniformLocation(state, p, 'u_sigma'), sigma);
    gl.uniform1f(getGlEffectUniformLocation(state, p, 'u_radius'), radius);
    gl.uniform2f(getGlEffectUniformLocation(state, p, 'u_direction'), dirX, dirY);
  });
}

const GAUSSIAN_BLUR_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_texelSize;
uniform float u_sigma;
uniform float u_radius;
uniform vec2 u_direction;
out vec4 o_color;
void main() {
  int r = max(0, int(u_radius));
  if (r == 0) {
    o_color = texture(u_texture0, v_texCoord);
    return;
  }
  float twoSigmaSq = 2.0 * u_sigma * u_sigma;
  vec4 sum = vec4(0.0);
  float weightSum = 0.0;
  for (int i = -r; i <= r; i++) {
    float w = exp(-float(i * i) / twoSigmaSq);
    sum += w * texture(u_texture0, v_texCoord + float(i) * u_texelSize * u_direction);
    weightSum += w;
  }
  o_color = sum / weightSum;
}`;
