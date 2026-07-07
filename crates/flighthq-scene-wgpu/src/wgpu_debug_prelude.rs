//! The shared Wgpu debug prelude — the WGSL mirror of scene-gl's `glDebugPrelude`.
//! One module source for every lighting-independent debug/utility pass material
//! (Depth, Normal), selected by a `MODE` const discriminator and a `HAS_NORMAL_MAP`
//! const the pipeline compiler folds.
//!
//! Ports `@flighthq/scene-wgpu` `wgpuDebugPrelude.ts`. WebGPU NDC depth is the
//! `[0, 1]` convention, so the depth reconstruction skips GL's `z * 2 - 1` remap —
//! the one intentional divergence from `depthGlMeshMaterialRenderer`'s shader. The
//! tangent-space normal map is not sampled on wgpu yet (`has_normal_map` stays
//! false; the placeholder is bound).

use flighthq_render_wgpu::WgpuRenderState;

use crate::wgpu_mesh_pipeline::{
    CreateWgpuMeshPipelineOptions, WGPU_MESH_PRELUDE_WGSL, WgpuMeshPipeline,
    create_wgpu_mesh_pipeline, ensure_wgpu_placeholder_texture_view,
};
use crate::wgpu_scene_runtime::{WgpuMaterialBinding, WgpuSceneRuntime};

/// A compiled debug pipeline variant.
pub type WgpuDebugPipeline = WgpuMeshPipeline;

/// The debug fragment branch a variant selects. The WGSL mirror of the TS
/// `'depth' | 'normal'` mode string.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum WgpuDebugMode {
    Depth,
    Normal,
}

/// The feature flags that select a debug variant. `mode` picks the depth vs normal
/// fragment branch; `has_normal_map` enables the sampled tangent-space normal-map
/// perturbation (normal mode only; not yet wired on wgpu).
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct WgpuDebugDefineKey {
    pub has_normal_map: bool,
    pub mode: WgpuDebugMode,
}

/// Ensures (once per material kind) the debug Material bind group (a uniform buffer,
/// the shared sampler, and the placeholder texture) and rewrites its uniform. The
/// params vec4 packs near/far (depth mode) and normalScale (normal mode); the active
/// mode reads only the lanes it needs. Mirrors TS `bindWgpuDebugSurface` (keyed by
/// kind + threaded runtime + `cache_key` layout lookup).
pub fn bind_wgpu_debug_surface(
    state: &WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    cache_key: &str,
    material_key: flighthq_types::kind::KindId,
    near: f32,
    far: f32,
    normal_scale: f32,
) {
    if !scene.material_bind_groups.contains_key(&material_key) {
        let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("flight-wgpu-debug-material-uniform"),
            size: DEBUG_UNIFORM_BYTES,
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
                label: Some("flight-wgpu-debug-material-bind-group"),
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
    let scratch = [near, far, normal_scale, 0.0];
    state
        .queue
        .write_buffer(&binding.buffer, 0, f32_slice_bytes(&scratch));
}

/// A short, stable, order-independent string identity for a debug define key. `d-`
/// is depth; `n-` is normal; `nm` is normal + normal map.
pub fn build_wgpu_debug_define_key(key: &WgpuDebugDefineKey) -> String {
    format!(
        "{}{}",
        if key.mode == WgpuDebugMode::Depth {
            'd'
        } else {
            'n'
        },
        if key.has_normal_map { 'm' } else { '-' },
    )
}

/// Compiles the debug module for a define key and builds the render pipeline for the
/// color format, with the group(2) material bind-group layout (uniform + sampler +
/// one texture). Debug materials are single-sided. Mirrors TS
/// `compileWgpuDebugPipeline`.
pub fn compile_wgpu_debug_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    key: &WgpuDebugDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuDebugPipeline {
    let device = &state.device;
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-debug-shader"),
        source: wgpu::ShaderSource::Wgsl(get_wgpu_debug_module_source_for_key(key).into()),
    });
    let material_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-debug-material-bgl"),
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
            double_sided: false,
            format,
            material_bind_group_layout,
            module,
            topology: wgpu::PrimitiveTopology::TriangleList,
        },
    )
}

/// Resolves the debug pipeline for a define key + color format, compiling and
/// caching it on first use, and returns its `mesh_pipeline_cache` key. Mirrors TS
/// `ensureWgpuDebugPipeline` (returns the string key — see
/// `ensure_wgpu_classic_pipeline`).
pub fn ensure_wgpu_debug_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    key: &WgpuDebugDefineKey,
    format: wgpu::TextureFormat,
) -> String {
    let cache_key = format!("debug:{format:?}|{}", build_wgpu_debug_define_key(key));
    if !scene.mesh_pipeline_cache.contains_key(&cache_key) {
        let pipeline = compile_wgpu_debug_pipeline(state, scene, key, format);
        scene
            .mesh_pipeline_cache
            .insert(cache_key.clone(), pipeline);
    }
    cache_key
}

/// The full WGSL module source for a define key.
pub fn get_wgpu_debug_module_source_for_key(key: &WgpuDebugDefineKey) -> String {
    format!(
        "const MODE : i32 = {};\n\
         const HAS_NORMAL_MAP : bool = {};\n\
         {}{}{}",
        if key.mode == WgpuDebugMode::Depth {
            "DEPTH_MODE"
        } else {
            "NORMAL_MODE"
        },
        bool_literal(key.has_normal_map),
        DEBUG_MODE_CONSTS_WGSL,
        WGPU_MESH_PRELUDE_WGSL,
        DEBUG_WGSL_BODY,
    )
}

const DEBUG_UNIFORM_BYTES: u64 = 16;

const DEBUG_MODE_CONSTS_WGSL: &str = r#"
const DEPTH_MODE : i32 = 0;
const NORMAL_MODE : i32 = 1;
"#;

const DEBUG_WGSL_BODY: &str = r#"
struct DebugMaterial {
  params : vec4f,  // x = near, y = far (depth); z = normalScale (normal)
};

@group(2) @binding(0) var<uniform> material : DebugMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var normalTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) frontFacing : bool) -> @location(0) vec4f {
  if (MODE == DEPTH_MODE) {
    // Linear view-space distance is the perspective w: in.clipPosition is the @builtin(position), whose
    // .w in the fragment stage is 1 / w_clip, so 1 / in.clipPosition.w == w_clip == eye distance. This
    // is camera-agnostic (no camera near/far needed); map it across the material's [near, far]
    // visualization window to grayscale [0, 1].
    let near = material.params.x;
    let far = material.params.y;
    let eyeDepth = 1.0 / in.clipPosition.w;
    let d = clamp((eyeDepth - near) / max(far - near, 1e-6), 0.0, 1.0);
    return vec4f(vec3f(d), 1.0);
  }

  // NORMAL_MODE: visualize the WORLD-space surface normal — the geometric normal carried through
  // draw.normalMatrix in vs_main. The normal-map branch is gated by HAS_NORMAL_MAP but stays inert on
  // wgpu until map upload lands (see the prelude note); normalScale is read so the binding is live.
  var geometricNormal = normalize(in.worldNormal);
  if (!frontFacing) {
    geometricNormal = -geometricNormal;
  }

  var normal = geometricNormal;
  if (HAS_NORMAL_MAP) {
    let tangent = normalize(in.worldTangent.xyz);
    let bitangent = cross(geometricNormal, tangent) * in.worldTangent.w;
    var tangentNormal = textureSample(normalTexture, materialSampler, in.uv).xyz * 2.0 - 1.0;
    tangentNormal = vec3f(tangentNormal.xy * material.params.z, tangentNormal.z);
    let tbn = mat3x3f(tangent, bitangent, geometricNormal);
    normal = normalize(tbn * tangentNormal);
  }

  return vec4f(normal * 0.5 + 0.5, 1.0);
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

    mod build_wgpu_debug_define_key {
        use super::*;

        #[test]
        fn encodes_mode_then_normal_map_flag() {
            assert_eq!(
                build_wgpu_debug_define_key(&WgpuDebugDefineKey {
                    has_normal_map: false,
                    mode: WgpuDebugMode::Depth,
                }),
                "d-"
            );
            assert_eq!(
                build_wgpu_debug_define_key(&WgpuDebugDefineKey {
                    has_normal_map: true,
                    mode: WgpuDebugMode::Normal,
                }),
                "nm"
            );
        }
    }

    mod get_wgpu_debug_module_source_for_key {
        use super::*;

        #[test]
        fn selects_the_depth_mode_discriminator_and_carries_both_branches() {
            let source = get_wgpu_debug_module_source_for_key(&WgpuDebugDefineKey {
                has_normal_map: false,
                mode: WgpuDebugMode::Depth,
            });
            assert!(source.contains("const MODE : i32 = DEPTH_MODE;"));
            assert!(source.contains("const DEPTH_MODE : i32 = 0;"));
            assert!(source.contains("let eyeDepth = 1.0 / in.clipPosition.w;"));
            assert!(source.contains("return vec4f(normal * 0.5 + 0.5, 1.0);"));
        }

        #[test]
        fn selects_the_normal_mode_discriminator() {
            let source = get_wgpu_debug_module_source_for_key(&WgpuDebugDefineKey {
                has_normal_map: true,
                mode: WgpuDebugMode::Normal,
            });
            assert!(source.contains("const MODE : i32 = NORMAL_MODE;"));
            assert!(source.contains("const HAS_NORMAL_MAP : bool = true;"));
        }
    }
}
