// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the pass takes host-supplied wgpu targets and the LUT upload memo
//! The generic pointwise color-LUT pass (TS `wgpuColorLutPass.ts`): the single fold-in
//! realization for the whole LUT-tier adjustment family on WebGPU. A run of consecutive pointwise
//! adjustments containing any nonlinear member bakes to ONE 3D `ColorLut` (matrices folded in) and
//! runs through this one trilinear pass. The LUT uploads as a `size³` rgba8unorm 3D texture (group
//! 2); the shared linear sampler interpolates. Sampled color is treated as premultiplied and passed
//! straight into the LUT; alpha is preserved. `cache` owns the uploaded 3D texture across frames
//! and re-uploads only when the LUT changes, so a static grade uploads once; the caller destroys
//! `cache.texture` on teardown.

use flight_adjustments::ColorLut;
use flight_render_wgpu::{
    WgpuRenderState, WgpuTextureRenderTarget, get_wgpu_render_state_native_device,
    write_wgpu_texture,
};

use crate::types::*;
use crate::wgpu_bitmap_displacement_effect::initialize_wgpu_effect_pipeline;
use crate::wgpu_effect_pass::{EFFECT_VERTEX_WGSL, get_wgpu_effect_pass_state};
use crate::wgpu_effect_runtime::{
    create_wgpu_effect_pipeline_layout, create_wgpu_effect_render_pipeline,
    create_wgpu_effect_shader_module, create_wgpu_effect_texture_bind_group,
    draw_wgpu_effect_fullscreen_quad, get_wgpu_effect_blend_state, get_wgpu_effect_format_pipeline,
    get_wgpu_effect_runtime, set_wgpu_effect_pass_bind_group, set_wgpu_effect_pass_pipeline,
};

// Half-texel scale/offset maps the [0,1] color to LUT cell centres, so v=0 hits cell 0 and v=1 the last.
const COLOR_LUT_FRAGMENT_WGSL: &str = r#"
struct Uniforms { u_size : f32, _p0 : f32, _p1 : f32, _p2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var lut : texture_3d<f32>;
@group(2) @binding(1) var lutSmp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let scale = (uni.u_size - 1.0) / uni.u_size;
  let offset = 0.5 / uni.u_size;
  let lc = clamp(c.rgb, vec3f(0.0), vec3f(1.0)) * scale + offset;
  let graded = textureSampleLevel(lut, lutSmp, lc, 0.0).rgb;
  return vec4f(graded, c.a);
}"#;

/// Runs one baked color LUT from `source` into `dest` (TS `applyColorLutPassToWgpu`).
pub fn apply_color_lut_pass_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    lut: &ColorLut,
    cache: &mut WgpuColorLutTextureCache,
) {
    let native = get_wgpu_render_state_native_device(state);
    let fs = get_wgpu_effect_pass_state(state);
    let texture = upload_lut_texture(state, lut, cache);

    let source_bind_group = create_wgpu_effect_texture_bind_group(
        &native,
        &fs.texture_bind_group_layout,
        &source.view,
        &fs.sampler,
    );
    let lut_view = texture.create_view(&wgpu::TextureViewDescriptor {
        dimension: Some(wgpu::TextureViewDimension::D3),
        ..wgpu::TextureViewDescriptor::default()
    });
    let lut_layout = get_lut_bind_group_layout(state);
    let lut_bind_group =
        create_wgpu_effect_texture_bind_group(&native, &lut_layout, &lut_view, &fs.sampler);

    let pipeline = get_lut_pipeline(state, dest.format);
    let slot_offset = (fs.acquire_slot)(state);
    let size = lut.size as f32;
    (fs.write_slot)(state, slot_offset, &mut |f32, _| {
        f32[0] = size;
    });

    let mut pass = (fs.begin_pass)(state, Some(dest), wgpu::LoadOp::Load);
    set_wgpu_effect_pass_pipeline(&native, &mut pass, &pipeline.read().unwrap().pipeline);
    set_wgpu_effect_pass_bind_group(
        &native,
        &mut pass,
        0,
        &fs.uniform_bind_group,
        &[slot_offset],
    );
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 1, &source_bind_group, &[]);
    set_wgpu_effect_pass_bind_group(&native, &mut pass, 2, &lut_bind_group, &[]);
    draw_wgpu_effect_fullscreen_quad(&native, pass);
}

fn clamp01(value: f32) -> f32 {
    return value.clamp(0.0, 1.0);
}

fn get_lut_bind_group_layout(state: &mut WgpuRenderState) -> wgpu::BindGroupLayout {
    if let Some(layout) = &get_wgpu_effect_runtime(state).lut_bind_group_layout {
        return layout.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
    let layout = native
        .device
        .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D3,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
    get_wgpu_effect_runtime(state).lut_bind_group_layout = Some(layout.clone());
    return layout;
}

// A render pipeline's color target format must match the attachment it draws into, so an HDR
// (rgba16float) effect target needs its own variant; pipelines are cached per (state, dest format).
fn get_lut_pipeline(
    state: &mut WgpuRenderState,
    format: wgpu::TextureFormat,
) -> flight_entity::Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_format_pipeline(state, "colorLut", format, |state| {
        let fs = get_wgpu_effect_pass_state(state);
        let lut_layout = get_lut_bind_group_layout(state);
        let native = get_wgpu_render_state_native_device(state);
        let shader_module = create_wgpu_effect_shader_module(
            &native,
            &format!("{EFFECT_VERTEX_WGSL}{COLOR_LUT_FRAGMENT_WGSL}"),
        );
        let pipeline_layout = create_wgpu_effect_pipeline_layout(
            &native,
            &[
                &fs.uniform_bind_group_layout,
                &fs.texture_bind_group_layout,
                &lut_layout,
            ],
        );
        let gpu_pipeline = create_wgpu_effect_render_pipeline(
            &native,
            &pipeline_layout,
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

// Whether the LUT already in the texture is this one. The source compares by identity, relying on
// the bake cache returning a stable reference for an unchanged run; the Rust bake returns a value,
// so the memo compares the baked content instead (same size, same samples).
fn is_same_lut(cached: Option<&ColorLut>, lut: &ColorLut) -> bool {
    return cached.is_some_and(|cached| cached.size == lut.size && cached.samples == lut.samples);
}

fn js_round(value: f32) -> f32 {
    return (value + 0.5).floor();
}

// A short sample array reads as JS `undefined`, which clamps through NaN comparisons to NaN and
// stores as 0.
fn sample_at(samples: &[f32], index: usize) -> f32 {
    return samples.get(index).copied().unwrap_or(f32::NAN);
}

// Uploads `lut` into the cache's reusable rgba8unorm 3D texture and returns it. The texture is
// recreated when the LUT size changes; the write is skipped when the LUT is already in it.
fn upload_lut_texture(
    state: &mut WgpuRenderState,
    lut: &ColorLut,
    cache: &mut WgpuColorLutTextureCache,
) -> wgpu::Texture {
    let native = get_wgpu_render_state_native_device(state);
    let n = lut.size;
    if let Some(texture) = &cache.texture
        && is_same_lut(cache.lut.as_ref(), lut)
    {
        return texture.clone();
    }
    if cache.texture.is_none() || cache.size != n {
        if let Some(texture) = &cache.texture {
            texture.destroy();
        }
        cache.texture = Some(native.device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width: n,
                height: n,
                depth_or_array_layers: n,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D3,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        }));
        cache.size = n;
    }
    let texture = cache.texture.clone().expect("the LUT texture exists");
    let samples = &lut.samples;
    let cells = (n * n * n) as usize;
    let mut data = vec![0_u8; cells * 4];
    let mut j = 0;
    let mut o = 0;
    for _ in 0..cells {
        data[o] = js_round(clamp01(sample_at(samples, j)) * 255.0) as u8;
        data[o + 1] = js_round(clamp01(sample_at(samples, j + 1)) * 255.0) as u8;
        data[o + 2] = js_round(clamp01(sample_at(samples, j + 2)) * 255.0) as u8;
        data[o + 3] = 255;
        j += 3;
        o += 4;
    }
    write_wgpu_texture(
        &native,
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &data,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(n * 4),
            rows_per_image: Some(n),
        },
        wgpu::Extent3d {
            width: n,
            height: n,
            depth_or_array_layers: n,
        },
    );
    cache.lut = Some(lut.clone());
    return texture;
}
