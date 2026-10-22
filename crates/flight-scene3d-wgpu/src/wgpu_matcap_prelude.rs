// flight-lint: allow-file(contract-vocabulary) D17: the matcap family seams take and return native wgpu values
//! The Wgpu matcap prelude (TS `wgpuMatcapPrelude.ts`): a lighting-independent material-capture
//! module whose matcap is sampled by the view-space normal. The matcap texture is not sampled on wgpu
//! yet (`has_matcap` stays false and the placeholder is bound), so the surface renders the linear tint
//! alone; the WGSL keeps the lookup present behind the const flag.

use flight_color::LinearColor;
use flight_render_wgpu::{
    WgpuRenderState, WgpuSkinningAdapter, create_wgpu_bind_group, create_wgpu_bind_group_layout,
    create_wgpu_buffer, create_wgpu_shader_module, get_wgpu_render_state_device_resources,
    get_wgpu_render_state_native_device, get_wgpu_texture_format_name, write_wgpu_buffer,
};

use crate::types::*;
use crate::wgpu_material_layout_entries::{
    filtering_sampler_layout_entry, float_texture_layout_entry, uniform_layout_entry,
};
use crate::wgpu_mesh_fragment_tail::WGPU_MESH_FRAGMENT_TAIL;
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_placeholder_texture_view, ensure_wgpu_scene3d_pipeline,
    get_wgpu_mesh_prelude_wgsl, stash_wgpu_uv_transform,
};
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_skinning_adapter};

// Matcap material uniform: tint vec4f + params vec4f (x = alphaCutoff) = 32 bytes.
const MATCAP_UNIFORM_BYTES: u64 = 32;

/// Ensures (and caches per material key) the matcap material bind group (uniform + the shared linear
/// sampler + the placeholder matcap texture) and rewrites its uniform with the linear tint and alpha
/// cutoff (TS `bindWgpuMatcapSurface`). Stashes the identity uv transform: matcap samples by normal.
pub fn bind_wgpu_matcap_surface(
    state: &mut WgpuRenderState,
    pipeline: &WgpuMatcapPipeline,
    material_key: u64,
    tint: &LinearColor,
    alpha_cutoff: f32,
) -> wgpu::BindGroup {
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
                MATCAP_UNIFORM_BYTES,
                wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            );
            let sampler = get_wgpu_render_state_device_resources(state).linear_sampler;
            let placeholder = ensure_wgpu_placeholder_texture_view(state);
            let bind_group = create_wgpu_bind_group(
                &native,
                &pipeline.material_bind_group_layout,
                &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&sampler),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::TextureView(&placeholder),
                    },
                ],
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

    let values = [tint.r, tint.g, tint.b, tint.a, alpha_cutoff, 0.0, 0.0, 0.0];
    write_wgpu_buffer(&native, &binding.buffer, 0, bytemuck::cast_slice(&values));
    stash_wgpu_uv_transform(state, None);
    return binding.bind_group;
}

/// The stable string identity of a matcap define key (TS `buildWgpuMatcapDefineKey`).
pub fn build_wgpu_matcap_define_key(key: &WgpuMatcapDefineKey) -> String {
    return format!(
        "{}{}{}",
        if key.alpha_mask_enabled { "m" } else { "-" },
        if key.double_sided { "d" } else { "-" },
        if key.has_matcap { "t" } else { "-" }
    );
}

/// Compiles the matcap module for a define key and builds its pipeline for `format` with the group(2)
/// layout (uniform + sampler + the matcap texture), uncached (TS `compileWgpuMatcapPipeline`).
pub fn compile_wgpu_matcap_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuMatcapDefineKey,
    format: wgpu::TextureFormat,
    blended: Option<bool>,
    skinned: Option<bool>,
) -> WgpuMatcapPipeline {
    let skinned = skinned.unwrap_or(false);
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let module = create_wgpu_shader_module(
        &native,
        &get_wgpu_matcap_module_source_for_key(key, Some(skinned), skinning),
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

/// Resolves the matcap pipeline for a define key and color format through the shared scene pipeline
/// cache under the `matcap:` namespace (TS `ensureWgpuMatcapPipeline`).
pub fn ensure_wgpu_matcap_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuMatcapDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuMatcapPipeline {
    let cache_key = format!(
        "matcap:{}|{}",
        get_wgpu_texture_format_name(format),
        build_wgpu_matcap_define_key(key)
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, &mut |state, blended, skinned| {
        return compile_wgpu_matcap_pipeline(state, key, format, Some(blended), Some(skinned));
    });
}

/// The full WGSL module for a define key: the const flags, the shared mesh prelude and the matcap
/// material block with `fs_main` (TS `getWgpuMatcapModuleSourceForKey`).
pub fn get_wgpu_matcap_module_source_for_key(
    key: &WgpuMatcapDefineKey,
    skinned: Option<bool>,
    skinning: Option<&WgpuSkinningAdapter>,
) -> String {
    return format!(
        "const ALPHA_MASK : bool = {};\nconst HAS_MATCAP : bool = {};\n{}{}{}",
        key.alpha_mask_enabled,
        key.has_matcap,
        get_wgpu_mesh_prelude_wgsl(skinned.unwrap_or(false), skinning),
        WGPU_MESH_FRAGMENT_TAIL,
        MATCAP_WGSL_BODY
    );
}

const MATCAP_WGSL_BODY: &str = r#"
struct MatcapMaterial {
  tint : vec4f,    // linear rgba
  params : vec4f,  // x = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : MatcapMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var matcapTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  var color = material.tint * in.instanceColor;
  if (HAS_MATCAP) {
    // View-space-normal approximation: the shared Frame uniform carries no view matrix, so face the
    // world normal toward the camera and project to 2D for the matcap lookup (uv = n.xy * 0.5 + 0.5).
    // Present-but-unused while hasMatcap is false; the true view-space normal arrives with a view
    // matrix in Frame + wgpu texture upload.
    let worldNormal = normalize(in.worldNormal);
    let viewDir = normalize(frame.cameraPosition.xyz - in.worldPosition);
    let viewNormal = normalize(reflect(-viewDir, worldNormal));
    let matcapUv = viewNormal.xy * 0.5 + 0.5;
    let sampled = textureSample(matcapTexture, materialSampler, matcapUv);
    color = vec4f(color.rgb * sampled.rgb, color.a * sampled.a);
  }
  if (ALPHA_MASK && color.a < material.params.x) {
    discard;
  }
  if (ALPHA_MASK) {
    color.a = 1.0;
  }
  return flightPremultipliedOutput(vec4f(color.rgb, flightMeshCoverage(color.a, in.objectAlpha, draw.params.y)));
}
"#;
