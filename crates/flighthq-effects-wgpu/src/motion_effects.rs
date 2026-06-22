//! WGPU motion-blur effect recipes.
//!
//! `MotionBlur` requires a per-pixel velocity buffer; the recipe falls back to a
//! passthrough copy when no velocity texture is supplied.  Camera motion blur is
//! a real radial/zoom blur scaled by intensity.  Directional and radial blur are
//! single-pass reference recipes.
//!
//! Mirrors the TS `motionEffects` from `effects-webgpu`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{
    CameraMotionBlurEffect, DirectionalBlurEffect, MotionBlurEffect, RadialBlurEffect,
};
use flighthq_render_wgpu::render_state::{WgpuRenderState, WgpuRenderTarget};

use crate::effect_program_cache::{
    WgpuEffectBlend, draw_wgpu_dual_source_effect_pass, draw_wgpu_effect_filter_pass,
    get_wgpu_dual_source_effect_pipeline, get_wgpu_effect_pipeline,
};
use crate::render_effect_registry::{WgpuRenderEffectContext, WgpuRenderEffectRunner};

/// Applies camera (zoom/radial) motion blur to `source` and writes to `dest`.
pub fn apply_camera_motion_blur_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &CameraMotionBlurEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.5);
    let samples = effect.samples.unwrap_or(16) as f32;
    get_wgpu_effect_pipeline(
        state,
        "motion.cameraMotionBlur",
        CAMERA_MOTION_BLUR_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "motion.cameraMotionBlur",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = intensity;
            f32s[1] = samples;
        },
    );
}

/// Applies directional blur to `source` and writes to `dest`.
pub fn apply_directional_blur_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &DirectionalBlurEffect,
) {
    let angle = effect.angle.unwrap_or(0.0);
    let length = effect.length.unwrap_or(8.0);
    let samples = effect.samples.unwrap_or(16) as f32;
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "motion.directionalBlur",
        DIRECTIONAL_BLUR_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "motion.directionalBlur",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = angle;
            f32s[1] = length;
            f32s[2] = samples;
            f32s[4] = width;
            f32s[5] = height;
        },
    );
}

/// Applies velocity-buffer motion blur to `source` and writes to `dest`.
///
/// When `velocity_texture` is `Some`, this is the real recipe: each fragment
/// reads its velocity, scales it by `intensity`, and accumulates taps along that
/// vector.  When `None`, `u_hasVelocity = 0` makes the fragment a passthrough
/// copy (the source binds as both inputs to satisfy the dual-source layout).
pub fn apply_motion_blur_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    velocity_texture: Option<wgpu::TextureView>,
    effect: &MotionBlurEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let samples = effect.samples.unwrap_or(16) as f32;
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_dual_source_effect_pipeline(
        state,
        "motion.motionBlur",
        MOTION_BLUR_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    let has_velocity = velocity_texture.is_some();
    // Sentinel path: with no velocity buffer, bind the source as the second input
    // so the dual-source layout is satisfied; u_hasVelocity = 0 → passthrough copy.
    let second_view = velocity_texture.unwrap_or_else(|| {
        source
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default())
    });
    draw_wgpu_dual_source_effect_pass(
        state,
        "motion.motionBlur",
        source,
        &second_view,
        Some(dest),
        |f32s, _| {
            f32s[0] = intensity;
            f32s[1] = samples;
            f32s[2] = width;
            f32s[3] = height;
            f32s[4] = if has_velocity { 1.0 } else { 0.0 };
        },
    );
}

/// Applies radial blur about a screen-space centre to `source` and writes to
/// `dest`.
pub fn apply_radial_blur_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &RadialBlurEffect,
) {
    let center_x = effect.center_x.unwrap_or(0.5);
    let center_y = effect.center_y.unwrap_or(0.5);
    let strength = effect.strength.unwrap_or(0.2);
    let samples = effect.samples.unwrap_or(16) as f32;
    get_wgpu_effect_pipeline(
        state,
        "motion.radialBlur",
        RADIAL_BLUR_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "motion.radialBlur", source, Some(dest), |f32s, _| {
        f32s[0] = center_x;
        f32s[1] = center_y;
        f32s[2] = strength;
        f32s[3] = samples;
    });
}

/// Default WGPU runner for [`CameraMotionBlurEffect`].
pub const DEFAULT_WGPU_CAMERA_MOTION_BLUR_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::CameraMotionBlur(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_camera_motion_blur_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`DirectionalBlurEffect`].
pub const DEFAULT_WGPU_DIRECTIONAL_BLUR_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::DirectionalBlur(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_directional_blur_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`MotionBlurEffect`].
pub const DEFAULT_WGPU_MOTION_BLUR_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::MotionBlur(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            let velocity = ctx.scene_velocity_texture.take();
            apply_motion_blur_effect_to_wgpu(ctx.state, source, dest, velocity, effect);
        }
    };

/// Default WGPU runner for [`RadialBlurEffect`].
pub const DEFAULT_WGPU_RADIAL_BLUR_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::RadialBlur(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_radial_blur_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

// Slot layout: [0]=intensity, [1]=samples. SAMPLES caps the loop; min(u_samples, 16.0) gates the taps.
const CAMERA_MOTION_BLUR_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_intensity : f32,
  u_samples : f32,
  _pad0 : f32,
  _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let toCenter = vec2f(0.5) - uv;
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    let t = select(0.0, f32(i) / (count - 1.0), count > 1.0);
    let p = uv + toCenter * (t * uni.u_intensity);
    sum = sum + textureSampleLevel(tex, smp, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}"#;

// Slot layout: [0]=angle, [1]=length, [2]=samples, [3]=pad, [4]=resolution.x, [5]=resolution.y.
const DIRECTIONAL_BLUR_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_angle : f32,
  u_length : f32,
  u_samples : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let dir = vec2f(cos(uni.u_angle), sin(uni.u_angle)) * (uni.u_length / uni.u_resolution);
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    let t = select(0.0, (f32(i) / (count - 1.0)) - 0.5, count > 1.0);
    let p = uv + dir * t;
    sum = sum + textureSampleLevel(tex, smp, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}"#;

// Slot layout: [0]=intensity, [1]=samples, [2]=resolution.x, [3]=resolution.y, [4]=hasVelocity.
// Color binds at group 1, velocity at group 2.
const MOTION_BLUR_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_intensity : f32,
  u_samples : f32,
  u_resolution : vec2f,
  u_hasVelocity : f32,
  _pad0 : f32,
  _pad1 : f32,
  _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex0 : texture_2d<f32>;
@group(1) @binding(1) var smp0 : sampler;
@group(2) @binding(0) var tex1 : texture_2d<f32>;
@group(2) @binding(1) var smp1 : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let base = textureSampleLevel(tex0, smp0, uv, 0.0);
  if (uni.u_hasVelocity < 0.5) {
    return base;
  }
  let velocityPixels = textureSampleLevel(tex1, smp1, uv, 0.0).rg;
  let smear = (velocityPixels / uni.u_resolution) * uni.u_intensity;
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    let t = select(0.0, (f32(i) / (count - 1.0)) - 0.5, count > 1.0);
    let p = uv + smear * t;
    sum = sum + textureSampleLevel(tex0, smp0, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}"#;

// Slot layout: [0]=center.x, [1]=center.y, [2]=strength, [3]=samples.
const RADIAL_BLUR_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_center : vec2f,
  u_strength : f32,
  u_samples : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let toCenter = uni.u_center - uv;
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    let t = select(0.0, f32(i) / (count - 1.0), count > 1.0);
    let p = uv + toCenter * (t * uni.u_strength);
    sum = sum + textureSampleLevel(tex, smp, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effect_program_cache::build_wgpu_effect_module_wgsl;

    #[test]
    fn motion_blur_fragment_binds_velocity_at_group_two() {
        let module = build_wgpu_effect_module_wgsl(MOTION_BLUR_FRAGMENT_WGSL);
        assert!(module.contains("@group(1) @binding(0) var tex0"));
        assert!(module.contains("@group(2) @binding(0) var tex1"));
        // Sentinel path: hasVelocity < 0.5 returns the unmodified base sample.
        assert!(module.contains("uni.u_hasVelocity < 0.5"));
    }

    #[test]
    fn directional_blur_fragment_declares_resolution() {
        let module = build_wgpu_effect_module_wgsl(DIRECTIONAL_BLUR_FRAGMENT_WGSL);
        assert!(module.contains("u_angle"));
        assert!(module.contains("u_resolution : vec2f"));
    }

    #[test]
    fn radial_blur_fragment_uses_center_uniform() {
        let module = build_wgpu_effect_module_wgsl(RADIAL_BLUR_FRAGMENT_WGSL);
        assert!(module.contains("u_center : vec2f"));
        assert!(module.contains("u_strength"));
    }
}
