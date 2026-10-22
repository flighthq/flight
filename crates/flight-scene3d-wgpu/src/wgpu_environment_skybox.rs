use std::collections::HashMap;

use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};

use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

const SKYBOX_DEPTH_STENCIL_FORMAT: wgpu::TextureFormat =
    wgpu::TextureFormat::Depth24PlusStencil8;

const SKYBOX_UNIFORM_BYTES: u64 = 80;

pub struct WgpuSkybox {
    pub cube_bind_group: Option<wgpu::BindGroup>,
    pub cube_bind_group_layout: wgpu::BindGroupLayout,
    pub cube_view: Option<wgpu::TextureView>,
    pub pipeline: wgpu::RenderPipeline,
    pub sampler: wgpu::Sampler,
    pub uniform_bind_group: wgpu::BindGroup,
    pub uniform_buffer: wgpu::Buffer,
}

pub fn ensure_wgpu_skybox_pipeline(
    state: &WgpuRenderState,
    format: wgpu::TextureFormat,
) -> WgpuSkybox {
    let native_device = get_wgpu_render_state_native_device(state);
    let device = &native_device.device;

    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("skybox"),
        source: wgpu::ShaderSource::Wgsl(SKYBOX_WGSL.into()),
    });

    let uniform_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("skybox_uniform"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

    let cube_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("skybox_cube"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::Cube,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

    let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("skybox"),
        bind_group_layouts: &[Some(&uniform_bind_group_layout), Some(&cube_bind_group_layout)],
        immediate_size: 0,
    });

    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("skybox"),
        layout: Some(&layout),
        vertex: wgpu::VertexState {
            module: &module,
            entry_point: Some("vs_main"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &module,
            entry_point: Some("fs_main"),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: SKYBOX_DEPTH_STENCIL_FORMAT,
            depth_write_enabled: Some(false),
            depth_compare: Some(wgpu::CompareFunction::Always),
            stencil: Default::default(),
            bias: Default::default(),
        }),
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });

    let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("skybox_uniform"),
        size: SKYBOX_UNIFORM_BYTES,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let uniform_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("skybox_uniform"),
        layout: &uniform_bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: uniform_buffer.as_entire_binding(),
        }],
    });

    let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        ..Default::default()
    });

    return WgpuSkybox {
        cube_bind_group: None,
        cube_bind_group_layout,
        cube_view: None,
        pipeline,
        sampler,
        uniform_bind_group,
        uniform_buffer,
    };
}

const SKYBOX_WGSL: &str = r#"
struct SkyUniform {
  inverseViewProjection : mat4x4f,
  params : vec4f,
};

@group(0) @binding(0) var<uniform> sky : SkyUniform;
@group(1) @binding(0) var envCube : texture_cube<f32>;
@group(1) @binding(1) var envSampler : sampler;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) ndc : vec2f,
};

@vertex fn vs_main(@builtin(vertex_index) vi : u32) -> VertexOutput {
  var out : VertexOutput;
  let x = f32((vi & 1u) << 2u) - 1.0;
  let y = f32((vi & 2u) << 1u) - 1.0;
  out.ndc = vec2f(x, y);
  out.clipPosition = vec4f(x, y, 1.0, 1.0);
  return out;
}

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  let nearW = sky.inverseViewProjection * vec4f(in.ndc, -1.0, 1.0);
  let farW = sky.inverseViewProjection * vec4f(in.ndc, 1.0, 1.0);
  let dir = normalize(farW.xyz / farW.w - nearW.xyz / nearW.w);
  let color = textureSampleLevel(envCube, envSampler, dir, 0.0).rgb * sky.params.x;
  return vec4f(color, 1.0);
}
"#;
