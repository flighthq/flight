// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets and pools
//! Gradient glow (TS `wgpuGradientGlowEffect.ts`): an outer glow whose color is looked up from a
//! colors/alphas/ratios gradient ramp indexed by the blurred silhouette alpha, then sourceMode
//! decides source compositing. Acquires three scratch targets from the effect pool, runs neutral
//! tint → box blur → gradient lookup → composite, then releases them.

use flight_effects::{Effect, EffectSourceMode, GradientGlowEffect};
use flight_entity::{EntityRuntimeSlot, Ref};
use flight_render_wgpu::{
    WgpuCommandRecord, WgpuEffectContext, WgpuRenderPipelineRecord, WgpuRenderState,
    WgpuRenderTargetPool, WgpuTextureRenderTarget, WgpuTextureRenderTargetDescriptor,
    acquire_wgpu_texture_render_target, get_wgpu_render_state_native_device, record_wgpu_command,
    release_wgpu_texture_render_target,
};

use crate::types::*;
use crate::wgpu_bitmap_displacement_effect::initialize_wgpu_effect_pipeline;
use crate::wgpu_effect_blit_shader::{apply_wgpu_effect_blit_pass, apply_wgpu_effect_erase_pass};
use crate::wgpu_effect_box_blur::apply_wgpu_effect_box_blur;
use crate::wgpu_effect_gradient_ramp::get_wgpu_effect_gradient_ramp_texture;
use crate::wgpu_effect_pass::{
    EFFECT_VERTEX_WGSL, clear_wgpu_effect_target, get_wgpu_effect_pass_state,
};
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_runtime::{
    create_wgpu_effect_pipeline_layout, create_wgpu_effect_shader_module,
    create_wgpu_effect_texture_bind_group, draw_wgpu_effect_fullscreen_quad,
    get_wgpu_effect_module_pipeline, set_wgpu_effect_pass_bind_group,
    set_wgpu_effect_pass_pipeline,
};
use crate::wgpu_effect_tint_shader::apply_wgpu_effect_tint_pass;

// Uses the blurred alpha (group 1) to index into a gradient ramp texture (group 2).
const GRADIENT_LOOKUP_FRAGMENT_WGSL: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texBlurred : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texRamp : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let alpha = textureSampleLevel(texBlurred, smp, uv, 0.0).a;
  return textureSampleLevel(texRamp, smp2, vec2f(alpha, 0.5), 0.0);
}"#;

// The source's lookup pipeline names no blend on its color target (writes replace), whatever mode the
// entity records.
fn create_unblended_pipeline(
    native: &flight_render_wgpu::WgpuNativeDevice,
    layout: &wgpu::PipelineLayout,
    module: &wgpu::ShaderModule,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    let targets = [Some(wgpu::ColorTargetState {
        format,
        blend: None,
        write_mask: wgpu::ColorWrites::ALL,
    })];
    let pipeline = native
        .device
        .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(layout),
            vertex: wgpu::VertexState {
                module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &targets,
            }),
            depth_stencil: None,
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..wgpu::PrimitiveState::default()
            },
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });
    record_wgpu_command(native, || {
        return WgpuCommandRecord::CreateRenderPipeline(WgpuRenderPipelineRecord {
            depth_stencil: None,
            pipeline: pipeline.clone(),
            targets: targets.to_vec(),
        });
    });
    return pipeline;
}

/// Applies a `GradientGlowEffect` from `source` into `dest`, borrowing three scratch targets from
/// `pool` (TS `applyGradientGlowEffectToWgpu`).
pub fn apply_gradient_glow_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    pool: &mut WgpuRenderTargetPool,
    effect: &GradientGlowEffect,
) {
    let descriptor = WgpuTextureRenderTargetDescriptor {
        color_space: None,
        format: Some(source.format),
        height: source.height as f32,
        sample_count: None,
        width: source.width as f32,
    };
    let s0 = acquire_wgpu_texture_render_target(state, pool, &descriptor);
    let s1 = acquire_wgpu_texture_render_target(state, pool, &descriptor);
    let s2 = acquire_wgpu_texture_render_target(state, pool, &descriptor);

    let quality = 1.0_f32.max((effect.quality.unwrap_or(1.0) + 0.5).floor());
    let strength = effect.strength.unwrap_or(1.0);
    let source_mode = effect.source_mode.unwrap_or(EffectSourceMode::Draw);

    let native = get_wgpu_render_state_native_device(state);
    let fs = get_wgpu_effect_pass_state(state);

    {
        let t0 = s0.read().unwrap();
        let t1 = s1.read().unwrap();
        let t2 = s2.read().unwrap();
        apply_wgpu_effect_tint_pass(state, source, &t0, 0xffffffff, 1.0, 1.0_f32.min(strength));
        apply_wgpu_effect_box_blur(
            state,
            &t0,
            &t1,
            &t2,
            &WgpuEffectBoxBlurOptions {
                blur_x: Some(effect.blur_x.unwrap_or(6.0)),
                blur_y: Some(effect.blur_y.unwrap_or(6.0)),
                passes: Some(quality),
                edge_color: None,
            },
        );

        let ramp_texture = get_wgpu_effect_gradient_ramp_texture(
            state,
            &effect.colors,
            &effect.alphas,
            &effect.ratios,
        );
        let ramp_view = ramp_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let ramp_bind_group = create_wgpu_effect_texture_bind_group(
            &native,
            &fs.texture_bind_group_layout,
            &ramp_view,
            &fs.sampler,
        );
        let blurred_bind_group = create_wgpu_effect_texture_bind_group(
            &native,
            &fs.texture_bind_group_layout,
            &t1.view,
            &fs.sampler,
        );

        let pipeline = get_lookup_pipeline(state);
        let slot_offset = (fs.acquire_slot)(state);
        (fs.write_slot)(state, slot_offset, &mut |_, _| {});

        let mut pass = (fs.begin_pass)(state, Some(&t0), wgpu::LoadOp::Load);
        set_wgpu_effect_pass_pipeline(&native, &mut pass, &pipeline.read().unwrap().pipeline);
        set_wgpu_effect_pass_bind_group(&native, &mut pass, 0, &fs.uniform_bind_group, &[slot_offset]);
        set_wgpu_effect_pass_bind_group(&native, &mut pass, 1, &blurred_bind_group, &[]);
        set_wgpu_effect_pass_bind_group(&native, &mut pass, 2, &ramp_bind_group, &[]);
        draw_wgpu_effect_fullscreen_quad(&native, pass);

        clear_wgpu_effect_target(state, dest);
        apply_wgpu_effect_blit_pass(state, &t0, dest);
        if source_mode == EffectSourceMode::Knockout {
            apply_wgpu_effect_erase_pass(state, source, dest);
        } else if source_mode == EffectSourceMode::Draw {
            apply_wgpu_effect_blit_pass(state, source, dest);
        }
    }

    release_wgpu_texture_render_target(pool, s0);
    release_wgpu_texture_render_target(pool, s1);
    release_wgpu_texture_render_target(pool, s2);
}

fn get_lookup_pipeline(state: &mut WgpuRenderState) -> Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_module_pipeline(state, "gradientGlow.lookup", |state| {
        let fs = get_wgpu_effect_pass_state(state);
        let native = get_wgpu_render_state_native_device(state);
        let format = state.format;
        let shader_module = create_wgpu_effect_shader_module(
            &native,
            &format!("{EFFECT_VERTEX_WGSL}{GRADIENT_LOOKUP_FRAGMENT_WGSL}"),
        );
        let pipeline_layout = create_wgpu_effect_pipeline_layout(
            &native,
            &[
                &fs.uniform_bind_group_layout,
                &fs.texture_bind_group_layout,
                &fs.texture_bind_group_layout,
            ],
        );
        let pipeline = create_unblended_pipeline(&native, &pipeline_layout, &shader_module, format);
        let mut entity = WgpuEffectPipeline {
            runtime: EntityRuntimeSlot::default(),
            pipeline: pipeline.clone(),
            blend_mode: WgpuEffectBlendMode::Premul,
            compile_for_format: None,
            variants: None,
        };
        initialize_wgpu_effect_pipeline(&mut entity, WgpuEffectBlendMode::Premul, pipeline);
        return entity;
    });
}

/// Registers the default runner under `GradientGlowEffect` (TS
/// `registerWgpuGradientGlowEffect`).
pub fn register_wgpu_gradient_glow_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "GradientGlowEffect", wgpu_gradient_glow_effect_runner, None);
}

/// The default `GradientGlowEffect` runner (TS `wgpuGradientGlowEffectRunner`).
pub fn wgpu_gradient_glow_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<GradientGlowEffect>(effect, "wgpuGradientGlowEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_gradient_glow_effect_to_wgpu(ctx.state, &source, &dest, ctx.pool, effect);
}
