// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Camera3D motion blur: a real single-pass radial/zoom blur scaled by intensity — smears each sample
//! toward the screen center. A legitimate 2D effect on its own. Two richer variants are 2D-native
//! follow-ups, not 3D-gated: feeding the actual camera/root transform delta as the smear vector (global
//! velocity), and per-object motion blur reading ctx.sceneVelocityTexture (per-node prev-transform delta).

use flight_effects::{CameraMotionBlurEffect, Effect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::uniform_1f;

const CAMERA_MOTION_BLUR_FRAGMENT_SRC: &str = r#"#version 300 es
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
}"#;

pub fn apply_camera_motion_blur_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &CameraMotionBlurEffect,
) -> Result<(), String> {
    let intensity = effect.intensity.unwrap_or(0.5);
    let samples = effect.samples.unwrap_or(16.0);
    let program =
        get_gl_effect_program(state, "cameraMotionBlur", CAMERA_MOTION_BLUR_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_intensity", intensity);
        uniform_1f(gl, p, "u_samples", samples);
    });
}

pub fn gl_camera_motion_blur_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<CameraMotionBlurEffect>() else {
        return Ok(());
    };
    return apply_camera_motion_blur_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_camera_motion_blur_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "CameraMotionBlurEffect",
        gl_camera_motion_blur_effect_runner,
        None,
    );
}
