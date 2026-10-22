// flight-lint: allow-file(contract-vocabulary) D17: the wireframe family seams take and return native wgpu values
//! The Wgpu wireframe prelude (TS `wgpuWireframePrelude.ts`): a minimal module reusing the shared
//! `vs_main` and outputting one flat linear line color; the pipeline is line-list and cull-none.

use flight_color::LinearColor;
use flight_render_wgpu::{
    WgpuRenderState, WgpuSkinningAdapter, create_wgpu_bind_group, create_wgpu_bind_group_layout,
    create_wgpu_buffer, create_wgpu_shader_module, get_wgpu_render_state_native_device,
    get_wgpu_texture_format_name, write_wgpu_buffer,
};

use crate::types::*;
use crate::wgpu_material_layout_entries::uniform_layout_entry;
use crate::wgpu_mesh_fragment_tail::WGPU_MESH_FRAGMENT_TAIL;
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_scene3d_pipeline, get_wgpu_mesh_prelude_wgsl,
    stash_wgpu_uv_transform,
};
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_skinning_adapter};

// Wireframe material uniform: color vec4f + params vec4f (x = alphaCutoff) = 32 bytes.
const WIREFRAME_UNIFORM_BYTES: u64 = 32;

/// Ensures (and caches per material key) the wireframe color bind group (one uniform) and rewrites it
/// with the linear line color and alpha cutoff (TS `bindWgpuWireframeColor`). Stashes the identity uv
/// transform: lines are untextured.
pub fn bind_wgpu_wireframe_color(
    state: &mut WgpuRenderState,
    pipeline: &WgpuWireframePipeline,
    material_key: u64,
    color: &LinearColor,
    alpha_cutoff: Option<f32>,
) -> wgpu::BindGroup {
    let alpha_cutoff = alpha_cutoff.unwrap_or(0.5);
    let native = get_wgpu_render_state_native_device(state);
    let cached = get_wgpu_scene3d_runtime(state)
        .material_bind_groups
        .get(&material_key)
        .cloned();
    let binding = match cached {
        Some(binding) => binding,
        None => {
            let buffer = create_wgpu_buffer(
                &native,
                WIREFRAME_UNIFORM_BYTES,
                wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            );
            let bind_group = create_wgpu_bind_group(
                &native,
                &pipeline.material_bind_group_layout,
                &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: buffer.as_entire_binding(),
                }],
            );
            let binding = WgpuMaterialBinding {
                bind_group,
                buffer,
                samplers: None,
                sampler: None,
                views: None,
            };
            get_wgpu_scene3d_runtime(state)
                .material_bind_groups
                .insert(material_key, binding.clone());
            binding
        }
    };

    let values = [
        color.r,
        color.g,
        color.b,
        color.a,
        alpha_cutoff,
        0.0,
        0.0,
        0.0,
    ];
    write_wgpu_buffer(&native, &binding.buffer, 0, bytemuck::cast_slice(&values));
    stash_wgpu_uv_transform(state, None);
    return binding.bind_group;
}

/// Compiles the wireframe module and builds its line-list, cull-none pipeline for `format` with a
/// group(2) layout carrying just the color uniform, uncached (TS `compileWgpuWireframePipeline`).
pub fn compile_wgpu_wireframe_pipeline(
    state: &mut WgpuRenderState,
    format: wgpu::TextureFormat,
    blended: Option<bool>,
    alpha_mask_enabled: Option<bool>,
    skinned: Option<bool>,
) -> WgpuWireframePipeline {
    let skinned = skinned.unwrap_or(false);
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let module = create_wgpu_shader_module(
        &native,
        &get_wgpu_wireframe_module_source(alpha_mask_enabled, Some(skinned), skinning),
    );
    let material_bind_group_layout =
        create_wgpu_bind_group_layout(&native, &[uniform_layout_entry(0)]);
    return create_wgpu_mesh_pipeline(
        state,
        &WgpuMeshPipelineOptions {
            blended: Some(blended.unwrap_or(false)),
            double_sided: true,
            extra_bind_group_layout: None,
            format,
            ibl_bind_group_layout: None,
            material_bind_group_layout,
            module,
            pbr_sample_bind_group_layout: None,
            shadow_bind_group_layout: None,
            skinned: Some(skinned),
            topology: Some(wgpu::PrimitiveTopology::LineList),
        },
    );
}

/// Resolves the wireframe pipeline for a color format through the shared scene pipeline cache under
/// the `wireframe:` namespace (TS `ensureWgpuWireframePipeline`).
pub fn ensure_wgpu_wireframe_pipeline(
    state: &mut WgpuRenderState,
    format: wgpu::TextureFormat,
    alpha_mask_enabled: Option<bool>,
) -> WgpuWireframePipeline {
    let alpha_mask_enabled = alpha_mask_enabled.unwrap_or(false);
    let cache_key = format!(
        "wireframe:{}|{}",
        get_wgpu_texture_format_name(format),
        if alpha_mask_enabled { "mask" } else { "base" }
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, &mut |state, blended, skinned| {
        return compile_wgpu_wireframe_pipeline(
            state,
            format,
            Some(blended),
            Some(alpha_mask_enabled),
            Some(skinned),
        );
    });
}

/// The full WGSL module: the alpha-mask flag, the shared mesh prelude and the wireframe color uniform
/// with `fs_main` (TS `getWgpuWireframeModuleSource`).
pub fn get_wgpu_wireframe_module_source(
    alpha_mask_enabled: Option<bool>,
    skinned: Option<bool>,
    skinning: Option<&WgpuSkinningAdapter>,
) -> String {
    return format!(
        "const ALPHA_MASK : bool = {};\n{}{}{}",
        alpha_mask_enabled.unwrap_or(false),
        get_wgpu_mesh_prelude_wgsl(skinned.unwrap_or(false), skinning),
        WGPU_MESH_FRAGMENT_TAIL,
        WIREFRAME_WGSL_BODY
    );
}

const WIREFRAME_WGSL_BODY: &str = r#"
struct WireframeMaterial {
  color : vec4f,  // linear rgba
  params : vec4f, // x = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : WireframeMaterial;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  if (ALPHA_MASK && material.color.a < material.params.x) {
    discard;
  }
  return flightPremultipliedOutput(vec4f(material.color.rgb, flightMeshCoverage(material.color.a, in.objectAlpha, draw.params.y)));
}
"#;
