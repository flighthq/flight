use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};

use crate::types::{
    WgpuDebugDefineKey, WgpuDebugMode, WgpuMaterialBinding, WgpuMeshPipeline, WgpuSkinningAdapter,
};
use crate::wgpu_mesh_fragment_tail::WGPU_MESH_FRAGMENT_TAIL;
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_scene3d_pipeline, get_wgpu_mesh_prelude_wgsl,
    stash_wgpu_uv_transform, CreateWgpuMeshPipelineOptions,
};
use crate::wgpu_scene3d_runtime::{
    get_wgpu_scene3d_runtime_mut, get_wgpu_skinning_adapter,
};

const DEBUG_UNIFORM_BYTES: u64 = 16;

pub fn bind_wgpu_debug_surface(
    state: &WgpuRenderState,
    pipeline: &WgpuMeshPipeline,
    material_id: u64,
    near: f32,
    far: f32,
    normal_scale: f32,
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let bind_group = get_wgpu_scene3d_runtime_mut(state, |rt| {
        let binding = rt
            .shaded_material_binding_cache
            .entry(material_id)
            .or_insert_with(|| {
                let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("debug_material_uniform"),
                    size: DEBUG_UNIFORM_BYTES,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
                let bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("debug_material_bind_group"),
                    layout: &pipeline.material_bind_group_layout,
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: buffer.as_entire_binding(),
                        },
                    ],
                });
                WgpuMaterialBinding {
                    bind_group,
                    buffer,
                    sampler: None,
                    samplers: None,
                    views: None,
                }
            });

        let data = [near, far, normal_scale, 0.0_f32];
        native.queue.write_buffer(&binding.buffer, 0, f32_as_bytes(&data));
        return binding.bind_group.clone();
    });
    stash_wgpu_uv_transform(state, None);
    return bind_group;
}

pub fn build_wgpu_debug_define_key(key: &WgpuDebugDefineKey) -> String {
    let mode_char = match key.mode {
        WgpuDebugMode::Depth => 'd',
        _ => 'n',
    };
    return format!("{}{}", mode_char, if key.has_normal_map { 'm' } else { '-' });
}

pub fn compile_wgpu_debug_pipeline(
    state: &WgpuRenderState,
    key: &WgpuDebugDefineKey,
    format: wgpu::TextureFormat,
    blended: bool,
    double_sided: bool,
    skinned: bool,
) -> WgpuMeshPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let source = get_wgpu_debug_module_source_for_key(key, skinned, skinning.as_deref());
    let module = native.device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("debug_shader"),
        source: wgpu::ShaderSource::Wgsl(source.into()),
    });
    let material_bind_group_layout =
        native
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("debug_material_layout"),
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
    return create_wgpu_mesh_pipeline(
        state,
        &CreateWgpuMeshPipelineOptions {
            extra_bind_group_layout: None,
            blended,
            double_sided,
            format,
            material_bind_group_layout: &material_bind_group_layout,
            module: &module,
            shadow_bind_group_layout: None,
            pbr_sample_bind_group_layout: None,
            ibl_bind_group_layout: None,
            skinned,
            topology: Some(wgpu::PrimitiveTopology::TriangleList),
        },
    );
}

pub fn ensure_wgpu_debug_pipeline(
    state: &WgpuRenderState,
    key: &WgpuDebugDefineKey,
    format: wgpu::TextureFormat,
    double_sided: bool,
) -> WgpuMeshPipeline {
    let cache_key = format!(
        "debug:{:?}|{}|{}",
        format,
        build_wgpu_debug_define_key(key),
        if double_sided { "double" } else { "single" }
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, |blended, skinned| {
        return compile_wgpu_debug_pipeline(state, key, format, blended, double_sided, skinned);
    });
}

fn f32_as_bytes(data: &[f32]) -> &[u8] {
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

pub fn get_wgpu_debug_module_source_for_key(
    key: &WgpuDebugDefineKey,
    skinned: bool,
    skinning: Option<&dyn WgpuSkinningAdapter>,
) -> String {
    let mode_const = match key.mode {
        WgpuDebugMode::Depth => "DEPTH_MODE",
        _ => "NORMAL_MODE",
    };
    return format!(
        "const MODE : i32 = {};\nconst HAS_NORMAL_MAP : bool = {};\n{}{}\n{}\n{}",
        mode_const,
        key.has_normal_map,
        DEBUG_MODE_CONSTS_WGSL,
        get_wgpu_mesh_prelude_wgsl(skinned, skinning),
        WGPU_MESH_FRAGMENT_TAIL,
        DEBUG_WGSL_BODY,
    );
}

const DEBUG_MODE_CONSTS_WGSL: &str = r#"
const DEPTH_MODE : i32 = 0;
const NORMAL_MODE : i32 = 1;
"#;

const DEBUG_WGSL_BODY: &str = r#"
struct DebugMaterial {
  params : vec4f,
};

@group(2) @binding(0) var<uniform> material : DebugMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var normalTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput, @builtin(front_facing) frontFacing : bool) -> @location(0) vec4f {
  if (MODE == DEPTH_MODE) {
    let near = material.params.x;
    let far = material.params.y;
    let eyeDepth = -(frame.view * vec4f(in.worldPosition, 1.0)).z;
    let d = clamp((eyeDepth - near) / max(far - near, 1e-6), 0.0, 1.0);
    return flightPremultipliedOutput(vec4f(vec3f(d), flightMeshCoverage(1.0, in.objectAlpha, draw.params.y)));
  }

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
