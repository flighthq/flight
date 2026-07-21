import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { CameraMotionBlurEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Camera3D motion blur: a real single-pass radial/zoom blur scaled by intensity — smears each sample
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

export const defaultGlCameraMotionBlurEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyCameraMotionBlurEffectToGl(ctx.state, ctx.source, ctx.dest, effect as CameraMotionBlurEffect);
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
