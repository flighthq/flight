use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};

use crate::types::{
    WgpuMatcapDefineKey, WgpuMaterialBinding, WgpuMeshPipeline, WgpuSkinningAdapter,
};
use crate::wgpu_mesh_fragment_tail::WGPU_MESH_FRAGMENT_TAIL;
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_scene3d_pipeline, get_wgpu_mesh_prelude_wgsl,
    stash_wgpu_uv_transform, CreateWgpuMeshPipelineOptions,
};
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime_mut, get_wgpu_skinning_adapter};

const MATCAP_UNIFORM_BYTES: u64 = 32;

pub fn bind_wgpu_matcap_surface(
    state: &WgpuRenderState,
    pipeline: &WgpuMeshPipeline,
    material_id: u64,
    tint: &[f32; 4],
    alpha_cutoff: f32,
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let bind_group = get_wgpu_scene3d_runtime_mut(state, |rt| {
        let binding = rt
            .shaded_material_binding_cache
            .entry(material_id)
            .or_insert_with(|| {
                let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("matcap_material_uniform"),
                    size: MATCAP_UNIFORM_BYTES,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
                let bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("matcap_material_bind_group"),
                    layout: &pipeline.material_bind_group_layout,
                    entries: &[wgpu::BindGroupEntry {
                        binding: 0,
                        resource: buffer.as_entire_binding(),
                    }],
                });
                WgpuMaterialBinding {
                    bind_group,
                    buffer,
                    sampler: None,
                    samplers: None,
                    views: None,
                }
            });

        let data: [f32; 8] = [
            tint[0], tint[1], tint[2], tint[3], alpha_cutoff, 0.0, 0.0, 0.0,
        ];
        native
            .queue
            .write_buffer(&binding.buffer, 0, f32_as_bytes(&data));
        return binding.bind_group.clone();
    });
    stash_wgpu_uv_transform(state, None);
    return bind_group;
}

pub fn build_wgpu_matcap_define_key(key: &WgpuMatcapDefineKey) -> String {
    return format!(
        "{}{}{}",
        if key.has_alpha_mask { 'm' } else { '-' },
        if key.has_normal_map { 'n' } else { '-' },
        if key.has_matcap_map { 't' } else { '-' },
    );
}

pub fn compile_wgpu_matcap_pipeline(
    state: &WgpuRenderState,
    key: &WgpuMatcapDefineKey,
    format: wgpu::TextureFormat,
    blended: bool,
    skinned: bool,
) -> WgpuMeshPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let source = get_wgpu_matcap_module_source_for_key(key, skinned, skinning.as_deref());
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("matcap_shader"),
            source: wgpu::ShaderSource::Wgsl(source.into()),
        });
    let material_bind_group_layout =
        native
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("matcap_material_layout"),
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
            double_sided: false,
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

pub fn ensure_wgpu_matcap_pipeline(
    state: &WgpuRenderState,
    key: &WgpuMatcapDefineKey,
    format: wgpu::TextureFormat,
) -> WgpuMeshPipeline {
    let cache_key = format!(
        "matcap:{:?}|{}",
        format,
        build_wgpu_matcap_define_key(key)
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, |blended, skinned| {
        return compile_wgpu_matcap_pipeline(state, key, format, blended, skinned);
    });
}

fn f32_as_bytes(data: &[f32]) -> &[u8] {
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

pub fn get_wgpu_matcap_module_source_for_key(
    key: &WgpuMatcapDefineKey,
    skinned: bool,
    skinning: Option<&dyn WgpuSkinningAdapter>,
) -> String {
    return format!(
        "const ALPHA_MASK : bool = {};\nconst HAS_MATCAP : bool = {};\n{}\n{}\n{}",
        key.has_alpha_mask,
        key.has_matcap_map,
        get_wgpu_mesh_prelude_wgsl(skinned, skinning),
        WGPU_MESH_FRAGMENT_TAIL,
        MATCAP_WGSL_BODY,
    );
}

const MATCAP_WGSL_BODY: &str = r#"
struct MatcapMaterial {
  tint : vec4f,
  params : vec4f,
};

@group(2) @binding(0) var<uniform> material : MatcapMaterial;
@group(2) @binding(1) var materialSampler : sampler;
@group(2) @binding(2) var matcapTexture : texture_2d<f32>;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  var color = material.tint * in.instanceColor;
  if (HAS_MATCAP) {
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
