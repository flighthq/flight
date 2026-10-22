// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets and pools
//! Gradient bevel (TS `wgpuGradientBevelEffect.ts`): a bevel whose highlight→shadow band color is
//! looked up from a colors/alphas/ratios gradient ramp indexed by the encoded bevel depth, then
//! sourceMode decides source compositing. Acquires three scratch targets from the effect pool, runs
//! neutral tint → box blur → bevel encode → gradient lookup + clip → composite, then releases them.

use flight_effects::{Effect, EffectSourceMode, GradientBevelEffect};
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

// Samples the blurred alpha at +offset and -offset to compute a bevel value in [-1, 1], mapped to
// [0, 1] for gradient lookup. Outputs the encoded value in the red channel; alpha=1 (clipped later).
//
// Uniforms layout (16 bytes):
//   offset 0: offset (vec2f)
//   offset 8: _pad (vec2f)
const BEVEL_ENCODE_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  offset : vec2f,
  _pad : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let high = textureSampleLevel(tex, smp, uv - uni.offset, 0.0).a;
  let low  = textureSampleLevel(tex, smp, uv + uni.offset, 0.0).a;
  let bevelVal = clamp((high - low) * 0.5 + 0.5, 0.0, 1.0);
  return vec4f(bevelVal, 0.0, 0.0, 1.0);
}"#;

// Looks up the encoded bevel value (in .r) in the gradient ramp (group 2) and clips the result to
// the source alpha (group 3).
const BEVEL_APPLY_FRAGMENT_WGSL: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texEncoded : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texRamp : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;
@group(3) @binding(0) var texSource : texture_2d<f32>;
@group(3) @binding(1) var smp3 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let bevelVal = textureSampleLevel(texEncoded, smp, uv, 0.0).r;
  let color = textureSampleLevel(texRamp, smp2, vec2f(bevelVal, 0.5), 0.0);
  let srcAlpha = textureSampleLevel(texSource, smp3, uv, 0.0).a;
  return color * srcAlpha;
}"#;

// The source's encode and apply pipelines name no blend on their color target (writes replace),
// whatever mode the entity records.
fn create_unblended_pipeline(
    state: &mut WgpuRenderState,
    fragment_wgsl: &str,
    texture_groups: usize,
    blend_mode: WgpuEffectBlendMode,
) -> WgpuEffectPipeline {
    let fs = get_wgpu_effect_pass_state(state);
    let native = get_wgpu_render_state_native_device(state);
    let format = state.format;
    let module =
        create_wgpu_effect_shader_module(&native, &format!("{EFFECT_VERTEX_WGSL}{fragment_wgsl}"));
    let mut layouts = vec![&fs.uniform_bind_group_layout];
    for _ in 0..texture_groups {
        layouts.push(&fs.texture_bind_group_layout);
    }
    let layout = create_wgpu_effect_pipeline_layout(&native, &layouts);
    let targets = [Some(wgpu::ColorTargetState {
        format,
        blend: None,
        write_mask: wgpu::ColorWrites::ALL,
    })];
    let pipeline = native
        .device
        .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
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
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::CreateRenderPipeline(WgpuRenderPipelineRecord {
            depth_stencil: None,
            pipeline: pipeline.clone(),
            targets: targets.to_vec(),
        });
    });
    let mut entity = WgpuEffectPipeline {
        runtime: EntityRuntimeSlot::default(),
        pipeline: pipeline.clone(),
        blend_mode,
        compile_for_format: None,
        variants: None,
    };
    initialize_wgpu_effect_pipeline(&mut entity, blend_mode, pipeline);
    return entity;
}

/// Applies a `GradientBevelEffect` from `source` into `dest`, borrowing three scratch targets from
/// `pool` (TS `applyGradientBevelEffectToWgpu`).
pub fn apply_gradient_bevel_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    pool: &mut WgpuRenderTargetPool,
    effect: &GradientBevelEffect,
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

    let angle = effect.angle.unwrap_or(45.0) * std::f32::consts::PI / 180.0;
    let distance = effect.distance.unwrap_or(4.0);
    let quality = 1.0_f32.max((effect.quality.unwrap_or(1.0) + 0.5).floor());
    let strength = effect.strength.unwrap_or(1.0);
    let source_mode = effect.source_mode.unwrap_or(EffectSourceMode::Draw);

    let native = get_wgpu_render_state_native_device(state);
    let fs = get_wgpu_effect_pass_state(state);

    {
        let t0 = s0.read().unwrap();
        let t1 = s1.read().unwrap();
        let t2 = s2.read().unwrap();

        // Build blur basis → s1
        apply_wgpu_effect_tint_pass(state, source, &t0, 0xffffffff, 1.0, 1.0_f32.min(strength));
        apply_wgpu_effect_box_blur(
            state,
            &t0,
            &t1,
            &t2,
            &WgpuEffectBoxBlurOptions {
                blur_x: Some(effect.blur_x.unwrap_or(4.0)),
                blur_y: Some(effect.blur_y.unwrap_or(4.0)),
                passes: Some(quality),
                edge_color: None,
            },
        );

        // Encode bevel value from blurred alpha offset samples → s0
        let dx = angle.cos() * distance / t1.width as f32;
        let dy = angle.sin() * distance / t1.height as f32;

        let encode_pipeline = get_encode_pipeline(state);
        let encode_slot = (fs.acquire_slot)(state);
        (fs.write_slot)(state, encode_slot, &mut |f32, _| {
            f32[0] = dx;
            f32[1] = dy;
        });

        let blurred_bind_group = create_wgpu_effect_texture_bind_group(
            &native,
            &fs.texture_bind_group_layout,
            &t1.view,
            &fs.sampler,
        );

        let mut encode_pass = (fs.begin_pass)(state, Some(&t0), wgpu::LoadOp::Load);
        set_wgpu_effect_pass_pipeline(
            &native,
            &mut encode_pass,
            &encode_pipeline.read().unwrap().pipeline,
        );
        set_wgpu_effect_pass_bind_group(
            &native,
            &mut encode_pass,
            0,
            &fs.uniform_bind_group,
            &[encode_slot],
        );
        set_wgpu_effect_pass_bind_group(&native, &mut encode_pass, 1, &blurred_bind_group, &[]);
        draw_wgpu_effect_fullscreen_quad(&native, encode_pass);

        // Apply: look up gradient ramp from encoded bevel, clip to source alpha → s1
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
        let encoded_bind_group = create_wgpu_effect_texture_bind_group(
            &native,
            &fs.texture_bind_group_layout,
            &t0.view,
            &fs.sampler,
        );
        let source_bind_group = create_wgpu_effect_texture_bind_group(
            &native,
            &fs.texture_bind_group_layout,
            &source.view,
            &fs.sampler,
        );

        let apply_pipeline = get_apply_pipeline(state);
        let apply_slot = (fs.acquire_slot)(state);
        (fs.write_slot)(state, apply_slot, &mut |_, _| {});

        let mut apply_pass = (fs.begin_pass)(state, Some(&t1), wgpu::LoadOp::Load);
        set_wgpu_effect_pass_pipeline(
            &native,
            &mut apply_pass,
            &apply_pipeline.read().unwrap().pipeline,
        );
        set_wgpu_effect_pass_bind_group(
            &native,
            &mut apply_pass,
            0,
            &fs.uniform_bind_group,
            &[apply_slot],
        );
        set_wgpu_effect_pass_bind_group(&native, &mut apply_pass, 1, &encoded_bind_group, &[]);
        set_wgpu_effect_pass_bind_group(&native, &mut apply_pass, 2, &ramp_bind_group, &[]);
        set_wgpu_effect_pass_bind_group(&native, &mut apply_pass, 3, &source_bind_group, &[]);
        draw_wgpu_effect_fullscreen_quad(&native, apply_pass);

        clear_wgpu_effect_target(state, dest);
        if source_mode == EffectSourceMode::Draw {
            apply_wgpu_effect_blit_pass(state, source, dest);
        }
        apply_wgpu_effect_blit_pass(state, &t1, dest);
        if source_mode == EffectSourceMode::Knockout {
            apply_wgpu_effect_erase_pass(state, source, dest);
        }
    }

    release_wgpu_texture_render_target(pool, s0);
    release_wgpu_texture_render_target(pool, s1);
    release_wgpu_texture_render_target(pool, s2);
}

fn get_apply_pipeline(state: &mut WgpuRenderState) -> Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_module_pipeline(state, "gradientBevel.apply", |state| {
        return create_unblended_pipeline(
            state,
            BEVEL_APPLY_FRAGMENT_WGSL,
            3,
            WgpuEffectBlendMode::Premul,
        );
    });
}

fn get_encode_pipeline(state: &mut WgpuRenderState) -> Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_module_pipeline(state, "gradientBevel.encode", |state| {
        return create_unblended_pipeline(
            state,
            BEVEL_ENCODE_FRAGMENT_WGSL,
            1,
            WgpuEffectBlendMode::Replace,
        );
    });
}

/// Registers the default runner under `GradientBevelEffect` (TS
/// `registerWgpuGradientBevelEffect`).
pub fn register_wgpu_gradient_bevel_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "GradientBevelEffect",
        wgpu_gradient_bevel_effect_runner,
        None,
    );
}

/// The default `GradientBevelEffect` runner (TS `wgpuGradientBevelEffectRunner`).
pub fn wgpu_gradient_bevel_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect =
        downcast_wgpu_effect::<GradientBevelEffect>(effect, "wgpuGradientBevelEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_gradient_bevel_effect_to_wgpu(ctx.state, &source, &dest, ctx.pool, effect);
}
