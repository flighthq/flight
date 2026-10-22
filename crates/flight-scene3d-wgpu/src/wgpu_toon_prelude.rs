// flight-lint: allow-file(contract-vocabulary) D17: the toon family seams take and return native wgpu values
//! The Wgpu toon (cel-shading) prelude (TS `wgpuToonPrelude.ts`): the material bind group and uniform,
//! the define key, the pipeline compiler and cache (with the shared group(3) shadow layout), and the
//! WGSL module quantizing N·L into stepped bands. Maps are not sampled on wgpu yet, so both texture
//! slots bind the placeholder.

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
    WGPU_DIRECTIONAL_SHADOW_WGSL, create_wgpu_mesh_pipeline, ensure_wgpu_placeholder_texture_view,
    ensure_wgpu_scene3d_pipeline, ensure_wgpu_shadow_sample_layout, get_wgpu_mesh_prelude_wgsl,
    stash_wgpu_uv_transform,
};
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_skinning_adapter};

// Toon material uniform: baseColor vec4f + params vec4f (x = steps, y = alphaCutoff) = 32 bytes.
const TOON_UNIFORM_BYTES: u64 = 32;

/// Ensures (and caches per material key) the toon material bind group (uniform + the shared linear
/// sampler + placeholder base-color and ramp textures) and rewrites its uniform with the linear base
/// color, step count and alpha cutoff (TS `bindWgpuToonSurface`). Stashes the identity uv transform.
pub fn bind_wgpu_toon_surface(
    state: &mut WgpuRenderState,
    pipeline: &WgpuToonPipeline,
    material_key: u64,
    base_color: &[f32; 4],
    steps: f32,
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
                TOON_UNIFORM_BYTES,
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
                    wgpu::BindGroupEntry {
                        binding: 3,
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

    let values = [
        base_color[0],
        base_color[1],
        base_color[2],
        base_color[3],
        steps,
        alpha_cutoff,
        0.0,
        0.0,
    ];
    write_wgpu_buffer(&native, &binding.buffer, 0, bytemuck::cast_slice(&values));
    stash_wgpu_uv_transform(state, None);
    return binding.bind_group;
}

/// The stable string identity of a toon define key (TS `buildWgpuToonDefineKey`).
pub fn build_wgpu_toon_define_key(key: &WgpuToonDefineKey) -> String {
    return format!(
        "{}{}{}{}",
        if key.alpha_mask_enabled { "m" } else { "-" },
        if key.double_sided { "d" } else { "-" },
        if key.has_base_color_map { "b" } else { "-" },
        if key.has_ramp { "r" } else { "-" }
    );
}

/// Compiles the toon module for a define key and builds its pipeline for `format` with the group(2)
/// layout (uniform + sampler + base-color + ramp textures) and the shared group(3) shadow layout,
/// uncached (TS `compileWgpuToonPipeline`).
pub fn compile_wgpu_toon_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuToonDefineKey,
    format: wgpu::TextureFormat,
    blended: Option<bool>,
    skinned: Option<bool>,
) -> WgpuToonPipeline {
    let skinned = skinned.unwrap_or(false);
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let module = create_wgpu_shader_module(
        &native,
        &get_wgpu_toon_module_source_for_key(key, Some(skinned), skinning),
    );
    let material_bind_group_layout = create_wgpu_bind_group_layout(
        &native,
        &[
            uniform_layout_entry(0),
            filtering_sampler_layout_entry(1),
            float_texture_layout_entry(2),
            float_texture_layout_entry(3),
        ],
    );
    // The group(3) shadow-sample layout opts toon into directional shadow reception.
    let shadow_bind_group_layout = ensure_wgpu_shadow_sample_layout(state);
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
            shadow_bind_group_layout: Some(shadow_bind_group_layout),
            skinned: Some(skinned),
            topology: None,
        },
    );
}

/// Resolves the toon pipeline for a define key and color format through the shared scene pipeline
/// cache under the `toon:` namespace (TS `ensureWgpuToonPipeline`).
pub fn ensure_wgpu_toon_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuToonDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuToonPipeline {
    let cache_key = format!(
        "toon:{}|{}",
        get_wgpu_texture_format_name(format),
        build_wgpu_toon_define_key(key)
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, &mut |state, blended, skinned| {
        return compile_wgpu_toon_pipeline(state, key, format, Some(blended), Some(skinned));
    });
}

/// The full WGSL module for a define key: the const flags, the shared mesh prelude and the toon
/// material block (with the directional-shadow sampling) and `fs_main` (TS
/// `getWgpuToonModuleSourceForKey`).
pub fn get_wgpu_toon_module_source_for_key(
    key: &WgpuToonDefineKey,
    skinned: Option<bool>,
    skinning: Option<&WgpuSkinningAdapter>,
) -> String {
    return format!(
        "const ALPHA_MASK : bool = {};\nconst DOUBLE_SIDED : bool = {};\nconst HAS_BASE_COLOR_MAP : bool = {};\nconst HAS_RAMP : bool = {};\n{}{}{}{}{}",
        key.alpha_mask_enabled,
        key.double_sided,
        key.has_base_color_map,
        key.has_ramp,
        get_wgpu_mesh_prelude_wgsl(skinned.unwrap_or(false), skinning),
        WGPU_MESH_FRAGMENT_TAIL,
        TOON_WGSL_HEAD,
        WGPU_DIRECTIONAL_SHADOW_WGSL,
        TOON_WGSL_FRAGMENT
    );
}

// The toon material struct and bindings, ahead of the shared directional-shadow block.
const TOON_WGSL_HEAD: &str = r#"
struct ToonMaterial {
  baseColor : vec4f,  // linear rgba
  params : vec4f,     // x = steps, y = alphaCutoff
};

@group(2) @binding(0) var<uniform> material : ToonMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var baseColorTexture : texture_2d<f32>;
@group(2) @binding(3) var rampTexture : texture_2d<f32>;

"#;

// The toon fragment stage, after the shared directional-shadow block.
const TOON_WGSL_FRAGMENT: &str = r#"

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) isFront : bool) -> @location(0) vec4f {
  var baseColor = material.baseColor * in.instanceColor;
  if (HAS_BASE_COLOR_MAP) {
    let sampled = textureSample(baseColorTexture, materialSampler, in.uv);
    baseColor = vec4f(baseColor.rgb * sampled.rgb, baseColor.a * sampled.a);
  }

  if (ALPHA_MASK && baseColor.a < material.params.y) {
    discard;
  }
  if (ALPHA_MASK) {
    baseColor.a = 1.0;
  }

  var normal = normalize(in.worldNormal);
  // Double-sided materials flip the normal for back faces so both sides shade correctly.
  if (DOUBLE_SIDED && !isFront) {
    normal = -normal;
  }

  var radiance = vec3f(0.0);

  // Directional light: -direction is the surface-to-light vector (light travels along direction). The
  // raw N·L is quantized into cel bands — a 1D ramp lookup when bound, else a stepped floor over steps —
  // then scales the base color and the directional radiance. The banded contribution is shadow-mapped
  // like the classic/PBR directional term; sampleDirectionalShadow is 1.0 when no map is bound.
  if (frame.lightDirection.w > 0.5) {
    let lightDir = normalize(-frame.lightDirection.xyz);
    let nDotL = clamp(dot(normal, lightDir), 0.0, 1.0);
    var direct = vec3f(0.0);
    if (HAS_RAMP) {
      let band = textureSample(rampTexture, materialSampler, vec2f(nDotL, 0.5)).rgb;
      direct = baseColor.rgb * band * frame.directionalRadiance.rgb;
    } else {
      let steps = material.params.x;
      let band = floor(nDotL * steps) / max(steps, 1.0);
      direct = baseColor.rgb * band * frame.directionalRadiance.rgb;
    }
    radiance = radiance + direct * sampleDirectionalShadow(in.worldPosition, normal);
  }

  // Ambient term: flat irradiance over the base color (unbanded).
  if (frame.ambientRadiance.w > 0.5) {
    radiance = radiance + baseColor.rgb * frame.ambientRadiance.rgb;
  }

  return flightPremultipliedOutput(vec4f(radiance, flightMeshCoverage(baseColor.a, in.objectAlpha, draw.params.y)));
}
"#;
