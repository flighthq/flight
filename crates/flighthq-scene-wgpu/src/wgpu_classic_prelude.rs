//! The shared Wgpu classic prelude — the WGSL mirror of scene-gl's
//! `glClassicPrelude`. One module for Lambert, Phong, and BlinnPhong.
//!
//! Ports `@flighthq/scene-wgpu` `wgpuClassicPrelude.ts`.

use flighthq_render_wgpu::WgpuRenderState;

use crate::wgpu_mesh_pipeline::{
    CreateWgpuMeshPipelineOptions, WGPU_MESH_PRELUDE_WGSL, WgpuMeshPipeline,
    create_wgpu_mesh_pipeline, ensure_wgpu_placeholder_texture_view,
};
use crate::wgpu_scene_runtime::{WgpuMaterialBinding, WgpuSceneRuntime};

/// One classic shading model.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum WgpuClassicLightingModel {
    BlinnPhong,
    Lambert,
    Phong,
}

/// A compiled classic pipeline variant.
pub type WgpuClassicPipeline = WgpuMeshPipeline;

/// The feature flags that select a classic uber-shader variant.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct WgpuClassicDefineKey {
    pub alpha_mask_enabled: bool,
    pub double_sided: bool,
    pub has_diffuse_map: bool,
    pub has_normal_map: bool,
    pub has_specular_map: bool,
    pub lighting_model: WgpuClassicLightingModel,
}

/// Ensures (once per material kind) the classic Material bind group — a uniform
/// buffer + the shared sampler + the placeholder diffuse/specular/normal textures
/// — and rewrites its uniform with this surface's linear diffuse + specular colors,
/// shininess, and alpha cutoff. Stores the binding in
/// [`WgpuSceneRuntime::material_bind_groups`] keyed by `material_key`; the family's
/// `draw` sets it at group(2) via `active_material_key`.
///
/// TS↔Rust divergence: TS `bindWgpuClassicSurface` takes the `pipeline` (for its
/// material layout) + the map textures and returns the bind group. The Rust threaded
/// runtime keys the binding by kind and the borrow model forbids passing a
/// `&pipeline` borrowed from `scene` alongside `&mut scene`, so this takes the
/// `cache_key` and looks the layout up internally (mirroring
/// `ensure_wgpu_pbr_material_bind_group`); maps are deferred on wgpu, so the map
/// arguments are dropped and every texture slot binds the shared placeholder.
#[allow(clippy::too_many_arguments)]
pub fn bind_wgpu_classic_surface(
    state: &WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    cache_key: &str,
    material_key: flighthq_types::kind::KindId,
    diffuse: &[f32; 4],
    specular: &[f32; 4],
    shininess: f32,
    alpha_cutoff: f32,
) {
    if !scene.material_bind_groups.contains_key(&material_key) {
        let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("flight-wgpu-classic-material-uniform"),
            size: CLASSIC_UNIFORM_BYTES,
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
                label: Some("flight-wgpu-classic-material-bind-group"),
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
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: wgpu::BindingResource::TextureView(placeholder),
                    },
                    wgpu::BindGroupEntry {
                        binding: 4,
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
        diffuse[0],
        diffuse[1],
        diffuse[2],
        diffuse[3],
        specular[0],
        specular[1],
        specular[2],
        specular[3],
        shininess,
        alpha_cutoff,
        0.0,
        0.0,
    ];
    state
        .queue
        .write_buffer(&binding.buffer, 0, f32_slice_bytes(&scratch));
}

/// A short, stable string identity for a classic define key.
pub fn build_wgpu_classic_define_key(key: &WgpuClassicDefineKey) -> String {
    let model = match key.lighting_model {
        WgpuClassicLightingModel::Phong => 'p',
        WgpuClassicLightingModel::BlinnPhong => 'b',
        WgpuClassicLightingModel::Lambert => 'l',
    };
    format!(
        "{}{}{}{}{}{}",
        model,
        if key.alpha_mask_enabled { 'm' } else { '-' },
        if key.double_sided { 'd' } else { '-' },
        if key.has_diffuse_map { 'd' } else { '-' },
        if key.has_specular_map { 's' } else { '-' },
        if key.has_normal_map { 'n' } else { '-' },
    )
}

/// Compiles the classic module. Pure GPU work. Mirrors TS
/// `compileWgpuClassicPipeline`.
pub fn compile_wgpu_classic_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    key: &WgpuClassicDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuClassicPipeline {
    let device = &state.device;
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-classic-shader"),
        source: wgpu::ShaderSource::Wgsl(get_wgpu_classic_module_source_for_key(key).into()),
    });
    let material_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-classic-material-bgl"),
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
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
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

/// Resolves the classic pipeline for a define key + color format, compiling and
/// caching it on first use, and returns its `mesh_pipeline_cache` key. Mirrors TS
/// `ensureWgpuClassicPipeline` (which returns the pipeline; the Rust port returns
/// the string key so the caller can record it as `active_pipeline_key` without
/// holding a borrow of the non-`Clone` pipeline, matching `standard_pbr`).
pub fn ensure_wgpu_classic_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    key: &WgpuClassicDefineKey,
    format: wgpu::TextureFormat,
) -> String {
    let cache_key = format!("classic:{format:?}|{}", build_wgpu_classic_define_key(key));
    if !scene.mesh_pipeline_cache.contains_key(&cache_key) {
        let pipeline = compile_wgpu_classic_pipeline(state, scene, key, format);
        scene
            .mesh_pipeline_cache
            .insert(cache_key.clone(), pipeline);
    }
    cache_key
}

/// The full WGSL module source for a define key.
pub fn get_wgpu_classic_module_source_for_key(key: &WgpuClassicDefineKey) -> String {
    format!(
        "const LIGHTING_PHONG : bool = {};\n\
         const LIGHTING_BLINNPHONG : bool = {};\n\
         const ALPHA_MASK : bool = {};\n\
         const DOUBLE_SIDED : bool = {};\n\
         const HAS_DIFFUSE_MAP : bool = {};\n\
         const HAS_SPECULAR_MAP : bool = {};\n\
         const HAS_NORMAL_MAP : bool = {};\n\
         {}{}",
        bool_literal(key.lighting_model == WgpuClassicLightingModel::Phong),
        bool_literal(key.lighting_model == WgpuClassicLightingModel::BlinnPhong),
        bool_literal(key.alpha_mask_enabled),
        bool_literal(key.double_sided),
        bool_literal(key.has_diffuse_map),
        bool_literal(key.has_specular_map),
        bool_literal(key.has_normal_map),
        WGPU_MESH_PRELUDE_WGSL,
        CLASSIC_WGSL_BODY,
    )
}

const CLASSIC_UNIFORM_BYTES: u64 = 48;

const CLASSIC_WGSL_BODY: &str = r#"
struct ClassicMaterial {
  diffuse : vec4f,
  specular : vec4f,
  params : vec4f,
};

@group(2) @binding(0) var<uniform> material : ClassicMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var diffuseTexture : texture_2d<f32>;
@group(2) @binding(3) var specularTexture : texture_2d<f32>;
@group(2) @binding(4) var normalTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  let N = normalize(in.worldNormal);
  let V = normalize(frame.cameraPosition.xyz - in.worldPosition);
  let L = normalize(-frame.lightDirection.xyz);

  var diffuseColor = material.diffuse;
  if (HAS_DIFFUSE_MAP) {
    let sampled = textureSample(diffuseTexture, materialSampler, in.uv);
    diffuseColor = vec4f(diffuseColor.rgb * srgbToLinear(sampled.rgb), diffuseColor.a * sampled.a);
  }

  let ambient = frame.ambientRadiance.rgb * diffuseColor.rgb;
  let NdotL = max(dot(N, L), 0.0);
  let diffuse = frame.lightDirection.w * NdotL * diffuseColor.rgb;

  var specular = vec3f(0.0);
  if (LIGHTING_PHONG) {
    let R = reflect(-L, N);
    let RdotV = max(dot(R, V), 0.0);
    specular = material.specular.rgb * pow(RdotV, material.params.x);
  } else if (LIGHTING_BLINNPHONG) {
    let H = normalize(L + V);
    let NdotH = max(dot(N, H), 0.0);
    specular = material.specular.rgb * pow(NdotH, material.params.x);
  }

  let color = ambient + diffuse + specular * frame.lightDirection.w;
  if (ALPHA_MASK && diffuseColor.a < material.params.y) {
    discard;
  }
  return vec4f(color, diffuseColor.a);
}
"#;

fn bool_literal(value: bool) -> &'static str {
    if value { "true" } else { "false" }
}

fn f32_slice_bytes(data: &[f32]) -> &[u8] {
    let ptr = data.as_ptr() as *const u8;
    unsafe { std::slice::from_raw_parts(ptr, std::mem::size_of_val(data)) }
}
