// flight-lint: allow-file(contract-vocabulary) D17: the unlit family seams take and return native wgpu values
//! The shared Wgpu unlit prelude (TS `wgpuUnlitPrelude.ts`): the unlit material bind group and
//! uniform, the define key, the pipeline compiler and cache, and the WGSL module. Shared by the Unlit,
//! Emissive and VertexColor renderers.

use flight_color::LinearColor;
use flight_render_wgpu::{
    WgpuRenderState, WgpuSkinningAdapter, create_wgpu_bind_group, create_wgpu_bind_group_layout,
    create_wgpu_buffer, create_wgpu_shader_module, get_wgpu_render_state_native_device,
    get_wgpu_texture_format_name, write_wgpu_buffer,
};
use flight_texture::Texture;

use crate::types::*;
use crate::wgpu_material_layout_entries::{
    filtering_sampler_layout_entry, float_texture_layout_entry, uniform_layout_entry,
};
use crate::wgpu_mesh_fragment_tail::WGPU_MESH_FRAGMENT_TAIL;
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_scene3d_pipeline, get_wgpu_material_sampler,
    get_wgpu_mesh_prelude_wgsl, resolve_wgpu_material_texture_view, stash_wgpu_uv_transform,
};
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_skinning_adapter};

// Unlit material uniform: color vec4f + params vec4f (x = intensity, y = alphaCutoff) = 32 bytes.
const UNLIT_UNIFORM_BYTES: u64 = 32;

fn create_wgpu_unlit_bind_group(
    state: &WgpuRenderState,
    pipeline: &WgpuUnlitPipeline,
    buffer: &wgpu::Buffer,
    sampler: &wgpu::Sampler,
    view: &wgpu::TextureView,
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    return create_wgpu_bind_group(
        &native,
        &pipeline.material_bind_group_layout,
        &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::TextureView(view),
            },
        ],
    );
}

/// Ensures (and caches per material key) the unlit material bind group (uniform + the primary
/// sampler + the resolved color-map view) and rewrites its uniform with the surface's linear color,
/// intensity and alpha cutoff (TS `bindWgpuUnlitSurface`). Returns the group(2) bind group.
pub fn bind_wgpu_unlit_surface(
    state: &mut WgpuRenderState,
    pipeline: &WgpuUnlitPipeline,
    material_key: u64,
    color: &LinearColor,
    intensity: f32,
    alpha_cutoff: f32,
    color_map: Option<&Texture>,
) -> wgpu::BindGroup {
    let sampler = get_wgpu_material_sampler(state, color_map);
    let view = resolve_wgpu_material_texture_view(state, color_map);
    let binding = ensure_wgpu_unlit_binding(state, pipeline, material_key, &sampler, &view);
    write_wgpu_unlit_uniform(state, &binding, color, intensity, alpha_cutoff);
    stash_wgpu_uv_transform(state, color_map);
    return binding.bind_group;
}

/// The compatibility entry over the resolver-backed surface bind (TS `bindWgpuUnlitVideoSurface`).
pub fn bind_wgpu_unlit_video_surface(
    state: &mut WgpuRenderState,
    pipeline: &WgpuUnlitPipeline,
    material_key: u64,
    color: &LinearColor,
    intensity: f32,
    alpha_cutoff: f32,
    color_map: &Texture,
) -> wgpu::BindGroup {
    return bind_wgpu_unlit_surface(
        state,
        pipeline,
        material_key,
        color,
        intensity,
        alpha_cutoff,
        Some(color_map),
    );
}

/// The stable string identity of an unlit define key, used in the pipeline-cache key (TS
/// `buildWgpuUnlitDefineKey`).
pub fn build_wgpu_unlit_define_key(key: &WgpuUnlitDefineKey) -> String {
    return format!(
        "{}{}{}",
        if key.alpha_mask_enabled { "m" } else { "-" },
        if key.double_sided { "d" } else { "-" },
        if key.has_color_map { "c" } else { "-" }
    );
}

/// Compiles the unlit module for a define key and builds its pipeline for `format` with the group(2)
/// layout (uniform + sampler + one color texture), uncached (TS `compileWgpuUnlitPipeline`).
pub fn compile_wgpu_unlit_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuUnlitDefineKey,
    format: wgpu::TextureFormat,
    blended: Option<bool>,
    skinned: Option<bool>,
) -> WgpuUnlitPipeline {
    let skinned = skinned.unwrap_or(false);
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let module = create_wgpu_shader_module(
        &native,
        &get_wgpu_unlit_module_source_for_key(key, Some(skinned), skinning),
    );
    let material_bind_group_layout = create_wgpu_bind_group_layout(
        &native,
        &[
            uniform_layout_entry(0),
            filtering_sampler_layout_entry(1),
            float_texture_layout_entry(2),
        ],
    );
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
            pbr_sample_bind_group_layout: None,
            shadow_bind_group_layout: None,
            skinned: Some(skinned),
            topology: None,
        },
    );
}

fn ensure_wgpu_unlit_binding(
    state: &mut WgpuRenderState,
    pipeline: &WgpuUnlitPipeline,
    material_key: u64,
    sampler: &wgpu::Sampler,
    view: &wgpu::TextureView,
) -> WgpuMaterialBinding {
    let cached = get_wgpu_scene3d_runtime(state)
        .material_bind_groups
        .get(&material_key)
        .cloned();
    let binding = match cached {
        None => {
            let native = get_wgpu_render_state_native_device(state);
            let buffer = create_wgpu_buffer(
                &native,
                UNLIT_UNIFORM_BYTES,
                wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            );
            WgpuMaterialBinding {
                bind_group: create_wgpu_unlit_bind_group(state, pipeline, &buffer, sampler, view),
                buffer,
                samplers: None,
                sampler: Some(sampler.clone()),
                views: Some(vec![view.clone()]),
            }
        }
        Some(mut binding) => {
            let stale = binding.sampler.as_ref() != Some(sampler)
                || binding.views.as_ref().and_then(|views| views.first()) != Some(view)
                || binding.views.as_ref().map_or(0, |views| views.len()) != 1;
            if stale {
                binding.bind_group =
                    create_wgpu_unlit_bind_group(state, pipeline, &binding.buffer, sampler, view);
                binding.sampler = Some(sampler.clone());
                binding.views = Some(vec![view.clone()]);
            }
            binding
        }
    };
    get_wgpu_scene3d_runtime(state)
        .material_bind_groups
        .insert(material_key, binding.clone());
    return binding;
}

/// Resolves the unlit pipeline for a define key and color format through the shared scene pipeline
/// cache under the `unlit:` namespace (TS `ensureWgpuUnlitPipeline`).
pub fn ensure_wgpu_unlit_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuUnlitDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuUnlitPipeline {
    let cache_key = format!(
        "unlit:{}|{}",
        get_wgpu_texture_format_name(format),
        build_wgpu_unlit_define_key(key)
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, &mut |state, blended, skinned| {
        return compile_wgpu_unlit_pipeline(state, key, format, Some(blended), Some(skinned));
    });
}

/// The full WGSL module for a define key: the const flags, the shared mesh prelude and the unlit
/// material block with `fs_main` (TS `getWgpuUnlitModuleSourceForKey`).
pub fn get_wgpu_unlit_module_source_for_key(
    key: &WgpuUnlitDefineKey,
    skinned: Option<bool>,
    skinning: Option<&WgpuSkinningAdapter>,
) -> String {
    return format!(
        "const ALPHA_MASK : bool = {};\nconst HAS_COLOR_MAP : bool = {};\n{}{}{}",
        key.alpha_mask_enabled,
        key.has_color_map,
        get_wgpu_mesh_prelude_wgsl(skinned.unwrap_or(false), skinning),
        WGPU_MESH_FRAGMENT_TAIL,
        UNLIT_WGSL_BODY
    );
}

fn write_wgpu_unlit_uniform(
    state: &WgpuRenderState,
    binding: &WgpuMaterialBinding,
    color: &LinearColor,
    intensity: f32,
    alpha_cutoff: f32,
) {
    let native = get_wgpu_render_state_native_device(state);
    let values = [
        color.r,
        color.g,
        color.b,
        color.a,
        intensity,
        alpha_cutoff,
        0.0,
        0.0,
    ];
    write_wgpu_buffer(&native, &binding.buffer, 0, bytemuck::cast_slice(&values));
}

const UNLIT_WGSL_BODY: &str = r#"
struct UnlitMaterial {
  color : vec4f,   // linear rgba
  params : vec4f,  // x = intensity, y = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : UnlitMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var colorTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  var color = material.color * in.instanceColor;
  if (HAS_COLOR_MAP) {
    let sampled = textureSample(colorTexture, materialSampler, in.uv);
    color = vec4f(color.rgb * sampled.rgb, color.a * sampled.a);
  }
  if (ALPHA_MASK && color.a < material.params.y) {
    discard;
  }
  if (ALPHA_MASK) {
    color.a = 1.0;
  }
  return flightPremultipliedOutput(vec4f(color.rgb * material.params.x, flightMeshCoverage(color.a, in.objectAlpha, draw.params.y)));
}
"#;
