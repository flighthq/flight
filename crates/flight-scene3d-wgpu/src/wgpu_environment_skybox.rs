//! Draws the environment's radiance cubemap as the scene backdrop (TS `wgpuEnvironmentSkybox.ts`),
//! the WGSL mirror of scene3d-gl's skybox: a screen-filling triangle that reconstructs each pixel's
//! world-space view ray from the inverse view-projection and samples the cube. The pipeline writes no
//! depth and compares 'always'; call it inside the open scene pass, before `render_wgpu_scene3d`.

use flight_camera::{Camera3D, update_camera_3d_inverse_view_projection};
use flight_lighting::Environment;
use flight_render_wgpu::{
    WgpuCommandRecord, WgpuNativeDevice, WgpuRenderPass, WgpuRenderState, WgpuSamplerRecord,
    create_wgpu_bind_group, create_wgpu_bind_group_layout, create_wgpu_buffer,
    create_wgpu_pipeline_layout_recorded, create_wgpu_render_pipeline, create_wgpu_shader_module,
    draw_wgpu_render_pass, get_wgpu_render_state_native_device, get_wgpu_render_state_runtime,
    record_wgpu_command, set_wgpu_render_pass_bind_group, set_wgpu_render_pass_pipeline,
    write_wgpu_buffer,
};

use crate::types::WgpuSkybox;
use crate::wgpu_environment_cube::ensure_wgpu_environment_source_cube;
use crate::wgpu_mesh_pipeline::DEPTH_STENCIL_FORMAT;
use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

// Skybox uniform: mat4x4f inverse view-projection (64) + vec4f params (16, x = intensity) = 80 bytes.
const SKYBOX_UNIFORM_BYTES: u64 = 80;

// A linear-filtered clamp sampler, recorded like every other device sampler.
pub(crate) fn create_wgpu_linear_sampler(native: &WgpuNativeDevice) -> wgpu::Sampler {
    let descriptor = wgpu::SamplerDescriptor {
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        ..wgpu::SamplerDescriptor::default()
    };
    let sampler = native.device.create_sampler(&descriptor);
    record_wgpu_command(native, || {
        return WgpuCommandRecord::CreateSampler(WgpuSamplerRecord {
            address_mode_u: descriptor.address_mode_u,
            address_mode_v: descriptor.address_mode_v,
            anisotropy_clamp: descriptor.anisotropy_clamp,
            mag_filter: descriptor.mag_filter,
            min_filter: descriptor.min_filter,
            mipmap_filter: descriptor.mipmap_filter,
            sampler: sampler.clone(),
        });
    });
    return sampler;
}

// Resolves, once per state and color format, the skybox pipeline: a fullscreen-triangle module, the
// group(0) uniform and the group(1) cube + sampler, with depth-write off and compare 'always'.
fn ensure_wgpu_skybox_pipeline(state: &mut WgpuRenderState, format: wgpu::TextureFormat) -> WgpuSkybox {
    if let Some(sky) = get_wgpu_scene3d_runtime(state).skyboxes.get(&format) {
        return sky.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
    let module = create_wgpu_shader_module(&native, SKYBOX_WGSL);
    let uniform_bind_group_layout = create_wgpu_bind_group_layout(
        &native,
        &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
    );
    let cube_bind_group_layout = create_wgpu_bind_group_layout(
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
    let layout = create_wgpu_pipeline_layout_recorded(
        &native,
        &[uniform_bind_group_layout.clone(), cube_bind_group_layout.clone()],
    );
    let targets = [Some(wgpu::ColorTargetState {
        format,
        blend: None,
        write_mask: wgpu::ColorWrites::ALL,
    })];
    let pipeline = create_wgpu_render_pipeline(
        &native,
        &wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &targets,
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: Some(wgpu::DepthStencilState {
                format: DEPTH_STENCIL_FORMAT,
                depth_write_enabled: Some(false),
                depth_compare: Some(wgpu::CompareFunction::Always),
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        },
    );
    let uniform_buffer = create_wgpu_buffer(
        &native,
        SKYBOX_UNIFORM_BYTES,
        wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    );
    let uniform_bind_group = create_wgpu_bind_group(
        &native,
        &uniform_bind_group_layout,
        &[wgpu::BindGroupEntry {
            binding: 0,
            resource: uniform_buffer.as_entire_binding(),
        }],
    );
    let sky = WgpuSkybox {
        cube_bind_group: None,
        cube_bind_group_layout,
        cube_view: None,
        pipeline,
        uniform_bind_group,
        uniform_buffer,
    };
    get_wgpu_scene3d_runtime(state)
        .skyboxes
        .insert(format, sky.clone());
    return sky;
}

// The shared per-state filtering sampler for the skybox cube, created once across formats.
fn get_wgpu_skybox_sampler(state: &mut WgpuRenderState) -> wgpu::Sampler {
    if let Some(sampler) = &get_wgpu_scene3d_runtime(state).skybox_sampler {
        return sampler.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
    let sampler = create_wgpu_linear_sampler(&native);
    get_wgpu_scene3d_runtime(state).skybox_sampler = Some(sampler.clone());
    return sampler;
}

/// Draws the environment cube as a fullscreen backdrop into the pass (TS
/// `renderWgpuEnvironmentSkybox`); a no-op without a complete source cube or an open pass encoder.
/// `aspect` is the viewport width / height.
pub fn render_wgpu_environment_skybox(
    render_pass: &mut WgpuRenderPass<'_>,
    environment: &Environment,
    camera: &Camera3D,
    aspect: f32,
) {
    let state = &mut *render_pass.state;
    let Some(cube_view) = ensure_wgpu_environment_source_cube(state, environment) else {
        return;
    };
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let sky = ensure_wgpu_skybox_pipeline(state, format);

    if !update_camera_3d_inverse_view_projection(camera, aspect) {
        return;
    }
    let mut u = [0.0_f32; (SKYBOX_UNIFORM_BYTES / 4) as usize];
    u[..16].copy_from_slice(&camera.inverse_view_projection.read().unwrap().m);
    u[16] = environment.intensity;
    let native = get_wgpu_render_state_native_device(state);
    write_wgpu_buffer(&native, &sky.uniform_buffer, 0, bytemuck::cast_slice(&u));

    // Rebuilt only when the bound source-cube view changes; stable across frames otherwise.
    let mut sky = sky;
    if sky.cube_bind_group.is_none() || sky.cube_view.as_ref() != Some(&cube_view) {
        let sampler = get_wgpu_skybox_sampler(state);
        sky.cube_bind_group = Some(create_wgpu_bind_group(
            &native,
            &sky.cube_bind_group_layout,
            &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&cube_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        ));
        sky.cube_view = Some(cube_view);
        get_wgpu_scene3d_runtime(state)
            .skyboxes
            .insert(format, sky.clone());
    }

    set_wgpu_render_pass_pipeline(state, &sky.pipeline);
    set_wgpu_render_pass_bind_group(state, 0, &sky.uniform_bind_group, &[]);
    set_wgpu_render_pass_bind_group(state, 1, sky.cube_bind_group.as_ref().unwrap(), &[]);
    draw_wgpu_render_pass(state, 3, 1, 0, 0);
}

const SKYBOX_WGSL: &str = r#"
struct SkyUniform {
  inverseViewProjection : mat4x4f,
  params : vec4f,   // x = intensity
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
  // Full-screen triangle from the vertex index alone (no vertex buffer).
  let x = f32((vi & 1u) << 2u) - 1.0;
  let y = f32((vi & 2u) << 1u) - 1.0;
  out.ndc = vec2f(x, y);
  // Emit at the far plane (WebGPU clip z in 0..1) so the backdrop sits at maximum depth.
  out.clipPosition = vec4f(x, y, 1.0, 1.0);
  return out;
}

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  // Reconstruct the world-space ray through this pixel from the near- and far-plane unprojections. The
  // projection is GL-convention (clip z in -1..1), so unproject at z = -1 (near) and z = +1 (far),
  // matching scene-gl's skybox exactly.
  let nearW = sky.inverseViewProjection * vec4f(in.ndc, -1.0, 1.0);
  let farW = sky.inverseViewProjection * vec4f(in.ndc, 1.0, 1.0);
  let dir = normalize(farW.xyz / farW.w - nearW.xyz / nearW.w);
  let color = textureSampleLevel(envCube, envSampler, dir, 0.0).rgb * sky.params.x;
  return vec4f(color, 1.0);
}
"#;
