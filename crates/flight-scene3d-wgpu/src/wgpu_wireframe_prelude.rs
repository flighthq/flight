use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};

use crate::types::{WgpuMaterialBinding, WgpuMeshPipeline, WgpuSkinningAdapter};
use crate::wgpu_mesh_fragment_tail::WGPU_MESH_FRAGMENT_TAIL;
use crate::wgpu_mesh_pipeline::{
    create_wgpu_mesh_pipeline, ensure_wgpu_scene3d_pipeline, get_wgpu_mesh_prelude_wgsl,
    stash_wgpu_uv_transform, CreateWgpuMeshPipelineOptions,
};
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime_mut, get_wgpu_skinning_adapter};

const WIREFRAME_UNIFORM_BYTES: u64 = 32;

pub fn bind_wgpu_wireframe_color(
    state: &WgpuRenderState,
    pipeline: &WgpuMeshPipeline,
    material_id: u64,
    color: &[f32; 4],
    alpha_cutoff: f32,
) -> wgpu::BindGroup {
    let native = get_wgpu_render_state_native_device(state);
    let bind_group = get_wgpu_scene3d_runtime_mut(state, |rt| {
        let binding = rt
            .shaded_material_binding_cache
            .entry(material_id)
            .or_insert_with(|| {
                let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("wireframe_material_uniform"),
                    size: WIREFRAME_UNIFORM_BYTES,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });
                let bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("wireframe_material_bind_group"),
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

        let data: [f32; 8] = [color[0], color[1], color[2], color[3], alpha_cutoff, 0.0, 0.0, 0.0];
        native.queue.write_buffer(&binding.buffer, 0, f32_as_bytes(&data));
        return binding.bind_group.clone();
    });
    stash_wgpu_uv_transform(state, None);
    return bind_group;
}

pub fn compile_wgpu_wireframe_pipeline(
    state: &WgpuRenderState,
    format: wgpu::TextureFormat,
    blended: bool,
    alpha_mask_enabled: bool,
    skinned: bool,
) -> WgpuMeshPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state);
    let source = get_wgpu_wireframe_module_source(alpha_mask_enabled, skinned, skinning.as_deref());
    let module = native.device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("wireframe_shader"),
        source: wgpu::ShaderSource::Wgsl(source.into()),
    });
    let material_bind_group_layout =
        native
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("wireframe_material_layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });
    return create_wgpu_mesh_pipeline(
        state,
        &CreateWgpuMeshPipelineOptions {
            extra_bind_group_layout: None,
            blended,
            double_sided: true,
            format,
            material_bind_group_layout: &material_bind_group_layout,
            module: &module,
            shadow_bind_group_layout: None,
            pbr_sample_bind_group_layout: None,
            ibl_bind_group_layout: None,
            skinned,
            topology: Some(wgpu::PrimitiveTopology::LineList),
        },
    );
}

pub fn ensure_wgpu_wireframe_pipeline(
    state: &WgpuRenderState,
    format: wgpu::TextureFormat,
    alpha_mask_enabled: bool,
) -> WgpuMeshPipeline {
    let cache_key = format!(
        "wireframe:{:?}|{}",
        format,
        if alpha_mask_enabled { "mask" } else { "base" }
    );
    return ensure_wgpu_scene3d_pipeline(state, &cache_key, |blended, skinned| {
        return compile_wgpu_wireframe_pipeline(state, format, blended, alpha_mask_enabled, skinned);
    });
}

fn f32_as_bytes(data: &[f32]) -> &[u8] {
    return unsafe {
        std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), std::mem::size_of_val(data))
    };
}

pub fn get_wgpu_wireframe_module_source(
    alpha_mask_enabled: bool,
    skinned: bool,
    skinning: Option<&dyn WgpuSkinningAdapter>,
) -> String {
    return format!(
        "const ALPHA_MASK : bool = {};\n{}\n{}\n{}",
        alpha_mask_enabled,
        get_wgpu_mesh_prelude_wgsl(skinned, skinning),
        WGPU_MESH_FRAGMENT_TAIL,
        WIREFRAME_WGSL_BODY,
    );
}

const WIREFRAME_WGSL_BODY: &str = r#"
struct WireframeMaterial {
  color : vec4f,
  params : vec4f,
};

@group(2) @binding(0) var<uniform> material : WireframeMaterial;

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  if (ALPHA_MASK && material.color.a < material.params.x) {
    discard;
  }
  return flightPremultipliedOutput(vec4f(material.color.rgb, flightMeshCoverage(material.color.a, in.objectAlpha, draw.params.y)));
}
"#;
