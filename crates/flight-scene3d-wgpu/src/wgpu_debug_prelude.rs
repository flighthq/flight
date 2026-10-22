// flight-lint: allow-file(contract-vocabulary) D17: the debug family seams take and return native wgpu values
//! The Wgpu debug prelude (TS `wgpuDebugPrelude.ts`): one module serving the Depth (eye-space depth
//! as grayscale) and Normal (world-space normal as color) utility materials, selected by a `MODE`
//! const. The normal-map branch stays inert on wgpu until map upload lands.

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

// Debug material uniform: params vec4f (x = near, y = far, z = normalScale) = 16 bytes.
const DEBUG_UNIFORM_BYTES: u64 = 16;

/// Ensures (and caches per material key) the debug material bind group (uniform + the shared linear
/// sampler + the placeholder texture) and rewrites its uniform with near/far (depth mode) and
/// normalScale (normal mode) (TS `bindWgpuDebugSurface`). Stashes the identity uv transform.
pub fn bind_wgpu_debug_surface(
    state: &mut WgpuRenderState,
    pipeline: &WgpuDebugPipeline,
    material_key: u64,
    near: f32,
    far: f32,
    normal_scale: f32,
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
                DEBUG_UNIFORM_BYTES,
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

    let values = [near, far, normal_scale, 0.0];
    write_wgpu_buffer(&native, &binding.buffer, 0, bytemuck::cast_slice(&values));
    stash_wgpu_uv_transform(state, None);
    return binding.bind_group;
}

/// The stable string identity of a debug define key: `d` depth or `n` normal, then `m` for a normal
/// map (TS `buildWgpuDebugDefineKey`).
pub fn build_wgpu_debug_define_key(key: &WgpuDebugDefineKey) -> String {
    return format!(
        "{}{}",
        if key.mode == WgpuDebugMode::Depth {
            "d"
        } else {
            "n"
        },
        if key.has_normal_map { "m" } else { "-" }
    );
}

/// Compiles the debug module for a define key and builds its pipeline for `format` with the group(2)
/// layout (uniform + sampler + one texture), uncached (TS `compileWgpuDebugPipeline`).
pub fn compile_wgpu_debug_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuDebugDefineKey,
    format: wgpu::TextureFormat,
    blended: Option<bool>,
    double_sided: Option<bool>,
    skinned: Option<bool>,
) -> WgpuDebugPipeline {
    let skinned = skinned.unwrap_or(false);
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let module = create_wgpu_shader_module(
        &native,
        &get_wgpu_debug_module_source_for_key(key, Some(skinned), skinning),
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
            double_sided: double_sided.unwrap_or(false),
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

/// Resolves the debug pipeline for a define key, color format and cull choice through the shared
/// scene pipeline cache under the `debug:` namespace (TS `ensureWgpuDebugPipeline`).
pub fn ensure_wgpu_debug_pipeline(
    state: &mut WgpuRenderState,
    key: &WgpuDebugDefineKey,
    format: wgpu::TextureFormat,
    double_sided: Option<bool>,
) -> WgpuDebugPipeline {
    let double_sided = double_sided.unwrap_or(false);
    let cache_key = format!(
        "debug:{}|{}|{}",
        get_wgpu_texture_format_name(format),
        build_wgpu_debug_define_key(key),
        if double_sided { "double" } else { "single" }
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, &mut |state, blended, skinned| {
        return compile_wgpu_debug_pipeline(
            state,
            key,
            format,
            Some(blended),
            Some(double_sided),
            Some(skinned),
        );
    });
}

/// The full WGSL module for a define key: the MODE discriminator and normal-map flag, the mode
/// constants, the shared mesh prelude and the debug material block with `fs_main` (TS
/// `getWgpuDebugModuleSourceForKey`).
pub fn get_wgpu_debug_module_source_for_key(
    key: &WgpuDebugDefineKey,
    skinned: Option<bool>,
    skinning: Option<&WgpuSkinningAdapter>,
) -> String {
    return format!(
        "const MODE : i32 = {};\nconst HAS_NORMAL_MAP : bool = {};\n{}{}{}{}",
        if key.mode == WgpuDebugMode::Depth {
            "DEPTH_MODE"
        } else {
            "NORMAL_MODE"
        },
        key.has_normal_map,
        DEBUG_MODE_CONSTS_WGSL,
        get_wgpu_mesh_prelude_wgsl(skinned.unwrap_or(false), skinning),
        WGPU_MESH_FRAGMENT_TAIL,
        DEBUG_WGSL_BODY
    );
}

// The two mode discriminator values the module's MODE const names.
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
    // Positive distance along the camera's view axis, computed before projection so perspective and
    // orthographic cameras agree. frame.view is already part of the shared Frame uniform and
    // in.worldPosition is the post-skin, post-instance position, matching the GL depth path exactly.
    let near = material.params.x;
    let far = material.params.y;
    let eyeDepth = -(frame.view * vec4f(in.worldPosition, 1.0)).z;
    let d = clamp((eyeDepth - near) / max(far - near, 1e-6), 0.0, 1.0);
    return flightPremultipliedOutput(vec4f(vec3f(d), flightMeshCoverage(1.0, in.objectAlpha, draw.params.y)));
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

  return flightPremultipliedOutput(vec4f(normal * 0.5 + 0.5, flightMeshCoverage(1.0, in.objectAlpha, draw.params.y)));
}
"#;
