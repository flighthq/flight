//! GL motion-blur effect recipes.
//!
//! - Camera motion blur: radial/zoom smear from screen center.
//! - Directional blur: tap accumulation along a fixed angle.
//! - Motion blur (per-object): velocity-driven; passthrough when the velocity
//!   texture is absent (sentinel path).
//! - Radial blur: smear toward a screen-space center point.
//!
//! Each recipe is a single-pass fragment shader keyed and compiled once per
//! state via `get_gl_effect_program`, then drawn with
//! `draw_gl_effect_fullscreen_pass`.  The tap-count loop bound is the GLSL
//! constant `SAMPLES` (16); the `u_samples` uniform clamps the active taps.
//!
//! Mirrors the TS `motionEffects` from `effects-webgl` and the WGPU
//! `motion_effects` from `effects-wgpu`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{
    CameraMotionBlurEffect, DirectionalBlurEffect, MotionBlurEffect, RadialBlurEffect,
};
use flighthq_render_gl::render_state::{GlRenderState, GlRenderTarget};
use glow::HasContext;

use crate::effect_program_cache::{draw_gl_effect_fullscreen_pass, get_gl_effect_program};
use crate::render_effect_registry::{GlRenderEffectContext, GlRenderEffectRunner};

// ---------------------------------------------------------------------------
// Recipe functions
// ---------------------------------------------------------------------------

/// Applies camera motion blur (radial/zoom smear) to `source` and writes to
/// `dest`.
pub fn apply_camera_motion_blur_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &CameraMotionBlurEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.5);
    let samples = effect.samples.unwrap_or(16) as f32;
    let texture = source.texture;

    let program = get_gl_effect_program(state, "cameraMotionBlur", CAMERA_MOTION_BLUR_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_1_f32(
                gl.get_uniform_location(p, "u_intensity").as_ref(),
                intensity,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_samples").as_ref(), samples);
        },
    );
}

/// Applies directional blur along `angle` to `source` and writes to `dest`.
pub fn apply_directional_blur_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &DirectionalBlurEffect,
) {
    let angle = effect.angle.unwrap_or(0.0);
    let length = effect.length.unwrap_or(8.0);
    let samples = effect.samples.unwrap_or(16) as f32;
    let width = source.width as f32;
    let height = source.height as f32;
    let texture = source.texture;

    let program = get_gl_effect_program(state, "directionalBlur", DIRECTIONAL_BLUR_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_angle").as_ref(), angle);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_length").as_ref(), length);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_samples").as_ref(), samples);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_resolution").as_ref(),
                width,
                height,
            );
        },
    );
}

/// Applies per-object motion blur to `source` and writes to `dest`.
///
/// When `velocity_texture` is `Some`, velocity is read per fragment and the
/// smear follows each object's motion vector.  When `None`, a passthrough copy
/// is written (sentinel path).
pub fn apply_motion_blur_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    velocity_texture: Option<glow::Texture>,
    effect: &MotionBlurEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let samples = effect.samples.unwrap_or(16) as f32;
    let width = source.width as f32;
    let height = source.height as f32;
    let texture = source.texture;

    let program = get_gl_effect_program(state, "motionBlur", MOTION_BLUR_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    let inputs: Vec<glow::Texture> = match velocity_texture {
        Some(velocity) => vec![texture, velocity],
        None => vec![texture],
    };
    let has_velocity = if velocity_texture.is_some() { 1.0 } else { 0.0 };
    draw_gl_effect_fullscreen_pass(state, program, &inputs, Some(dest), move |gl, p| unsafe {
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_intensity").as_ref(),
            intensity,
        );
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_samples").as_ref(), samples);
        // u_resolution converts the pixel-space velocity vector into UV-space tap offsets.
        gl.uniform_2_f32(
            gl.get_uniform_location(p, "u_resolution").as_ref(),
            width,
            height,
        );
        gl.uniform_1_f32(
            gl.get_uniform_location(p, "u_hasVelocity").as_ref(),
            has_velocity,
        );
    });
}

/// Applies radial blur toward `(center_x, center_y)` to `source` and writes
/// to `dest`.
pub fn apply_radial_blur_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    effect: &RadialBlurEffect,
) {
    let center_x = effect.center_x.unwrap_or(0.5);
    let center_y = effect.center_y.unwrap_or(0.5);
    let strength = effect.strength.unwrap_or(0.2);
    let samples = effect.samples.unwrap_or(16) as f32;
    let texture = source.texture;

    let program = get_gl_effect_program(state, "radialBlur", RADIAL_BLUR_FRAGMENT_SRC);
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(
        state,
        program,
        &[texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_center").as_ref(),
                center_x,
                center_y,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_strength").as_ref(), strength);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_samples").as_ref(), samples);
        },
    );
}

// ---------------------------------------------------------------------------
// Default runners
// ---------------------------------------------------------------------------

/// Default GL runner for [`CameraMotionBlurEffect`].
pub const DEFAULT_GL_CAMERA_MOTION_BLUR_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::CameraMotionBlur(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_camera_motion_blur_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`DirectionalBlurEffect`].
pub const DEFAULT_GL_DIRECTIONAL_BLUR_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::DirectionalBlur(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_directional_blur_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

/// Default GL runner for [`MotionBlurEffect`].
pub const DEFAULT_GL_MOTION_BLUR_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::MotionBlur(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_motion_blur_effect_to_gl(
                state,
                ctx.source,
                ctx.dest,
                ctx.scene_velocity_texture,
                effect,
            );
        }
    };

/// Default GL runner for [`RadialBlurEffect`].
pub const DEFAULT_GL_RADIAL_BLUR_EFFECT_RUNNER: GlRenderEffectRunner =
    |ctx: &GlRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::RadialBlur(effect) = effect {
            let state_ptr: *mut GlRenderState = ctx.state as *const _ as *mut _;
            // SAFETY: the pipeline guarantees state/source/dest are live and disjoint.
            let state = unsafe { &mut *state_ptr };
            apply_radial_blur_effect_to_gl(state, ctx.source, ctx.dest, effect);
        }
    };

// ---------------------------------------------------------------------------
// Fragment sources
// ---------------------------------------------------------------------------

const CAMERA_MOTION_BLUR_FRAGMENT_SRC: &str = "#version 300 es
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
}";

const DIRECTIONAL_BLUR_FRAGMENT_SRC: &str = "#version 300 es
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
}";

const MOTION_BLUR_FRAGMENT_SRC: &str = "#version 300 es
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
}";

const RADIAL_BLUR_FRAGMENT_SRC: &str = "#version 300 es
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
}";

#[cfg(test)]
mod tests {
    use super::*;

    // CAMERA_MOTION_BLUR_FRAGMENT_SRC

    #[test]
    fn camera_motion_blur_fragment_smears_toward_center() {
        assert!(CAMERA_MOTION_BLUR_FRAGMENT_SRC.contains("#version 300 es"));
        assert!(CAMERA_MOTION_BLUR_FRAGMENT_SRC.contains("vec2(0.5) - v_texCoord"));
        assert!(CAMERA_MOTION_BLUR_FRAGMENT_SRC.contains("t * u_intensity"));
    }

    // DIRECTIONAL_BLUR_FRAGMENT_SRC

    #[test]
    fn directional_blur_fragment_steps_along_angle() {
        assert!(DIRECTIONAL_BLUR_FRAGMENT_SRC.contains("cos(u_angle), sin(u_angle)"));
        assert!(DIRECTIONAL_BLUR_FRAGMENT_SRC.contains("u_length / u_resolution"));
    }

    // MOTION_BLUR_FRAGMENT_SRC

    #[test]
    fn motion_blur_fragment_reads_velocity_and_falls_back_to_passthrough() {
        assert!(MOTION_BLUR_FRAGMENT_SRC.contains("u_hasVelocity < 0.5"));
        assert!(MOTION_BLUR_FRAGMENT_SRC.contains("texture(u_texture1, v_texCoord).rg"));
        assert!(MOTION_BLUR_FRAGMENT_SRC.contains("(velocityPixels / u_resolution) * u_intensity"));
    }

    // RADIAL_BLUR_FRAGMENT_SRC

    #[test]
    fn radial_blur_fragment_smears_toward_center_point() {
        assert!(RADIAL_BLUR_FRAGMENT_SRC.contains("u_center - v_texCoord"));
        assert!(RADIAL_BLUR_FRAGMENT_SRC.contains("t * u_strength"));
    }
}
