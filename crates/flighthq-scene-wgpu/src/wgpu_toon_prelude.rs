//! The shared Wgpu Toon (cel-shading) prelude — the WGSL mirror of scene-gl's
//! `glToonPrelude`. One module for the Toon material, specialized per material at
//! compile time by a leading const-flag block (WGSL has no preprocessor).
//!
//! Ports `@flighthq/scene-wgpu` `wgpuToonPrelude.ts`. Maps (base-color, ramp) are
//! not sampled on wgpu yet — the `has_base_color_map` / `has_ramp` flags stay
//! false, every texture slot binds the shared 1x1 placeholder, and the quantizer is
//! always the scalar `steps` stepped floor. The WGSL branches are carried so they
//! light up unchanged once texture upload lands.

use flighthq_render_wgpu::WgpuRenderState;

use crate::wgpu_mesh_pipeline::{
    CreateWgpuMeshPipelineOptions, WGPU_MESH_PRELUDE_WGSL, WgpuMeshPipeline,
    create_wgpu_mesh_pipeline, ensure_wgpu_placeholder_texture_view,
};
use crate::wgpu_scene_runtime::{WgpuMaterialBinding, WgpuSceneRuntime};

/// A compiled Toon pipeline variant.
pub type WgpuToonPipeline = WgpuMeshPipeline;

/// The feature flags that select a Toon uber-shader variant. `has_base_color_map`
/// enables the sampled albedo tint and `has_ramp` switches the quantizer to a 1D
/// ramp lookup — both stay false on the wgpu renderer until texture upload lands;
/// `alpha_mask_enabled` enables the alpha-cutoff discard; `double_sided` selects the
/// cull-none pipeline and flips the back-face normal.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuToonDefineKey {
    pub alpha_mask_enabled: bool,
    pub double_sided: bool,
    pub has_base_color_map: bool,
    pub has_ramp: bool,
}

/// Ensures (once per material kind) the Toon Material bind group (a uniform buffer,
/// the shared sampler, and the placeholder base-color and ramp textures) and
/// rewrites its uniform with this surface's linear base color, step count, and alpha
/// cutoff. Mirrors TS `bindWgpuToonSurface`; keyed by kind + threaded runtime + the
/// `cache_key` layout lookup, as `bind_wgpu_classic_surface`.
pub fn bind_wgpu_toon_surface(
    state: &WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    cache_key: &str,
    material_key: flighthq_types::kind::KindId,
    base_color: &[f32; 4],
    steps: f32,
    alpha_cutoff: f32,
) {
    if !scene.material_bind_groups.contains_key(&material_key) {
        let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("flight-wgpu-toon-material-uniform"),
            size: TOON_UNIFORM_BYTES,
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
                label: Some("flight-wgpu-toon-material-bind-group"),
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
                ],
            })
        };
        scene
            .material_bind_groups
            .insert(material_key, WgpuMaterialBinding { bind_group, buffer });
    }

    let binding = &scene.material_bind_groups[&material_key];
    let scratch = [
        base_color[0],
        base_color[1],
        base_color[2],
        base_color[3],
        steps,
        alpha_cutoff,
        0.0,
        0.0,
    ];
    state
        .queue
        .write_buffer(&binding.buffer, 0, f32_slice_bytes(&scratch));
}

/// A short, stable, order-independent string identity for a Toon define key.
pub fn build_wgpu_toon_define_key(key: &WgpuToonDefineKey) -> String {
    format!(
        "{}{}{}{}",
        if key.alpha_mask_enabled { 'm' } else { '-' },
        if key.double_sided { 'd' } else { '-' },
        if key.has_base_color_map { 'b' } else { '-' },
        if key.has_ramp { 'r' } else { '-' },
    )
}

/// Compiles the Toon module for a define key and builds the render pipeline for the
/// color format, with the group(2) material bind-group layout (uniform + sampler +
/// base-color + ramp textures). Mirrors TS `compileWgpuToonPipeline`.
pub fn compile_wgpu_toon_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    key: &WgpuToonDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuToonPipeline {
    let device = &state.device;
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-toon-shader"),
        source: wgpu::ShaderSource::Wgsl(get_wgpu_toon_module_source_for_key(key).into()),
    });
    let material_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-toon-material-bgl"),
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

/// Resolves the Toon pipeline for a define key + color format, compiling and caching
/// it on first use, and returns its `mesh_pipeline_cache` key. Mirrors TS
/// `ensureWgpuToonPipeline` (returns the string key — see
/// `ensure_wgpu_classic_pipeline`).
pub fn ensure_wgpu_toon_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    key: &WgpuToonDefineKey,
    format: wgpu::TextureFormat,
) -> String {
    let cache_key = format!("toon:{format:?}|{}", build_wgpu_toon_define_key(key));
    if !scene.mesh_pipeline_cache.contains_key(&cache_key) {
        let pipeline = compile_wgpu_toon_pipeline(state, scene, key, format);
        scene
            .mesh_pipeline_cache
            .insert(cache_key.clone(), pipeline);
    }
    cache_key
}

/// The full WGSL module source for a define key.
pub fn get_wgpu_toon_module_source_for_key(key: &WgpuToonDefineKey) -> String {
    format!(
        "const ALPHA_MASK : bool = {};\n\
         const DOUBLE_SIDED : bool = {};\n\
         const HAS_BASE_COLOR_MAP : bool = {};\n\
         const HAS_RAMP : bool = {};\n\
         {}{}",
        bool_literal(key.alpha_mask_enabled),
        bool_literal(key.double_sided),
        bool_literal(key.has_base_color_map),
        bool_literal(key.has_ramp),
        WGPU_MESH_PRELUDE_WGSL,
        TOON_WGSL_BODY,
    )
}

const TOON_UNIFORM_BYTES: u64 = 32;

const TOON_WGSL_BODY: &str = r#"
struct ToonMaterial {
  baseColor : vec4f,  // linear rgba
  params : vec4f,     // x = steps, y = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : ToonMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var baseColorTexture : texture_2d<f32>;
@group(2) @binding(3) var rampTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) isFront : bool) -> @location(0) vec4f {
  var baseColor = material.baseColor;
  if (HAS_BASE_COLOR_MAP) {
    let sampled = textureSample(baseColorTexture, materialSampler, in.uv);
    baseColor = vec4f(baseColor.rgb * srgbToLinear(sampled.rgb), baseColor.a * sampled.a);
  }

  if (ALPHA_MASK && baseColor.a < material.params.y) {
    discard;
  }

  var normal = normalize(in.worldNormal);
  // Double-sided materials flip the normal for back faces so both sides shade correctly.
  if (DOUBLE_SIDED && !isFront) {
    normal = -normal;
  }

  var radiance = vec3f(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction). The
  // raw N·L is quantized into cel bands — a 1D ramp lookup when bound, else a stepped floor over steps —
  // then scales the base color and the directional radiance.
  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let nDotL = clamp(dot(normal, lightDir), 0.0, 1.0);
    if (HAS_RAMP) {
      let band = textureSample(rampTexture, materialSampler, vec2f(nDotL, 0.5)).rgb;
      radiance = radiance + baseColor.rgb * band * frame.directionalRadiance.rgb;
    } else {
      let steps = material.params.x;
      let band = floor(nDotL * steps) / max(steps, 1.0);
      radiance = radiance + baseColor.rgb * band * frame.directionalRadiance.rgb;
    }
  }

  // Ambient term: flat irradiance over the base color (unbanded).
  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + baseColor.rgb * frame.ambientRadiance.rgb;
  }

  return vec4f(radiance, baseColor.a);
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

    mod build_wgpu_toon_define_key {
        use super::*;

        #[test]
        fn encodes_each_flag_as_a_stable_char_slot() {
            assert_eq!(
                build_wgpu_toon_define_key(&WgpuToonDefineKey::default()),
                "----"
            );
            let key = WgpuToonDefineKey {
                alpha_mask_enabled: true,
                double_sided: true,
                has_base_color_map: true,
                has_ramp: true,
            };
            assert_eq!(build_wgpu_toon_define_key(&key), "mdbr");
        }
    }

    mod get_wgpu_toon_module_source_for_key {
        use super::*;

        #[test]
        fn emits_the_const_flag_block_and_the_stepped_quantizer_body() {
            let source = get_wgpu_toon_module_source_for_key(&WgpuToonDefineKey::default());
            assert!(source.contains("const ALPHA_MASK : bool = false;"));
            assert!(source.contains("const HAS_RAMP : bool = false;"));
            // The shared prelude + the toon body are both present.
            assert!(source.contains("fn srgbToLinear"));
            assert!(source.contains("let band = floor(nDotL * steps)"));
            assert!(source.contains("struct ToonMaterial"));
        }

        #[test]
        fn flips_the_flag_literals_for_an_enabled_key() {
            let key = WgpuToonDefineKey {
                alpha_mask_enabled: true,
                double_sided: true,
                has_base_color_map: true,
                has_ramp: true,
            };
            let source = get_wgpu_toon_module_source_for_key(&key);
            assert!(source.contains("const ALPHA_MASK : bool = true;"));
            assert!(source.contains("const HAS_RAMP : bool = true;"));
        }
    }
}
