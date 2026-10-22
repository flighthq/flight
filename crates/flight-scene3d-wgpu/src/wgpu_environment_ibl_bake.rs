use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};
use flight_lighting::Environment;

use crate::types::WgpuScene3DIbl;
use crate::wgpu_environment_cube::ensure_wgpu_environment_source_cube;
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut};

const IRRADIANCE_SIZE: u32 = 16;
const PREFILTERED_SIZE: u32 = 64;
const PREFILTERED_MIPS: u32 = 5;
const BRDF_LUT_SIZE: u32 = 128;
const IBL_BAKE_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;
const BAKE_UNIFORM_BYTES: u64 = 64;

#[rustfmt::skip]
const CUBE_FACE_BASIS: [[f32; 9]; 6] = [
    [ 1.0, 0.0, 0.0,  0.0, 0.0,-1.0,  0.0,-1.0, 0.0], // +X
    [-1.0, 0.0, 0.0,  0.0, 0.0, 1.0,  0.0,-1.0, 0.0], // -X
    [ 0.0, 1.0, 0.0,  1.0, 0.0, 0.0,  0.0, 0.0, 1.0], // +Y
    [ 0.0,-1.0, 0.0,  1.0, 0.0, 0.0,  0.0, 0.0,-1.0], // -Y
    [ 0.0, 0.0, 1.0,  1.0, 0.0, 0.0,  0.0,-1.0, 0.0], // +Z
    [ 0.0, 0.0,-1.0, -1.0, 0.0, 0.0,  0.0,-1.0, 0.0], // -Z
];

pub fn destroy_wgpu_scene3d_ibl(state: &WgpuRenderState) {
    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.ibl = None;
        rt.environment_source_cube = None;
        rt.environment_source_cube_view = None;
        rt.ibl_sampler = None;
        rt.ibl_sample_layout = None;
        rt.ibl_sample_bind_group = None;
        rt.ibl_sample_cube_view = None;
        rt.ibl_dummy_cube_texture = None;
        rt.ibl_dummy_cube_view = None;
        rt.ibl_dummy_lut_texture = None;
        rt.ibl_dummy_lut_view = None;
        rt.ibl_uniform_buffer = None;
        rt.pbr_sample_bind_group = None;
        rt.pbr_sample_ibl_cube_view = None;
    });
}

pub fn bake_wgpu_environment_ibl(state: &WgpuRenderState, environment: &Environment) {
    if !ensure_wgpu_environment_source_cube(state, environment) {
        return;
    }

    let native_device = get_wgpu_render_state_native_device(state);
    let device = &native_device.device;
    let queue = &native_device.queue;

    let source_cube_view = get_wgpu_scene3d_runtime(state, |rt| {
        rt.environment_source_cube_view.clone()
    });
    let source_cube_view = match source_cube_view {
        Some(v) => v,
        None => return,
    };

    let programs = create_bake_programs(device);

    let source_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("ibl_source"),
        layout: &programs.source_bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&source_cube_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&programs.sampler),
            },
        ],
    });

    let irradiance = bake_irradiance(device, queue, &programs, &source_bind_group);
    let prefiltered = bake_prefiltered(device, queue, &programs, &source_bind_group);
    let brdf_lut = bake_brdf_lut(device, queue, &programs);
    let brdf_lut_view = brdf_lut.create_view(&Default::default());

    let irradiance_view = irradiance.create_view(&wgpu::TextureViewDescriptor {
        dimension: Some(wgpu::TextureViewDimension::Cube),
        ..Default::default()
    });
    let prefiltered_view = prefiltered.create_view(&wgpu::TextureViewDescriptor {
        dimension: Some(wgpu::TextureViewDimension::Cube),
        ..Default::default()
    });

    let ibl = WgpuScene3DIbl {
        brdf_lut,
        brdf_lut_view,
        intensity: environment.intensity,
        irradiance_cube: irradiance,
        irradiance_cube_view: irradiance_view,
        prefiltered_cube: prefiltered,
        prefiltered_cube_view: prefiltered_view,
        prefiltered_mip_count: PREFILTERED_MIPS,
    };

    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.ibl = Some(ibl);
    });
}

struct BakePrograms {
    brdf_pipeline: wgpu::RenderPipeline,
    irradiance_pipeline: wgpu::RenderPipeline,
    prefiltered_pipeline: wgpu::RenderPipeline,
    sampler: wgpu::Sampler,
    source_bind_group_layout: wgpu::BindGroupLayout,
    uniform_bind_group: wgpu::BindGroup,
    uniform_buffer: wgpu::Buffer,
}

fn create_bake_programs(device: &wgpu::Device) -> BakePrograms {
    let uniform_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("ibl_bake_uniform"),
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

    let source_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("ibl_bake_source"),
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

    let cube_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("ibl_bake_cube"),
        bind_group_layouts: &[Some(&uniform_bind_group_layout), Some(&source_bind_group_layout)],
        immediate_size: 0,
    });

    let brdf_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("ibl_bake_brdf"),
        bind_group_layouts: &[],
        immediate_size: 0,
    });

    let irradiance_source = format!("{}{}", BAKE_VERTEX_WGSL, IRRADIANCE_FRAGMENT_WGSL);
    let prefiltered_source = format!("{}{}", BAKE_VERTEX_WGSL, PREFILTERED_FRAGMENT_WGSL);
    let brdf_source = format!("{}{}", BAKE_VERTEX_WGSL, BRDF_LUT_FRAGMENT_WGSL);

    let irradiance_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("ibl_irradiance"),
        source: wgpu::ShaderSource::Wgsl(irradiance_source.into()),
    });
    let prefiltered_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("ibl_prefiltered"),
        source: wgpu::ShaderSource::Wgsl(prefiltered_source.into()),
    });
    let brdf_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("ibl_brdf"),
        source: wgpu::ShaderSource::Wgsl(brdf_source.into()),
    });

    let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("ibl_bake_uniform"),
        size: BAKE_UNIFORM_BYTES,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let uniform_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("ibl_bake_uniform"),
        layout: &uniform_bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: uniform_buffer.as_entire_binding(),
        }],
    });

    let target = [Some(wgpu::ColorTargetState {
        format: IBL_BAKE_FORMAT,
        blend: None,
        write_mask: wgpu::ColorWrites::ALL,
    })];

    let irradiance_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("ibl_irradiance"),
        layout: Some(&cube_layout),
        vertex: wgpu::VertexState {
            module: &irradiance_module,
            entry_point: Some("vs_main"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &irradiance_module,
            entry_point: Some("fs_main"),
            targets: &target,
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });

    let prefiltered_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("ibl_prefiltered"),
        layout: Some(&cube_layout),
        vertex: wgpu::VertexState {
            module: &prefiltered_module,
            entry_point: Some("vs_main"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &prefiltered_module,
            entry_point: Some("fs_main"),
            targets: &target,
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });

    let brdf_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("ibl_brdf"),
        layout: Some(&brdf_layout),
        vertex: wgpu::VertexState {
            module: &brdf_module,
            entry_point: Some("vs_main"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &brdf_module,
            entry_point: Some("fs_main"),
            targets: &target,
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });

    let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        ..Default::default()
    });

    return BakePrograms {
        brdf_pipeline,
        irradiance_pipeline,
        prefiltered_pipeline,
        sampler,
        source_bind_group_layout,
        uniform_bind_group,
        uniform_buffer,
    };
}

fn create_bake_cube(device: &wgpu::Device, size: u32, mips: u32) -> wgpu::Texture {
    return device.create_texture(&wgpu::TextureDescriptor {
        label: Some("ibl_bake_cube"),
        size: wgpu::Extent3d {
            width: size,
            height: size,
            depth_or_array_layers: 6,
        },
        mip_level_count: mips,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: IBL_BAKE_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
}

fn bake_irradiance(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    programs: &BakePrograms,
    source_bind_group: &wgpu::BindGroup,
) -> wgpu::Texture {
    let texture = create_bake_cube(device, IRRADIANCE_SIZE, 1);
    render_bake_cube_faces(
        device,
        queue,
        &programs.irradiance_pipeline,
        programs,
        &texture,
        IRRADIANCE_SIZE,
        0,
        0.0,
        source_bind_group,
    );
    return texture;
}

fn bake_prefiltered(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    programs: &BakePrograms,
    source_bind_group: &wgpu::BindGroup,
) -> wgpu::Texture {
    let texture = create_bake_cube(device, PREFILTERED_SIZE, PREFILTERED_MIPS);
    for mip in 0..PREFILTERED_MIPS {
        let mip_size = (PREFILTERED_SIZE >> mip).max(1);
        let roughness = if PREFILTERED_MIPS > 1 {
            mip as f32 / (PREFILTERED_MIPS - 1) as f32
        } else {
            0.0
        };
        render_bake_cube_faces(
            device,
            queue,
            &programs.prefiltered_pipeline,
            programs,
            &texture,
            mip_size,
            mip,
            roughness,
            source_bind_group,
        );
    }
    return texture;
}

fn bake_brdf_lut(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    programs: &BakePrograms,
) -> wgpu::Texture {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("ibl_brdf_lut"),
        size: wgpu::Extent3d {
            width: BRDF_LUT_SIZE,
            height: BRDF_LUT_SIZE,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: IBL_BAKE_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });

    let view = texture.create_view(&Default::default());
    let mut encoder = device.create_command_encoder(&Default::default());
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("ibl_brdf_lut"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                depth_slice: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            ..Default::default()
        });
        pass.set_pipeline(&programs.brdf_pipeline);
        pass.draw(0..3, 0..1);
    }
    queue.submit(std::iter::once(encoder.finish()));
    return texture;
}

fn render_bake_cube_faces(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &wgpu::RenderPipeline,
    programs: &BakePrograms,
    cube: &wgpu::Texture,
    size: u32,
    mip_level: u32,
    roughness: f32,
    source_bind_group: &wgpu::BindGroup,
) {
    for face in 0..6u32 {
        let basis = &CUBE_FACE_BASIS[face as usize];
        let uniform_data: [f32; 16] = [
            basis[0], basis[1], basis[2], 0.0,
            basis[3], basis[4], basis[5], 0.0,
            basis[6], basis[7], basis[8], 0.0,
            roughness, 0.0, 0.0, 0.0,
        ];
        queue.write_buffer(
            &programs.uniform_buffer,
            0,
            unsafe { std::slice::from_raw_parts(uniform_data.as_ptr() as *const u8, std::mem::size_of_val(&uniform_data)) },
        );

        let view = cube.create_view(&wgpu::TextureViewDescriptor {
            dimension: Some(wgpu::TextureViewDimension::D2),
            base_array_layer: face,
            array_layer_count: Some(1),
            base_mip_level: mip_level,
            mip_level_count: Some(1),
            ..Default::default()
        });

        let mut encoder = device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("ibl_bake_face"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                ..Default::default()
            });
            pass.set_viewport(0.0, 0.0, size as f32, size as f32, 0.0, 1.0);
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &programs.uniform_bind_group, &[]);
            pass.set_bind_group(1, source_bind_group, &[]);
            pass.draw(0..3, 0..1);
        }
        queue.submit(std::iter::once(encoder.finish()));
    }
}

const BAKE_VERTEX_WGSL: &str = r#"
struct FaceUniform {
  faceForward : vec4f,
  faceRight : vec4f,
  faceUp : vec4f,
  roughness : vec4f,
};
@group(0) @binding(0) var<uniform> face : FaceUniform;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) uv : vec2f,
};

@vertex fn vs_main(@builtin(vertex_index) vi : u32) -> VertexOutput {
  var out : VertexOutput;
  let x = f32((vi & 1u) << 2u) - 1.0;
  let y = f32((vi & 2u) << 1u) - 1.0;
  out.uv = vec2f(x, -y);
  out.clipPosition = vec4f(x, y, 0.0, 1.0);
  return out;
}
"#;

const BAKE_COMMON_WGSL: &str = r#"
const PI : f32 = 3.14159265359;

@group(1) @binding(0) var envCube : texture_cube<f32>;
@group(1) @binding(1) var envSampler : sampler;

fn faceDirection(uv : vec2f) -> vec3f {
  return normalize(face.faceForward.xyz + uv.x * face.faceRight.xyz + uv.y * face.faceUp.xyz);
}

fn radicalInverse(bitsIn : u32) -> f32 {
  var bits = bitsIn;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley(i : u32, n : u32) -> vec2f {
  return vec2f(f32(i) / f32(n), radicalInverse(i));
}

fn importanceSampleGGX(Xi : vec2f, N : vec3f, roughness : f32) -> vec3f {
  let a = roughness * roughness;
  let phi = 2.0 * PI * Xi.x;
  let cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
  let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  let H = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  var up = vec3f(0.0, 0.0, 1.0);
  if (abs(N.z) >= 0.999) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  let tangent = normalize(cross(up, N));
  let bitangent = cross(N, tangent);
  return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}
"#;

// Concatenated at compile time isn't possible with const &str, so these are built via format! at runtime
// in create_bake_programs. For clarity, the fragments are stored as separate constants.

const IRRADIANCE_FRAGMENT_WGSL: &str = r#"
const PI : f32 = 3.14159265359;

@group(1) @binding(0) var envCube : texture_cube<f32>;
@group(1) @binding(1) var envSampler : sampler;

fn faceDirection(uv : vec2f) -> vec3f {
  return normalize(face.faceForward.xyz + uv.x * face.faceRight.xyz + uv.y * face.faceUp.xyz);
}

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  let N = faceDirection(in.uv);
  var up = vec3f(0.0, 0.0, 1.0);
  if (abs(N.z) >= 0.999) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  let right = normalize(cross(up, N));
  let realUp = normalize(cross(N, right));

  var irradiance = vec3f(0.0);
  var samples = 0.0;
  let delta = 0.15;
  var phi = 0.0;
  loop {
    if (phi >= 2.0 * PI) { break; }
    var theta = 0.0;
    loop {
      if (theta >= 0.5 * PI) { break; }
      let tangent = vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
      let sampleVec = tangent.x * right + tangent.y * realUp + tangent.z * N;
      irradiance = irradiance + textureSampleLevel(envCube, envSampler, sampleVec, 0.0).rgb * cos(theta) * sin(theta);
      samples = samples + 1.0;
      theta = theta + delta;
    }
    phi = phi + delta;
  }
  return vec4f(PI * irradiance / samples, 1.0);
}
"#;

const PREFILTERED_FRAGMENT_WGSL: &str = r#"
const PI : f32 = 3.14159265359;

@group(1) @binding(0) var envCube : texture_cube<f32>;
@group(1) @binding(1) var envSampler : sampler;

fn faceDirection(uv : vec2f) -> vec3f {
  return normalize(face.faceForward.xyz + uv.x * face.faceRight.xyz + uv.y * face.faceUp.xyz);
}

fn radicalInverse(bitsIn : u32) -> f32 {
  var bits = bitsIn;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley(i : u32, n : u32) -> vec2f {
  return vec2f(f32(i) / f32(n), radicalInverse(i));
}

fn importanceSampleGGX(Xi : vec2f, N : vec3f, roughness : f32) -> vec3f {
  let a = roughness * roughness;
  let phi = 2.0 * PI * Xi.x;
  let cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
  let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  let H = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  var up = vec3f(0.0, 0.0, 1.0);
  if (abs(N.z) >= 0.999) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  let tangent = normalize(cross(up, N));
  let bitangent = cross(N, tangent);
  return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  let N = faceDirection(in.uv);
  let V = N;
  let SAMPLE_COUNT = 48u;
  var prefiltered = vec3f(0.0);
  var totalWeight = 0.0;
  for (var i = 0u; i < SAMPLE_COUNT; i = i + 1u) {
    let Xi = hammersley(i, SAMPLE_COUNT);
    let H = importanceSampleGGX(Xi, N, face.roughness.x);
    let L = normalize(2.0 * dot(V, H) * H - V);
    let nDotL = max(dot(N, L), 0.0);
    if (nDotL > 0.0) {
      prefiltered = prefiltered + textureSampleLevel(envCube, envSampler, L, 0.0).rgb * nDotL;
      totalWeight = totalWeight + nDotL;
    }
  }
  if (totalWeight > 0.0) {
    return vec4f(prefiltered / totalWeight, 1.0);
  }
  return vec4f(textureSampleLevel(envCube, envSampler, N, 0.0).rgb, 1.0);
}
"#;

const BRDF_LUT_FRAGMENT_WGSL: &str = r#"
const PI : f32 = 3.14159265359;

fn radicalInverse(bitsIn : u32) -> f32 {
  var bits = bitsIn;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley(i : u32, n : u32) -> vec2f {
  return vec2f(f32(i) / f32(n), radicalInverse(i));
}

fn importanceSampleGGX(Xi : vec2f, N : vec3f, roughness : f32) -> vec3f {
  let a = roughness * roughness;
  let phi = 2.0 * PI * Xi.x;
  let cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
  let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  let H = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  var up = vec3f(0.0, 0.0, 1.0);
  if (abs(N.z) >= 0.999) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  let tangent = normalize(cross(up, N));
  let bitangent = cross(N, tangent);
  return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}

fn geometrySchlickGGX(nDotV : f32, roughness : f32) -> f32 {
  let k = roughness * roughness / 2.0;
  return nDotV / (nDotV * (1.0 - k) + k);
}

fn geometrySmith(N : vec3f, V : vec3f, L : vec3f, roughness : f32) -> f32 {
  return geometrySchlickGGX(max(dot(N, L), 0.0), roughness) * geometrySchlickGGX(max(dot(N, V), 0.0), roughness);
}

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  let uv = in.uv * 0.5 + vec2f(0.5);
  let nDotV = max(uv.x, 0.001);
  let roughness = uv.y;
  let V = vec3f(sqrt(1.0 - nDotV * nDotV), 0.0, nDotV);
  let N = vec3f(0.0, 0.0, 1.0);
  var A = 0.0;
  var B = 0.0;
  let SAMPLE_COUNT = 256u;
  for (var i = 0u; i < SAMPLE_COUNT; i = i + 1u) {
    let Xi = hammersley(i, SAMPLE_COUNT);
    let H = importanceSampleGGX(Xi, N, roughness);
    let L = normalize(2.0 * dot(V, H) * H - V);
    let nDotL = max(L.z, 0.0);
    let nDotH = max(H.z, 0.0);
    let vDotH = max(dot(V, H), 0.0);
    if (nDotL > 0.0) {
      let G = geometrySmith(N, V, L, roughness);
      let gVis = (G * vDotH) / (nDotH * nDotV);
      let Fc = pow(1.0 - vDotH, 5.0);
      A = A + (1.0 - Fc) * gVis;
      B = B + Fc * gVis;
    }
  }
  return vec4f(A / f32(SAMPLE_COUNT), B / f32(SAMPLE_COUNT), 0.0, 1.0);
}
"#;
