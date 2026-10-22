// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets and pipelines
//! Bitmap displacement (TS `wgpuBitmapDisplacementEffect.ts`): a map texture's channels offset the
//! source lookup. A map that cannot resolve copies the input through unchanged.

use flight_bitmap::ImageChannel;
use flight_effects::{BitmapDisplacementEffect, BitmapDisplacementEffectEdgeMode, Effect};
use flight_render_wgpu::{
    WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget, get_wgpu_render_state_native_device,
    get_wgpu_sampler, resolve_wgpu_texture,
};
use flight_texture::{RenderTargetColorSpace, Sampler, TextureColorSpace, TextureFilter, TextureUvTransform};

use crate::types::*;
use crate::wgpu_effect_pass::{EFFECT_VERTEX_WGSL, draw_wgpu_effect_pass, get_wgpu_effect_pass_state};
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runtime::{
    create_wgpu_effect_pipeline_layout, create_wgpu_effect_render_pipeline,
    create_wgpu_effect_shader_module, create_wgpu_effect_texture_bind_group,
    draw_wgpu_effect_fullscreen_quad, get_wgpu_effect_blend_state, get_wgpu_effect_format_pipeline,
    set_wgpu_effect_pass_bind_group, set_wgpu_effect_pass_pipeline,
};

pub const BITMAP_DISPLACEMENT_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  scale : vec2f,
  resolution : vec2f,
  componentX : i32,
  componentY : i32,
  edgeMode : i32,
  _pad0 : i32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var sourceTexture : texture_2d<f32>;
@group(1) @binding(1) var sourceSampler : sampler;
@group(2) @binding(0) var mapTexture : texture_2d<f32>;
@group(2) @binding(1) var mapSampler : sampler;

fn sampleChannel(value : vec4f, component : i32) -> f32 {
  if (component == 0) { return value.r; }
  if (component == 1) { return value.g; }
  if (component == 2) { return value.b; }
  return value.a;
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let mapSample = textureSampleLevel(mapTexture, mapSampler, uv, 0.0);
  let mapped = vec2f(
    sampleChannel(mapSample, uni.componentX),
    sampleChannel(mapSample, uni.componentY),
  );
  let displacementPixels = (mapped - vec2f(0.5)) * uni.scale;
  let displacement = displacementPixels / uni.resolution;
  let displaced = vec2f(uv.x + displacement.x, uv.y + displacement.y);
  let sourceUv = select(
    clamp(displaced, vec2f(0.0), vec2f(1.0)),
    fract(displaced),
    uni.edgeMode == 1,
  );
  return textureSampleLevel(sourceTexture, sourceSampler, sourceUv, 0.0);
}"#;

const BITMAP_DISPLACEMENT_PASSTHROUGH_FRAGMENT_WGSL: &str = r#"
struct Uniforms { _pad0 : f32, _pad1 : f32, _pad2 : f32, _pad3 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var sourceTexture : texture_2d<f32>;
@group(1) @binding(1) var sourceSampler : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(sourceTexture, sourceSampler, uv, 0.0);
}"#;

/// Sets an effect pipeline's blend mode and render pipeline (TS `initializeWgpuEffectPipeline`):
/// the construction seam for a pipeline built around an existing `wgpu::RenderPipeline`.
pub fn initialize_wgpu_effect_pipeline(
    out: &mut WgpuEffectPipeline,
    blend_mode: WgpuEffectBlendMode,
    pipeline: wgpu::RenderPipeline,
) {
    out.blend_mode = blend_mode;
    out.pipeline = pipeline;
}

/// Displaces `source` by the effect's map into `dest` (TS `applyBitmapDisplacementEffectToWgpu`).
/// An absent or unresolved map copies the input through unchanged.
pub fn apply_bitmap_displacement_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &BitmapDisplacementEffect,
) {
    let map = effect.map.clone();
    let map_entry = map.as_ref().and_then(|map| {
        return resolve_wgpu_texture(state, &*map.read().unwrap(), Some(false), Some(source.color_space));
    });
    let (Some(map), Some(map_entry)) = (map, map_entry) else {
        let pipeline = get_wgpu_effect_pipeline(
            state,
            "spatial.bitmapDisplacement.passthrough",
            BITMAP_DISPLACEMENT_PASSTHROUGH_FRAGMENT_WGSL,
            Some(WgpuEffectBlendMode::Replace),
        );
        draw_wgpu_effect_pass(
            state,
            source,
            Some(dest),
            &mut pipeline.write().unwrap(),
            &mut |_, _| {},
        );
        return;
    };

    let native = get_wgpu_render_state_native_device(state);
    let fs = get_wgpu_effect_pass_state(state);
    let source_bind_group = create_wgpu_effect_texture_bind_group(
        &native,
        &fs.texture_bind_group_layout,
        &source.view,
        &fs.sampler,
    );
    let (map_view, map_sampler) = {
        let entry = map_entry.read().unwrap();
        (entry.view.clone(), entry.sampler.clone())
    };
    let map_sampler = match map_sampler {
        Some(sampler) => sampler,
        None => {
            let sampler = map.read().unwrap().texture_fields().sampler.clone();
            get_bitmap_displacement_map_sampler(state, &sampler)
        }
    };
    let map_bind_group = create_wgpu_effect_texture_bind_group(
        &native,
        &fs.texture_bind_group_layout,
        &map_view,
        &map_sampler,
    );

    let scale_x = effect.scale_x.unwrap_or(0.0);
    let scale_y = effect.scale_y.unwrap_or(0.0);
    let width = source.width as f32;
    let height = source.height as f32;
    let component_x = effect.component_x.unwrap_or(ImageChannel::Red) as i32;
    let component_y = effect.component_y.unwrap_or(ImageChannel::Green) as i32;
    let edge_mode = if effect.edge_mode == Some(BitmapDisplacementEffectEdgeMode::Clamp) {
        0
    } else {
        1
    };
    let slot_offset = (fs.acquire_slot)(state);
    (fs.write_slot)(state, slot_offset, &mut |f32, i32| {
        f32[0] = scale_x;
        f32[1] = scale_y;
        f32[2] = width;
        f32[3] = height;
        i32[4] = component_x;
        i32[5] = component_y;
        i32[6] = edge_mode;
    });

    let pipeline = get_bitmap_displacement_pipeline(state, dest.format);
    let mut pass = (fs.begin_pass)(state, Some(dest), wgpu::LoadOp::Load);
    set_wgpu_effect_pass_pipeline(&native, &mut pass, &pipeline.read().unwrap().pipeline);
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 0, &fs.uniform_bind_group, &[slot_offset]);
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 1, &source_bind_group, &[]);
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 2, &map_bind_group, &[]);
    draw_wgpu_effect_fullscreen_quad(&native, pass);
}

fn get_bitmap_displacement_map_sampler(state: &WgpuRenderState, sampler: &Sampler) -> wgpu::Sampler {
    let mipmap_filter = get_mipmap_filter(sampler.min_filter, sampler.mipmaps);
    return get_wgpu_sampler(
        state,
        get_filter(sampler.min_filter),
        get_filter(sampler.mag_filter),
        sampler.wrap_u,
        sampler.wrap_v,
        mipmap_filter,
        Some(sampler.anisotropy),
    );
}

fn get_bitmap_displacement_pipeline(
    state: &mut WgpuRenderState,
    format: wgpu::TextureFormat,
) -> flight_entity::Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_format_pipeline(state, "bitmapDisplacement", format, |state| {
        let fs = get_wgpu_effect_pass_state(state);
        let native = get_wgpu_render_state_native_device(state);
        let shader_module = create_wgpu_effect_shader_module(
            &native,
            &format!("{EFFECT_VERTEX_WGSL}{BITMAP_DISPLACEMENT_FRAGMENT_WGSL}"),
        );
        let layout = create_wgpu_effect_pipeline_layout(
            &native,
            &[
                &fs.uniform_bind_group_layout,
                &fs.texture_bind_group_layout,
                &fs.texture_bind_group_layout,
            ],
        );
        let gpu_pipeline = create_wgpu_effect_render_pipeline(
            &native,
            &layout,
            &shader_module,
            format,
            get_wgpu_effect_blend_state(WgpuEffectBlendMode::Replace),
        );
        let mut entity = WgpuEffectPipeline {
            runtime: flight_entity::EntityRuntimeSlot::default(),
            pipeline: gpu_pipeline.clone(),
            blend_mode: WgpuEffectBlendMode::Replace,
            compile_for_format: None,
            variants: None,
        };
        initialize_wgpu_effect_pipeline(&mut entity, WgpuEffectBlendMode::Replace, gpu_pipeline);
        return entity;
    });
}

fn get_filter(filter: TextureFilter) -> wgpu::FilterMode {
    return match filter {
        TextureFilter::Nearest
        | TextureFilter::NearestMipmapLinear
        | TextureFilter::NearestMipmapNearest => wgpu::FilterMode::Nearest,
        _ => wgpu::FilterMode::Linear,
    };
}

fn get_mipmap_filter(filter: TextureFilter, mipmaps: bool) -> Option<wgpu::MipmapFilterMode> {
    return match (mipmaps, filter) {
        (false, _) | (_, TextureFilter::Linear) | (_, TextureFilter::Nearest) => None,
        (_, TextureFilter::LinearMipmapNearest) | (_, TextureFilter::NearestMipmapNearest) => {
            Some(wgpu::MipmapFilterMode::Nearest)
        }
        _ => Some(wgpu::MipmapFilterMode::Linear),
    };
}

/// Whether the effect's map resolves to a sampleable texture on this state (TS
/// `isWgpuBitmapDisplacementEffectResolvable`).
pub fn is_wgpu_bitmap_displacement_effect_resolvable(
    state: &mut WgpuRenderState,
    effect: &dyn Effect,
) -> bool {
    let Some(effect) = effect.as_any().downcast_ref::<BitmapDisplacementEffect>() else {
        return false;
    };
    let Some(map) = &effect.map else {
        return false;
    };
    let map = map.read().unwrap();
    let color_space = if map.texture_fields().color_space == TextureColorSpace::Linear {
        RenderTargetColorSpace::Linear
    } else {
        RenderTargetColorSpace::Srgb
    };
    return resolve_wgpu_texture(state, &*map, Some(false), Some(color_space)).is_some();
}

/// Registers the default runner and its map resolver under `BitmapDisplacementEffect` (TS
/// `registerWgpuBitmapDisplacementEffect`).
pub fn register_wgpu_bitmap_displacement_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "BitmapDisplacementEffect",
        wgpu_bitmap_displacement_effect_runner,
        Some(is_wgpu_bitmap_displacement_effect_resolvable),
    );
}

/// The default `BitmapDisplacementEffect` runner (TS `wgpuBitmapDisplacementEffectRunner`).
pub fn wgpu_bitmap_displacement_effect_runner(
    ctx: &mut WgpuEffectContext<'_>,
    effect: &dyn Effect,
) {
    let effect = crate::wgpu_effect_runner_support::downcast_wgpu_effect::<BitmapDisplacementEffect>(
        effect,
        "wgpuBitmapDisplacementEffectRunner",
    );
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_bitmap_displacement_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
