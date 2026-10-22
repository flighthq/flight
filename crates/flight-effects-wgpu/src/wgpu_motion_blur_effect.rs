// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Per-object motion blur (TS `wgpuMotionBlurEffect.ts`): the velocity-driven analog of the depth
//! consumers. With a per-pixel velocity buffer (rgba16f screen-space velocity in pixels in RG) each
//! fragment accumulates `samples` taps spread along its own velocity scaled by `intensity`; the
//! velocity binds as the second source at @group(2). Without one, `u_hasVelocity = 0` and the pass
//! is a passthrough copy.

use flight_effects::{Effect, MotionBlurEffect};
use flight_entity::Ref;
use flight_render_wgpu::{
    WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget,
    get_wgpu_render_state_native_device,
};

use crate::types::*;
use crate::wgpu_effect_pass::{
    begin_effect_pass, create_wgpu_dual_source_effect_pipeline, draw_wgpu_dual_source_effect_pass,
    get_or_create_texture_bind_group, get_wgpu_effect_pass_state,
};
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_runtime::{
    draw_wgpu_effect_fullscreen_quad, get_wgpu_effect_module_pipeline,
    set_wgpu_effect_pass_bind_group, set_wgpu_effect_pass_pipeline,
};
use crate::wgpu_effect_texel_scale::get_wgpu_effect_logical_resolution;

// Slot layout: [0]=intensity, [1]=samples, [2]=resolution.x, [3]=resolution.y, [4]=hasVelocity.
// Color binds at group 1, velocity at group 2; u_resolution converts pixel velocity to UV offsets.
const MOTION_BLUR_FRAGMENT_WGSL: &str = r#"
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
    // Sentinel path: no velocity buffer written — passthrough copy.
    return base;
  }
  // Velocity decode: rgba16f buffer stores screen-space velocity in pixels in the RG channels. Convert
  // to a UV-space smear vector via u_resolution and scale by intensity.
  let velocityPixels = textureSampleLevel(tex1, smp1, uv, 0.0).rg;
  let smear = (velocityPixels / uni.u_resolution) * uni.u_intensity;
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    // Center the taps on the fragment: t in [-0.5, 0.5] spreads the accumulation along the motion vector.
    let t = select(0.0, (f32(i) / (count - 1.0)) - 0.5, count > 1.0);
    let p = uv + smear * t;
    sum = sum + textureSampleLevel(tex0, smp0, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}"#;

/// Smears `source` along the scene's per-pixel velocity into `dest`, or copies it through when
/// `velocity_texture` is `None` (TS `applyMotionBlurEffectToWgpu`).
pub fn apply_motion_blur_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    velocity_texture: Option<&wgpu::Texture>,
    effect: &MotionBlurEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let samples = effect.samples.unwrap_or(16.0);
    let resolution = get_wgpu_effect_logical_resolution(state, source);
    let pipeline = get_motion_blur_pipeline(state);
    let Some(velocity_texture) = velocity_texture else {
        // Sentinel path: no velocity buffer; bind source as both inputs so the dual-source layout is
        // satisfied, and u_hasVelocity = 0 makes the fragment a passthrough copy.
        draw_wgpu_dual_source_effect_pass(
            state,
            source,
            source,
            Some(dest),
            &mut pipeline.write().unwrap(),
            &mut |f32, _| {
                f32[0] = intensity;
                f32[1] = samples;
                f32[2] = resolution.width;
                f32[3] = resolution.height;
                f32[4] = 0.0;
            },
        );
        return;
    };
    // The source wraps the raw velocity texture as a minimal second source carrying only a view; a
    // texture target cannot be built around a foreign texture here, so the dual-source draw is
    // spelled out with the velocity view bound at @group(2).
    let velocity_view = velocity_texture.create_view(&wgpu::TextureViewDescriptor::default());
    let native = get_wgpu_render_state_native_device(state);
    let fs = get_wgpu_effect_pass_state(state);
    let slot_offset = (fs.acquire_slot)(state);
    (fs.write_slot)(state, slot_offset, &mut |f32, _| {
        f32[0] = intensity;
        f32[1] = samples;
        f32[2] = resolution.width;
        f32[3] = resolution.height;
        f32[4] = 1.0;
    });
    let source_bind_group = get_or_create_texture_bind_group(state, &native, &source.view);
    let velocity_bind_group = get_or_create_texture_bind_group(state, &native, &velocity_view);
    let render_pipeline = resolve_motion_blur_pipeline(state, &pipeline, dest.format);
    let mut pass = begin_effect_pass(state, Some(dest), wgpu::LoadOp::Load);
    set_wgpu_effect_pass_pipeline(&native, &mut pass, &render_pipeline);
    set_wgpu_effect_pass_bind_group(
        &native,
        &mut pass,
        0,
        &fs.uniform_bind_group,
        &[slot_offset],
    );
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 1, &source_bind_group, &[]);
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 2, &velocity_bind_group, &[]);
    draw_wgpu_effect_fullscreen_quad(&native, pass);
}

// Motion blur needs two source bindings (color = group 1, velocity = group 2), so it uses the
// dual-source primitive; cached per state alongside the single-source pipelines.
fn get_motion_blur_pipeline(state: &mut WgpuRenderState) -> Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_module_pipeline(state, "motionBlur.velocity", |state| {
        return create_wgpu_dual_source_effect_pipeline(
            state,
            MOTION_BLUR_FRAGMENT_WGSL,
            Some(WgpuEffectBlendMode::Replace),
        );
    });
}

/// Registers the default runner under `MotionBlurEffect` (TS `registerWgpuMotionBlurEffect`).
pub fn register_wgpu_motion_blur_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "MotionBlurEffect",
        wgpu_motion_blur_effect_runner,
        None,
    );
}

// The variant whose color target matches `format` (the draw helper's per-format resolution).
fn resolve_motion_blur_pipeline(
    state: &WgpuRenderState,
    pipeline: &Ref<WgpuEffectPipeline>,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    let mut pipeline = pipeline.write().unwrap();
    if format == state.format {
        return pipeline.pipeline.clone();
    }
    let compile_for_format = pipeline.compile_for_format.clone();
    let (Some(compile_for_format), Some(variants)) =
        (compile_for_format, pipeline.variants.as_mut())
    else {
        return pipeline.pipeline.clone();
    };
    if let Some(variant) = variants.get(&format) {
        return variant.clone();
    }
    let variant = compile_for_format(format);
    variants.insert(format, variant.clone());
    return variant;
}

/// The default `MotionBlurEffect` runner (TS `wgpuMotionBlurEffectRunner`): feeds the context's
/// scene velocity texture.
pub fn wgpu_motion_blur_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<MotionBlurEffect>(effect, "wgpuMotionBlurEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    let velocity = ctx.scene_velocity_texture.clone();
    apply_motion_blur_effect_to_wgpu(ctx.state, &source, &dest, velocity.as_ref(), effect);
}
