// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Camera motion blur (TS `wgpuCameraMotionBlurEffect.ts`): a single-pass radial/zoom blur scaled by
//! intensity that smears each sample toward the screen center, the mirror of the GL runner.

use flight_effects::{Effect, CameraMotionBlurEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const CAMERA_MOTION_BLUR_FRAGMENT_WGSL: &str = r#"
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

/// Smears `source` toward the screen center into `dest` (TS `applyCameraMotionBlurEffectToWgpu`).
pub fn apply_camera_motion_blur_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &CameraMotionBlurEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.5);
    let samples = effect.samples.unwrap_or(16.0);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "motion.cameraMotionBlur",
        CAMERA_MOTION_BLUR_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = intensity;
            f32[1] = samples;
        },
    );
}

/// Registers the default runner under `CameraMotionBlurEffect` (TS `registerWgpuCameraMotionBlurEffect`).
pub fn register_wgpu_camera_motion_blur_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "CameraMotionBlurEffect", wgpu_camera_motion_blur_effect_runner, None);
}

/// The default `CameraMotionBlurEffect` runner (TS `wgpuCameraMotionBlurEffectRunner`).
pub fn wgpu_camera_motion_blur_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<CameraMotionBlurEffect>(effect, "wgpuCameraMotionBlurEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_camera_motion_blur_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
