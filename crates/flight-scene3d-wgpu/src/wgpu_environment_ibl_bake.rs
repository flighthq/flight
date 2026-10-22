// flight-lint: allow-file(contract-vocabulary) D17: the bake renders into native wgpu textures and pipelines
//! Bakes an environment's source cube into the split-sum image-based-lighting set (TS
//! `wgpuEnvironmentIblBake.ts`), the WGSL mirror of scene3d-gl's bake: a diffuse irradiance cube, a
//! roughness-mipped prefiltered specular cube and the 2D BRDF LUT, stored as `runtime.ibl` for the lit
//! PBR bind. Each face (and prefiltered mip) renders in its own encoder and submit so the shared face
//! uniform is consumed pass by pass.

use flight_lighting::Environment;
use flight_render_wgpu::{
    WgpuCommandRecord, WgpuNativeDevice, WgpuRenderState, create_wgpu_bind_group,
    create_wgpu_bind_group_layout, create_wgpu_buffer, create_wgpu_pipeline_layout_recorded,
    create_wgpu_render_pipeline, create_wgpu_shader_module, create_wgpu_texture,
    get_wgpu_render_state_native_device, record_wgpu_command, write_wgpu_buffer,
};

use crate::types::{WgpuBakePrograms, WgpuScene3DIbl};
use crate::wgpu_environment_cube::ensure_wgpu_environment_source_cube;
use crate::wgpu_environment_skybox::create_wgpu_linear_sampler;
use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

// Mirror scene3d-gl's bake resolutions, sample counts and mip levels.
const IRRADIANCE_SIZE: u32 = 16;
const PREFILTERED_SIZE: u32 = 64;
const PREFILTERED_MIPS: u32 = 5;
const BRDF_LUT_SIZE: u32 = 128;

// rgba16float HDR bake output, core-filterable in WebGPU.
const IBL_BAKE_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;

// Per-face bake uniform: faceForward + faceRight + faceUp (padded vec3) + roughness = 64 bytes.
const BAKE_UNIFORM_BYTES: u64 = 64;

// Per-face direction basis (forward, right, up) in texture face order, identical to scene3d-gl.
const CUBE_FACE_BASIS: [[f32; 9]; 6] = [
    [1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, -1.0, 0.0],
    [-1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, -1.0, 0.0],
    [0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0],
    [0.0, -1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, -1.0],
    [0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, -1.0, 0.0],
    [0.0, 0.0, -1.0, -1.0, 0.0, 0.0, 0.0, -1.0, 0.0],
];

// A bake-output cube (rgba16float, `mips` levels) with the full mip chain declared up front.
fn create_wgpu_bake_cube(native: &WgpuNativeDevice, size: u32, mips: u32) -> wgpu::Texture {
    return create_wgpu_texture(
        native,
        &wgpu::TextureDescriptor {
            label: None,
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
        },
    );
}

fn create_wgpu_bake_pipeline(
    native: &WgpuNativeDevice,
    layout: &wgpu::PipelineLayout,
    module: &wgpu::ShaderModule,
) -> wgpu::RenderPipeline {
    let targets = [Some(wgpu::ColorTargetState {
        format: IBL_BAKE_FORMAT,
        blend: None,
        write_mask: wgpu::ColorWrites::ALL,
    })];
    return create_wgpu_render_pipeline(
        native,
        &wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(layout),
            vertex: wgpu::VertexState {
                module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &targets,
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        },
    );
}

fn create_wgpu_cube_view(texture: &wgpu::Texture) -> wgpu::TextureView {
    return texture.create_view(&wgpu::TextureViewDescriptor {
        dimension: Some(wgpu::TextureViewDimension::Cube),
        ..wgpu::TextureViewDescriptor::default()
    });
}

fn bake_wgpu_brdf_lut(native: &WgpuNativeDevice, programs: &WgpuBakePrograms) -> wgpu::Texture {
    let texture = create_wgpu_texture(
        native,
        &wgpu::TextureDescriptor {
            label: None,
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
        },
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let mut encoder = native
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
    {
        let mut pass = begin_wgpu_bake_pass(&mut encoder, &view);
        pass.set_pipeline(&programs.brdf_pipeline);
        pass.draw(0..3, 0..1);
    }
    submit_wgpu_bake_encoder(native, encoder);
    return texture;
}

/// Bakes the environment's split-sum IBL set and stores it as `runtime.ibl` (TS
/// `bakeWgpuEnvironmentIbl`); a no-op without a complete source cube. The BRDF LUT is
/// environment-independent and is reused across re-bakes.
pub fn bake_wgpu_environment_ibl(state: &mut WgpuRenderState, environment: &Environment) {
    let Some(source_cube_view) = ensure_wgpu_environment_source_cube(state, environment) else {
        return;
    };
    let programs = ensure_wgpu_bake_programs(state);
    let native = get_wgpu_render_state_native_device(state);
    let source_bind_group = create_wgpu_bind_group(
        &native,
        &programs.source_bind_group_layout,
        &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&source_cube_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&programs.sampler),
            },
        ],
    );

    let (irradiance_cube, irradiance_cube_view) =
        bake_wgpu_irradiance(&native, &programs, &source_bind_group);
    let (prefiltered_cube, prefiltered_cube_view) =
        bake_wgpu_prefiltered(&native, &programs, &source_bind_group);
    let previous = get_wgpu_scene3d_runtime(state).ibl.clone();
    let (brdf_lut, brdf_lut_view) = match previous {
        Some(previous) => (previous.brdf_lut, previous.brdf_lut_view),
        None => {
            let lut = bake_wgpu_brdf_lut(&native, &programs);
            let view = lut.create_view(&wgpu::TextureViewDescriptor::default());
            (lut, view)
        }
    };

    // Replaces the prior set; its textures are freed by destroy_wgpu_scene3d_ibl, not here.
    get_wgpu_scene3d_runtime(state).ibl = Some(WgpuScene3DIbl {
        brdf_lut,
        brdf_lut_view,
        intensity: environment.intensity,
        irradiance_cube,
        irradiance_cube_view,
        prefiltered_cube,
        prefiltered_cube_view,
        prefiltered_mip_count: PREFILTERED_MIPS,
    });
}

fn bake_wgpu_irradiance(
    native: &WgpuNativeDevice,
    programs: &WgpuBakePrograms,
    source_bind_group: &wgpu::BindGroup,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = create_wgpu_bake_cube(native, IRRADIANCE_SIZE, 1);
    render_wgpu_bake_cube_faces(
        native,
        &programs.irradiance_pipeline,
        programs,
        &texture,
        IRRADIANCE_SIZE,
        0,
        0.0,
        source_bind_group,
    );
    let view = create_wgpu_cube_view(&texture);
    return (texture, view);
}

fn bake_wgpu_prefiltered(
    native: &WgpuNativeDevice,
    programs: &WgpuBakePrograms,
    source_bind_group: &wgpu::BindGroup,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = create_wgpu_bake_cube(native, PREFILTERED_SIZE, PREFILTERED_MIPS);
    for mip in 0..PREFILTERED_MIPS {
        let mip_size = 1.max(PREFILTERED_SIZE >> mip);
        let roughness = if PREFILTERED_MIPS > 1 {
            mip as f32 / (PREFILTERED_MIPS - 1) as f32
        } else {
            0.0
        };
        render_wgpu_bake_cube_faces(
            native,
            &programs.prefiltered_pipeline,
            programs,
            &texture,
            mip_size,
            mip,
            roughness,
            source_bind_group,
        );
    }
    let view = create_wgpu_cube_view(&texture);
    return (texture, view);
}

fn begin_wgpu_bake_pass<'a>(
    encoder: &'a mut wgpu::CommandEncoder,
    view: &'a wgpu::TextureView,
) -> wgpu::RenderPass<'a> {
    return encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: None,
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            depth_slice: None,
            resolve_target: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
}

/// Frees the IBL set's GPU resources (the baked textures, the source cube, the IBL uniform and the
/// no-IBL dummies) and clears the derived slots (TS `destroyWgpuScene3DIbl`). Idempotent.
pub fn destroy_wgpu_scene3d_ibl(state: &mut WgpuRenderState) {
    let scene = get_wgpu_scene3d_runtime(state);
    if let Some(ibl) = scene.ibl.take() {
        ibl.brdf_lut.destroy();
        ibl.irradiance_cube.destroy();
        ibl.prefiltered_cube.destroy();
    }
    if let Some(texture) = scene.environment_source_cube.take() {
        texture.destroy();
        scene.environment_source_cube_view = None;
    }
    if let Some(buffer) = scene.ibl_uniform_buffer.take() {
        buffer.destroy();
    }
    if let Some(texture) = scene.ibl_dummy_cube_texture.take() {
        texture.destroy();
        scene.ibl_dummy_cube_view = None;
    }
    if let Some(texture) = scene.ibl_dummy_lut_texture.take() {
        texture.destroy();
        scene.ibl_dummy_lut_view = None;
    }
    scene.ibl_sampler = None;
    scene.ibl_sample_layout = None;
    scene.ibl_sample_bind_group = None;
    scene.ibl_sample_cube_view = None;
    scene.pbr_sample_bind_group = None;
    scene.pbr_sample_ibl_cube_view = None;
    scene.environment_bake_programs = None;
}

// Resolves, once per state, the three bake pipelines and their shared uniform and source layouts.
fn ensure_wgpu_bake_programs(state: &mut WgpuRenderState) -> WgpuBakePrograms {
    if let Some(programs) = &get_wgpu_scene3d_runtime(state).environment_bake_programs {
        return programs.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
    let uniform_bind_group_layout = create_wgpu_bind_group_layout(
        &native,
        &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
    );
    let source_bind_group_layout = create_wgpu_bind_group_layout(
        &native,
        &[
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
    );
    let cube_layout = create_wgpu_pipeline_layout_recorded(
        &native,
        &[
            uniform_bind_group_layout.clone(),
            source_bind_group_layout.clone(),
        ],
    );
    let brdf_layout = create_wgpu_pipeline_layout_recorded(&native, &[]);

    let irradiance_module = create_wgpu_shader_module(
        &native,
        &format!(
            "{}{}{}",
            BAKE_VERTEX_WGSL, BAKE_COMMON_WGSL, IRRADIANCE_FRAGMENT_WGSL
        ),
    );
    let prefiltered_module = create_wgpu_shader_module(
        &native,
        &format!(
            "{}{}{}",
            BAKE_VERTEX_WGSL, BAKE_COMMON_WGSL, PREFILTERED_FRAGMENT_WGSL
        ),
    );
    let brdf_module = create_wgpu_shader_module(
        &native,
        &format!("{}{}", BAKE_VERTEX_WGSL, BRDF_LUT_FRAGMENT_WGSL),
    );
    let uniform_buffer = create_wgpu_buffer(
        &native,
        BAKE_UNIFORM_BYTES,
        wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    );
    let programs = WgpuBakePrograms {
        brdf_pipeline: create_wgpu_bake_pipeline(&native, &brdf_layout, &brdf_module),
        irradiance_pipeline: create_wgpu_bake_pipeline(&native, &cube_layout, &irradiance_module),
        prefiltered_pipeline: create_wgpu_bake_pipeline(&native, &cube_layout, &prefiltered_module),
        sampler: create_wgpu_linear_sampler(&native),
        source_bind_group_layout,
        uniform_bind_group: create_wgpu_bind_group(
            &native,
            &uniform_bind_group_layout,
            &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        ),
        uniform_buffer,
    };
    get_wgpu_scene3d_runtime(state).environment_bake_programs = Some(programs.clone());
    return programs;
}

// Renders all six faces of `cube` at `mip_level` through `pipeline`, writing the per-face basis and
// roughness uniform and submitting one encoder per face.
fn render_wgpu_bake_cube_faces(
    native: &WgpuNativeDevice,
    pipeline: &wgpu::RenderPipeline,
    programs: &WgpuBakePrograms,
    cube: &wgpu::Texture,
    size: u32,
    mip_level: u32,
    roughness: f32,
    source_bind_group: &wgpu::BindGroup,
) {
    for (face, basis) in CUBE_FACE_BASIS.iter().enumerate() {
        let u: [f32; 16] = [
            basis[0], basis[1], basis[2], 0.0, basis[3], basis[4], basis[5], 0.0, basis[6],
            basis[7], basis[8], 0.0, roughness, 0.0, 0.0, 0.0,
        ];
        write_wgpu_buffer(
            native,
            &programs.uniform_buffer,
            0,
            bytemuck::cast_slice(&u),
        );

        let view = cube.create_view(&wgpu::TextureViewDescriptor {
            dimension: Some(wgpu::TextureViewDimension::D2),
            base_array_layer: face as u32,
            array_layer_count: Some(1),
            base_mip_level: mip_level,
            mip_level_count: Some(1),
            ..wgpu::TextureViewDescriptor::default()
        });
        let mut encoder = native
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        {
            let mut pass = begin_wgpu_bake_pass(&mut encoder, &view);
            pass.set_viewport(0.0, 0.0, size as f32, size as f32, 0.0, 1.0);
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &programs.uniform_bind_group, &[]);
            pass.set_bind_group(1, source_bind_group, &[]);
            pass.draw(0..3, 0..1);
        }
        submit_wgpu_bake_encoder(native, encoder);
    }
}

fn submit_wgpu_bake_encoder(native: &WgpuNativeDevice, encoder: wgpu::CommandEncoder) {
    native.queue.submit([encoder.finish()]);
    record_wgpu_command(native, || {
        return WgpuCommandRecord::Submit(1);
    });
}

// The bake vertex module: a fullscreen triangle forwarding the [-1, 1] face coordinate, with uv.y
// negated because WebGPU targets are top-left origin.
const BAKE_VERTEX_WGSL: &str = r#"
struct FaceUniform {
  faceForward : vec4f,
  faceRight : vec4f,
  faceUp : vec4f,
  roughness : vec4f,   // x = roughness (prefiltered only)
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

// Shared bake fragment helpers: the source cube bindings, face direction and GGX sampling.
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

// Diffuse irradiance: cosine-weighted hemisphere integral around the texel normal.
const IRRADIANCE_FRAGMENT_WGSL: &str = r#"
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

// Prefiltered specular: GGX importance-sampled environment for the mip's roughness.
const PREFILTERED_FRAGMENT_WGSL: &str = r#"
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

// The environment-independent split-sum BRDF integration LUT.
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
