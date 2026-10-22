// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets, take native texture names and return Result diagnostics
//! Motion blur (per-object): when the scene produced a per-pixel velocity buffer (screen-space
//! velocity in pixels in the RG channels), read each fragment's velocity, scale it by `intensity`,
//! and accumulate `samples` taps spread along that vector centered on the fragment. When velocity is
//! absent, `u_hasVelocity = 0` and the pass is a passthrough copy (sentinel path).
use flight_effects::{Effect, MotionBlurEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};
use glow::NativeTexture;

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const MOTION_BLUR_FRAGMENT_SRC: &str = r#"#version 300 es
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
}"#;

pub fn apply_motion_blur_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    velocity_texture: Option<NativeTexture>,
    effect: &MotionBlurEffect,
) -> Result<(), String> {
    let intensity = effect.intensity.unwrap_or(1.0);
    let samples = effect.samples.unwrap_or(16.0);
    let program = get_gl_effect_program(state, "motionBlur", MOTION_BLUR_FRAGMENT_SRC)?;
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let inputs: Vec<NativeTexture> = match velocity_texture {
        Some(texture) => vec![source.texture, texture],
        None => vec![source.texture],
    };
    let has_input = if velocity_texture.is_some() { 1.0 } else { 0.0 };
    return draw_gl_fullscreen_pass(state, &program, &inputs, Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_intensity", intensity);
        uniform_1f(gl, p, "u_samples", samples);
        // u_resolution converts the pixel-space velocity vector into UV-space tap offsets.
        uniform_2f(gl, p, "u_resolution", width, height);
        uniform_1f(gl, p, "u_hasVelocity", has_input);
    });
}

pub fn gl_motion_blur_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<MotionBlurEffect>() else {
        return Ok(());
    };
    return apply_motion_blur_effect_to_gl(
        ctx.state,
        ctx.source,
        ctx.dest,
        ctx.scene_velocity_texture,
        effect,
    );
}

pub fn register_gl_motion_blur_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "MotionBlurEffect",
        gl_motion_blur_effect_runner,
        None,
    );
}
