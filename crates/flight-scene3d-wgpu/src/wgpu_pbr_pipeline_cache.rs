// flight-lint: allow-file(contract-vocabulary) D17: the PBR pipeline builders take native wgpu formats and render-wgpu's color-adjustment seam
//! The PBR pipeline compile and per-state cache (TS `wgpuPbrPipelineCache.ts`).

use flight_render_wgpu::{
    WgpuColorAdjustmentMaterialFeature, WgpuRenderState, create_wgpu_bind_group_layout,
    create_wgpu_shader_module, get_wgpu_color_adjustment_material_feature,
    get_wgpu_render_state_native_device, get_wgpu_texture_format_name,
};

use crate::types::*;
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_pbr_sample_layout, ensure_wgpu_scene3d_pipeline,
};
use crate::wgpu_pbr_prelude::{build_wgpu_pbr_define_key, get_wgpu_pbr_module_source_for_key};
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_skinning_adapter};

/// Compiles the PBR uber-shader module for a define key and builds its render pipeline for the
/// color-attachment format (TS `compileWgpuPbrPipeline`). The group(2) material layout is the
/// MaterialBlock uniform, six filtering samplers and six maps (base-color, metallic-roughness,
/// normal, occlusion, emissive, alpha); group(3) is the combined shadow + IBL sample layout.
pub fn compile_wgpu_pbr_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuPbrDefineKey,
    format: wgpu::TextureFormat,
    blended: Option<bool>,
    skinned: Option<bool>,
    color_adjustment_feature: Option<&WgpuColorAdjustmentMaterialFeature>,
) -> WgpuPbrPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let module = create_wgpu_shader_module(
        &native,
        &get_wgpu_pbr_module_source_for_key(key, skinned, skinning, color_adjustment_feature),
    );
    let mut entries = vec![wgpu::BindGroupLayoutEntry {
        binding: 0,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }];
    for binding in 1..=6 {
        entries.push(wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
            count: None,
        });
    }
    for binding in 7..=12 {
        entries.push(wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        });
    }
    let material_bind_group_layout = create_wgpu_bind_group_layout(&native, &entries);
    // Shadow and image-based lighting share one group(3) layout so the pipeline fits WebGPU's
    // required maxBindGroups minimum of 4.
    let pbr_sample_bind_group_layout = ensure_wgpu_pbr_sample_layout(state);
    return create_wgpu_mesh_pipeline(
        state,
        &WgpuMeshPipelineOptions {
            blended: Some(blended.unwrap_or(false)),
            double_sided: key.double_sided,
            extra_bind_group_layout: None,
            format,
            ibl_bind_group_layout: None,
            material_bind_group_layout,
            module,
            pbr_sample_bind_group_layout: Some(pbr_sample_bind_group_layout),
            shadow_bind_group_layout: None,
            skinned: Some(skinned.unwrap_or(false)),
            topology: None,
        },
    );
}

/// Resolves the PBR pipeline for a define key and color-attachment format, compiling it on first use
/// through the shared scene pipeline cache under the `pbr:` namespace (TS `ensureWgpuPbrPipeline`).
/// The active run's color-adjustment promotion joins the key.
pub fn ensure_wgpu_pbr_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuPbrDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuPbrPipeline {
    let runtime = get_wgpu_scene3d_runtime(state);
    let full_key = WgpuPbrDefineKey {
        has_color_adjustment: Some(runtime.active_color_adjustment_run),
        has_color_matrix: Some(runtime.active_color_matrix_run),
        ..*key
    };
    let cache_key = format!(
        "pbr:{}|{}",
        get_wgpu_texture_format_name(format),
        build_wgpu_pbr_define_key(&full_key)
    );
    return ensure_wgpu_scene3d_pipeline(
        state,
        &cache_key,
        &mut |state: &mut WgpuRenderState, blended: bool, skinned: bool| {
            let feature = get_wgpu_color_adjustment_material_feature(state);
            return compile_wgpu_pbr_pipeline(
                state,
                &full_key,
                format,
                Some(blended),
                Some(skinned),
                feature,
            );
        },
    );
}
