//! The shared Wgpu matcap prelude — the WGSL mirror of scene-gl's `glMatcapPrelude`.
//! One module for the lighting-independent Matcap (material-capture) material.
//!
//! Ports `@flighthq/scene-wgpu` `wgpuMatcapPrelude.ts`. The real matcap texture is
//! not yet sampled on wgpu (`has_matcap` stays false; the bind group binds the
//! shared placeholder), so the surface renders as the tint alone. The WGSL matcap
//! branch is carried behind the false flag for when texture upload + a view matrix
//! land.

use flighthq_render_wgpu::WgpuRenderState;

use crate::wgpu_mesh_pipeline::{
    CreateWgpuMeshPipelineOptions, WGPU_MESH_PRELUDE_WGSL, WgpuMeshPipeline,
    create_wgpu_mesh_pipeline, ensure_wgpu_placeholder_texture_view,
};
use crate::wgpu_scene_runtime::{WgpuMaterialBinding, WgpuSceneRuntime};

/// A compiled matcap pipeline variant.
pub type WgpuMatcapPipeline = WgpuMeshPipeline;

/// The feature flags that select a matcap variant. `has_matcap` enables the sampled
/// matcap texture (not yet used on wgpu; when false the shader outputs the tint
/// alone); `alpha_mask_enabled` enables the alpha-cutoff discard; `double_sided`
/// selects the cull-none pipeline.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuMatcapDefineKey {
    pub alpha_mask_enabled: bool,
    pub double_sided: bool,
    pub has_matcap: bool,
}

/// Ensures (once per material kind) the matcap Material bind group — a uniform
/// buffer + the shared sampler + the placeholder matcap texture — and rewrites its
/// uniform with this surface's linear tint and alpha cutoff. Mirrors TS
/// `bindWgpuMatcapSurface` (keyed by kind + threaded runtime + `cache_key` layout
/// lookup).
pub fn bind_wgpu_matcap_surface(
    state: &WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    cache_key: &str,
    material_key: flighthq_types::kind::KindId,
    tint: &[f32; 4],
    alpha_cutoff: f32,
) {
    if !scene.material_bind_groups.contains_key(&material_key) {
        let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("flight-wgpu-matcap-material-uniform"),
            size: MATCAP_UNIFORM_BYTES,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        ensure_wgpu_placeholder_texture_view(state, scene);
        let bind_group = {
            let layout = &scene.mesh_pipeline_cache[cache_key].material_bind_group_layout;
            let placeholder = scene
                .placeholder_view
                .as_ref()
                .expect("placeholder view ensured before material bind group");
            state.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("flight-wgpu-matcap-material-bind-group"),
                layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&state.runtime.linear_sampler),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::TextureView(placeholder),
                    },
                ],
            })
        };
        scene
            .material_bind_groups
            .insert(material_key, WgpuMaterialBinding { bind_group, buffer });
    }

    let binding = &scene.material_bind_groups[&material_key];
    let scratch = [
        tint[0],
        tint[1],
        tint[2],
        tint[3],
        alpha_cutoff,
        0.0,
        0.0,
        0.0,
    ];
    state
        .queue
        .write_buffer(&binding.buffer, 0, f32_slice_bytes(&scratch));
}

/// A short, stable, order-independent string identity for a matcap define key.
pub fn build_wgpu_matcap_define_key(key: &WgpuMatcapDefineKey) -> String {
    format!(
        "{}{}{}",
        if key.alpha_mask_enabled { 'm' } else { '-' },
        if key.double_sided { 'd' } else { '-' },
        if key.has_matcap { 't' } else { '-' },
    )
}

/// Compiles the matcap module for a define key and builds the render pipeline for
/// the color format, with the group(2) material bind-group layout (uniform, sampler,
/// and the matcap texture). Mirrors TS `compileWgpuMatcapPipeline`.
pub fn compile_wgpu_matcap_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    key: &WgpuMatcapDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuMatcapPipeline {
    let device = &state.device;
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-matcap-shader"),
        source: wgpu::ShaderSource::Wgsl(get_wgpu_matcap_module_source_for_key(key).into()),
    });
    let material_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-matcap-material-bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
            ],
        });
    create_wgpu_mesh_pipeline(
        state,
        scene,
        CreateWgpuMeshPipelineOptions {
            double_sided: key.double_sided,
            format,
            material_bind_group_layout,
            module,
            topology: wgpu::PrimitiveTopology::TriangleList,
        },
    )
}

/// Resolves the matcap pipeline for a define key + color format, compiling and
/// caching it on first use, and returns its `mesh_pipeline_cache` key. Mirrors TS
/// `ensureWgpuMatcapPipeline` (returns the string key — see
/// `ensure_wgpu_classic_pipeline`).
pub fn ensure_wgpu_matcap_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    key: &WgpuMatcapDefineKey,
    format: wgpu::TextureFormat,
) -> String {
    let cache_key = format!("matcap:{format:?}|{}", build_wgpu_matcap_define_key(key));
    if !scene.mesh_pipeline_cache.contains_key(&cache_key) {
        let pipeline = compile_wgpu_matcap_pipeline(state, scene, key, format);
        scene
            .mesh_pipeline_cache
            .insert(cache_key.clone(), pipeline);
    }
    cache_key
}

/// The full WGSL module source for a define key.
pub fn get_wgpu_matcap_module_source_for_key(key: &WgpuMatcapDefineKey) -> String {
    format!(
        "const ALPHA_MASK : bool = {};\n\
         const HAS_MATCAP : bool = {};\n\
         {}{}",
        bool_literal(key.alpha_mask_enabled),
        bool_literal(key.has_matcap),
        WGPU_MESH_PRELUDE_WGSL,
        MATCAP_WGSL_BODY,
    )
}

const MATCAP_UNIFORM_BYTES: u64 = 32;

const MATCAP_WGSL_BODY: &str = r#"
struct MatcapMaterial {
  tint : vec4f,    // linear rgba
  params : vec4f,  // x = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : MatcapMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var matcapTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  var color = material.tint;
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
    color = vec4f(color.rgb * srgbToLinear(sampled.rgb), color.a * sampled.a);
  }
  if (ALPHA_MASK && color.a < material.params.x) {
    discard;
  }
  return color;
}
"#;

fn bool_literal(value: bool) -> &'static str {
    if value { "true" } else { "false" }
}

fn f32_slice_bytes(data: &[f32]) -> &[u8] {
    let ptr = data.as_ptr() as *const u8;
    unsafe { std::slice::from_raw_parts(ptr, std::mem::size_of_val(data)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod build_wgpu_matcap_define_key {
        use super::*;

        #[test]
        fn encodes_each_flag_as_a_stable_char_slot() {
            assert_eq!(
                build_wgpu_matcap_define_key(&WgpuMatcapDefineKey::default()),
                "---"
            );
            let key = WgpuMatcapDefineKey {
                alpha_mask_enabled: true,
                double_sided: true,
                has_matcap: true,
            };
            assert_eq!(build_wgpu_matcap_define_key(&key), "mdt");
        }
    }

    mod get_wgpu_matcap_module_source_for_key {
        use super::*;

        #[test]
        fn emits_the_const_flag_block_and_the_tint_body() {
            let source = get_wgpu_matcap_module_source_for_key(&WgpuMatcapDefineKey::default());
            assert!(source.contains("const HAS_MATCAP : bool = false;"));
            assert!(source.contains("struct MatcapMaterial"));
            assert!(source.contains("let matcapUv = viewNormal.xy * 0.5 + 0.5;"));
            assert!(source.contains("fn srgbToLinear"));
        }
    }
}
