//! The shared Wgpu unlit prelude — the WGSL mirror of scene-gl's
//! `glUnlitPrelude`. One module for every lighting-independent flat-color
//! material (Unlit, Emissive, VertexColor).
//!
//! Ports `@flighthq/scene-wgpu` `wgpuUnlitPrelude.ts`.

use flighthq_render_wgpu::WgpuRenderState;

use crate::wgpu_mesh_pipeline::{
    CreateWgpuMeshPipelineOptions, WGPU_MESH_PRELUDE_WGSL, WgpuMeshPipeline,
    create_wgpu_mesh_pipeline, ensure_wgpu_placeholder_texture_view, ensure_wgpu_scene_pipeline,
};
use crate::wgpu_scene_runtime::{WgpuMaterialBinding, WgpuSceneRuntime};

/// The feature flags that select an unlit variant.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuUnlitDefineKey {
    pub alpha_mask_enabled: bool,
    pub double_sided: bool,
    pub has_color_map: bool,
}

/// Ensures the unlit Material bind group and rewrites its uniform with the
/// surface's linear color, intensity, and alpha cutoff. Mirrors TS
/// `bindWgpuUnlitSurface`.
pub fn bind_wgpu_unlit_surface(
    state: &WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    pipeline: &WgpuMeshPipeline,
    material_key: flighthq_types::kind::KindId,
    color: &[f32; 4],
    intensity: f32,
    alpha_cutoff: f32,
) -> &wgpu::BindGroup {
    if !scene.material_bind_groups.contains_key(&material_key) {
        let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("flight-wgpu-unlit-material-uniform"),
            size: UNLIT_UNIFORM_BYTES,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let placeholder = ensure_wgpu_placeholder_texture_view(state, scene);
        let bind_group = state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("flight-wgpu-unlit-material-bind-group"),
            layout: &pipeline.material_bind_group_layout,
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
        });
        scene
            .material_bind_groups
            .insert(material_key, WgpuMaterialBinding { bind_group, buffer });
    }

    let binding = &scene.material_bind_groups[&material_key];
    let scratch = [
        color[0],
        color[1],
        color[2],
        color[3],
        intensity,
        alpha_cutoff,
        0.0,
        0.0,
    ];
    state
        .queue
        .write_buffer(&binding.buffer, 0, f32_slice_bytes(&scratch));
    &binding.bind_group
}

/// A short, stable string identity for an unlit define key.
pub fn build_wgpu_unlit_define_key(key: &WgpuUnlitDefineKey) -> String {
    format!(
        "{}{}{}",
        if key.alpha_mask_enabled { 'm' } else { '-' },
        if key.double_sided { 'd' } else { '-' },
        if key.has_color_map { 'c' } else { '-' },
    )
}

/// Compiles the unlit module for a define key. Pure GPU work. Mirrors TS
/// `compileWgpuUnlitPipeline`.
pub fn compile_wgpu_unlit_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    key: &WgpuUnlitDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuMeshPipeline {
    let device = &state.device;
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-unlit-shader"),
        source: wgpu::ShaderSource::Wgsl(get_wgpu_unlit_module_source_for_key(key).into()),
    });
    let material_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-unlit-material-bgl"),
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

/// Resolves the unlit pipeline, compiling and caching on first use. Mirrors TS
/// `ensureWgpuUnlitPipeline`.
pub fn ensure_wgpu_unlit_pipeline<'a>(
    state: &mut WgpuRenderState,
    scene: &'a mut WgpuSceneRuntime,
    key: &WgpuUnlitDefineKey,
    format: wgpu::TextureFormat,
) -> &'a WgpuMeshPipeline {
    let cache_key = format!("unlit:{format:?}|{}", build_wgpu_unlit_define_key(key));
    if !scene.mesh_pipeline_cache.contains_key(&cache_key) {
        let pipeline = compile_wgpu_unlit_pipeline(state, scene, key, format);
        scene
            .mesh_pipeline_cache
            .insert(cache_key.clone(), pipeline);
    }
    &scene.mesh_pipeline_cache[&cache_key]
}

/// The full WGSL module source for a define key.
pub fn get_wgpu_unlit_module_source_for_key(key: &WgpuUnlitDefineKey) -> String {
    format!(
        "const ALPHA_MASK : bool = {};\n\
         const HAS_COLOR_MAP : bool = {};\n\
         {}{}",
        bool_literal(key.alpha_mask_enabled),
        bool_literal(key.has_color_map),
        WGPU_MESH_PRELUDE_WGSL,
        UNLIT_WGSL_BODY,
    )
}

const UNLIT_UNIFORM_BYTES: u64 = 32;

const UNLIT_WGSL_BODY: &str = r#"
struct UnlitMaterial {
  color : vec4f,
  params : vec4f,
};

@group(2) @binding(0) var<uniform> material : UnlitMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var colorTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  var color = material.color;
  if (HAS_COLOR_MAP) {
    let sampled = textureSample(colorTexture, materialSampler, in.uv);
    color = vec4f(color.rgb * srgbToLinear(sampled.rgb), color.a * sampled.a);
  }
  if (ALPHA_MASK && color.a < material.params.y) {
    discard;
  }
  return vec4f(color.rgb * material.params.x, color.a);
}
"#;

fn bool_literal(value: bool) -> &'static str {
    if value { "true" } else { "false" }
}

fn f32_slice_bytes(data: &[f32]) -> &[u8] {
    let ptr = data.as_ptr() as *const u8;
    unsafe { std::slice::from_raw_parts(ptr, std::mem::size_of_val(data)) }
}
