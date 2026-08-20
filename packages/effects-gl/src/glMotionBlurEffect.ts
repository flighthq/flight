import { drawGlFullscreenPass } from '@flighthq/render-gl/contract';
import type { GlRenderEffectRunner, GlRenderState, GlRenderTarget, MotionBlurEffect } from '@flighthq/types/contract';

import { getGlEffectProgram } from './glEffectProgramCache';
import { registerGlRenderEffect } from './glRenderEffectRegistry';

// Motion blur (per-object): the velocity-driven analog of the depth consumers (fog/DoF). When the scene
// produced a per-pixel velocity buffer (`velocityTexture`, rgba16f screen-space velocity in pixels in the
// RG channels), this is the real recipe — read each fragment's velocity, scale it by `intensity`, and
// accumulate `samples` taps spread along that vector centered on the fragment, smearing every object by
// its own motion. When velocity is absent (the scene did not write the buffer), u_hasVelocity=0 and it is
// a passthrough copy (sentinel path), preserving the pipeline scene2d without altering the image. Demonstrates
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

export const defaultGlMotionBlurEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyMotionBlurEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.sceneVelocityTexture, effect as MotionBlurEffect);
};

export function registerGlMotionBlurEffect(state: GlRenderState): void {
  registerGlRenderEffect(state, 'MotionBlurEffect', defaultGlMotionBlurEffectRunner);
}

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
  // BISECTION PROBE: hardcode to bypass sentinel — if the picture changes, the sentinel
  // gate is the break (u_hasVelocity uniform or velocity-texture binding is wrong); if it
  // does not change, the velocity texture is empty or the smear math is inert.
  float hasVelocityProbe = 1.0;
  if (hasVelocityProbe < 0.5) {
    o_color = base;
    return;
  }
  // Velocity decode: rgba16f buffer stores screen-space velocity in pixels in the RG channels (Y-down).
  // The fullscreen pass UV is bottom-left origin (v increases upward), so the Y component is negated to
  // convert from screen-space-down to UV-space-up before scaling by intensity.
  vec2 velocityPixels = texture(u_texture1, v_texCoord).rg;
  vec2 smear = vec2(velocityPixels.x, -velocityPixels.y) / u_resolution * u_intensity;
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
