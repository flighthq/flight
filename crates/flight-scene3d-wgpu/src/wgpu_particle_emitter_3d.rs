use std::collections::HashMap;

use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};

const INSTANCE_FLOATS: usize = 16;
const INSTANCE_STRIDE: u64 = (INSTANCE_FLOATS * 4) as u64;
const FRAME_UNIFORM_BYTES: u64 = 96;
const DEPTH_STENCIL_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24PlusStencil8;

pub struct WgpuParticle3DResources {
    pub corner_buffer: wgpu::Buffer,
    pub frame_bind_group: wgpu::BindGroup,
    pub frame_buffer: wgpu::Buffer,
    pub frame_layout: wgpu::BindGroupLayout,
    pub index_buffer: wgpu::Buffer,
    pub module: wgpu::ShaderModule,
    pub pipeline_layout: wgpu::PipelineLayout,
    pub pipelines: HashMap<String, wgpu::RenderPipeline>,
    pub texture_layout: wgpu::BindGroupLayout,
}

pub fn create_wgpu_particle_3d_resources(state: &WgpuRenderState) -> WgpuParticle3DResources {
    let native_device = get_wgpu_render_state_native_device(state);
    let device = &native_device.device;
    let queue = &native_device.queue;

    let corner_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("particle_corner"),
        size: 8 * 4,
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let corner_data: [f32; 8] = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
    queue.write_buffer(&corner_buffer, 0, unsafe { std::slice::from_raw_parts(corner_data.as_ptr() as *const u8, std::mem::size_of_val(&corner_data)) });

    let index_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("particle_index"),
        size: 6 * 2,
        usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let index_data: [u16; 6] = [0, 1, 2, 0, 2, 3];
    queue.write_buffer(&index_buffer, 0, unsafe { std::slice::from_raw_parts(index_data.as_ptr() as *const u8, std::mem::size_of_val(&index_data)) });

    let frame_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("particle_frame"),
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
    });
    let texture_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("particle_texture"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    view_dimension: wgpu::TextureViewDimension::D2,
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
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("particle"),
        bind_group_layouts: &[Some(&frame_layout), Some(&texture_layout)],
        immediate_size: 0,
    });

    let frame_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("particle_frame_uniform"),
        size: FRAME_UNIFORM_BYTES,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let frame_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("particle_frame"),
        layout: &frame_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: frame_buffer.as_entire_binding(),
        }],
    });

    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("particle_3d"),
        source: wgpu::ShaderSource::Wgsl(PARTICLE_3D_WGSL.into()),
    });

    return WgpuParticle3DResources {
        corner_buffer,
        frame_bind_group,
        frame_buffer,
        frame_layout,
        index_buffer,
        module,
        pipeline_layout,
        pipelines: HashMap::new(),
        texture_layout,
    };
}

pub fn ensure_wgpu_particle_3d_pipeline<'a>(
    resources: &'a mut WgpuParticle3DResources,
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    blend_state: wgpu::BlendState,
    blend_key: &str,
    has_texture: bool,
) -> &'a wgpu::RenderPipeline {
    let key = format!(
        "{}|{}|{}",
        format_texture_format(format),
        blend_key,
        if has_texture { "t" } else { "u" },
    );

    if !resources.pipelines.contains_key(&key) {
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("particle_3d"),
            layout: Some(&resources.pipeline_layout),
            vertex: wgpu::VertexState {
                module: &resources.module,
                entry_point: Some("vs_main"),
                buffers: &vertex_buffer_layouts().into_iter().map(|v| Some(v)).collect::<Vec<_>>(),
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &resources.module,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(blend_state),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: DEPTH_STENCIL_FORMAT,
                depth_write_enabled: Some(false),
                depth_compare: Some(wgpu::CompareFunction::Less),
                stencil: Default::default(),
                bias: Default::default(),
            }),
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        resources.pipelines.insert(key.clone(), pipeline);
    }
    return resources.pipelines.get(&key).unwrap();
}

fn format_texture_format(format: wgpu::TextureFormat) -> String {
    return format!("{:?}", format);
}

fn vertex_buffer_layouts() -> Vec<wgpu::VertexBufferLayout<'static>> {
    return vec![
        wgpu::VertexBufferLayout {
            array_stride: 8,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[wgpu::VertexAttribute {
                shader_location: 0,
                offset: 0,
                format: wgpu::VertexFormat::Float32x2,
            }],
        },
        wgpu::VertexBufferLayout {
            array_stride: INSTANCE_STRIDE,
            step_mode: wgpu::VertexStepMode::Instance,
            attributes: &[
                wgpu::VertexAttribute {
                    shader_location: 1,
                    offset: 0,
                    format: wgpu::VertexFormat::Float32x3,
                },
                wgpu::VertexAttribute {
                    shader_location: 2,
                    offset: 12,
                    format: wgpu::VertexFormat::Float32,
                },
                wgpu::VertexAttribute {
                    shader_location: 3,
                    offset: 16,
                    format: wgpu::VertexFormat::Float32,
                },
                wgpu::VertexAttribute {
                    shader_location: 4,
                    offset: 20,
                    format: wgpu::VertexFormat::Float32x4,
                },
                wgpu::VertexAttribute {
                    shader_location: 5,
                    offset: 36,
                    format: wgpu::VertexFormat::Float32x4,
                },
                wgpu::VertexAttribute {
                    shader_location: 6,
                    offset: 52,
                    format: wgpu::VertexFormat::Float32x2,
                },
            ],
        },
    ];
}

pub const PARTICLE_3D_WGSL: &str = r#"
override HAS_TEXTURE : f32 = 0.0;

struct Frame {
  viewProjection : mat4x4f,
  cameraRight : vec4f,
  cameraUp : vec4f,
};

@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var particleTexture : texture_2d<f32>;
@group(1) @binding(1) var particleSampler : sampler;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) uv : vec2f,
  @location(1) color : vec4f,
};

@vertex fn vs_main(
  @location(0) corner : vec2f,
  @location(1) pos : vec3f,
  @location(2) cosScale : f32,
  @location(3) sinScale : f32,
  @location(4) color : vec4f,
  @location(5) uvRect : vec4f,
  @location(6) size : vec2f,
) -> VertexOutput {
  var out : VertexOutput;
  let clockwise = size.x < 0.0;
  let counterclockwise = size.y < 0.0;
  let lx = (corner.x - 0.5) * abs(size.x);
  let ly = (corner.y - 0.5) * abs(size.y);
  let rx = cosScale * lx - sinScale * ly;
  let ry = sinScale * lx + cosScale * ly;
  let worldPos = pos + frame.cameraRight.xyz * rx + frame.cameraUp.xyz * ry;
  out.clipPosition = frame.viewProjection * vec4f(worldPos, 1.0);
  var u = select(uvRect.x, uvRect.z, corner.x > 0.5);
  var v = select(uvRect.y, uvRect.w, corner.y > 0.5);
  if (clockwise) {
    u = select(uvRect.z, uvRect.x, corner.y > 0.5);
    v = select(uvRect.y, uvRect.w, corner.x > 0.5);
  } else if (counterclockwise) {
    u = select(uvRect.x, uvRect.z, corner.y > 0.5);
    v = select(uvRect.w, uvRect.y, corner.x > 0.5);
  }
  out.uv = vec2f(u, v);
  out.color = color;
  return out;
}

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  var rgba : vec4f;
  if (HAS_TEXTURE > 0.5) {
    let tex = textureSample(particleTexture, particleSampler, in.uv);
    let alpha = tex.a * in.color.a;
    rgba = vec4f(tex.rgb * in.color.rgb * alpha, alpha);
  } else {
    let alpha = in.color.a;
    rgba = vec4f(in.color.rgb * alpha, alpha);
  }
  if (rgba.a <= 0.0) { discard; }
  return rgba;
}
"#;
