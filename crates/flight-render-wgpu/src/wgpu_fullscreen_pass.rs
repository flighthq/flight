// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! The substrate-level fullscreen-pass primitive filter and effect packages draw through (TS
//! `wgpuFullscreenPass.ts`). The vertex shader generates one full-screen triangle from the vertex
//! index; the WGSL is the source text verbatim.

use flight_entity::EntityRuntimeSlot;

use crate::types::*;
use crate::wgpu_render_state::get_wgpu_render_state_native_device;
use crate::wgpu_shader::create_wgpu_texture_sampler_bind_group_layout;

/// The per-pass uniform hook (TS `setUniforms`): builds the group(0) bind group against the
/// pipeline's uniform layout.
pub type WgpuFullscreenUniforms =
    fn(&mut WgpuRenderState, &wgpu::BindGroupLayout) -> wgpu::BindGroup;

/// Builds a fullscreen pipeline for a fragment WGSL source (TS `createWgpuFullscreenPipeline`).
/// Inputs bind at @group(1+i); an optional uniform buffer at @group(0) @binding(0).
pub fn create_wgpu_fullscreen_pipeline(
    state: &WgpuRenderState,
    fragment_wgsl: &str,
    texture_input_count: Option<u32>,
    format: Option<wgpu::TextureFormat>,
) -> WgpuFullscreenPipeline {
    return build_wgpu_fullscreen_pipeline(
        state,
        fragment_wgsl,
        texture_input_count,
        format,
        EntityRuntimeSlot::default(),
    );
}

/// Rebuilds `out` as a fullscreen pipeline (TS `initializeWgpuFullscreenPipeline`), keeping its
/// entity identity.
pub fn initialize_wgpu_fullscreen_pipeline(
    out: &mut WgpuFullscreenPipeline,
    state: &WgpuRenderState,
    fragment_wgsl: &str,
    texture_input_count: Option<u32>,
    format: Option<wgpu::TextureFormat>,
) {
    let runtime = std::mem::take(&mut out.runtime);
    *out =
        build_wgpu_fullscreen_pipeline(state, fragment_wgsl, texture_input_count, format, runtime);
}

fn build_wgpu_fullscreen_pipeline(
    state: &WgpuRenderState,
    fragment_wgsl: &str,
    texture_input_count: Option<u32>,
    format: Option<wgpu::TextureFormat>,
    runtime: EntityRuntimeSlot,
) -> WgpuFullscreenPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let format = format.unwrap_or(state.format);
    let uniform_bind_group_layout =
        native
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: None,
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
    let mut texture_bind_group_layouts = Vec::new();
    for _ in 0..texture_input_count.unwrap_or(1) {
        texture_bind_group_layouts.push(create_wgpu_texture_sampler_bind_group_layout(&native));
    }
    let mut layouts: Vec<Option<&wgpu::BindGroupLayout>> = vec![Some(&uniform_bind_group_layout)];
    layouts.extend(texture_bind_group_layouts.iter().map(Some));
    let pipeline_layout = native
        .device
        .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &layouts,
            immediate_size: 0,
        });
    let vs_module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(FULLSCREEN_VERTEX_WGSL.into()),
        });
    let fs_module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(fragment_wgsl.into()),
        });
    let pipeline = native
        .device
        .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &vs_module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &fs_module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            // Every pass this backend opens carries a depth24plus-stencil8 attachment, so the
            // pipeline declares it (inert: no depth write, stencil untouched) or it cannot be set in
            // any pass. The source omits it and fails WebGPU validation the same way.
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth24PlusStencil8,
                depth_write_enabled: Some(false),
                depth_compare: Some(wgpu::CompareFunction::Always),
                stencil: wgpu::StencilState {
                    front: wgpu::StencilFaceState::IGNORE,
                    back: wgpu::StencilFaceState::IGNORE,
                    read_mask: 0xff,
                    write_mask: 0x00,
                },
                bias: wgpu::DepthBiasState::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..wgpu::PrimitiveState::default()
            },
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });
    let placeholder_uniform_buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: 16,
        usage: wgpu::BufferUsages::UNIFORM,
        mapped_at_creation: false,
    });
    let placeholder_uniform_bind_group =
        native.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &uniform_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: placeholder_uniform_buffer.as_entire_binding(),
            }],
        });
    return WgpuFullscreenPipeline {
        runtime,
        pipeline,
        pipeline_layout,
        placeholder_uniform_bind_group,
        uniform_bind_group_layout,
        texture_bind_group_layouts,
    };
}

/// Releases a fullscreen pipeline (TS `destroyWgpuFullscreenPipeline`). Pipelines and layouts have
/// no explicit destroy; dropping the value frees them, so this is a symmetry no-op.
pub fn destroy_wgpu_fullscreen_pipeline(
    _state: &WgpuRenderState,
    _pipeline: &WgpuFullscreenPipeline,
) {
}

/// Draws a fullscreen triangle into the current pass (TS `drawWgpuFullscreenPass`), binding each
/// input target's view with the state's smoothing sampler at @group(1+i) and the uniform hook's
/// bind group at @group(0). No-op without an open pass or device resources.
pub fn draw_wgpu_fullscreen_pass(
    state: &mut WgpuRenderState,
    wgpu_pipeline: &WgpuFullscreenPipeline,
    inputs: &[&WgpuTextureRenderTarget],
    set_uniforms: Option<WgpuFullscreenUniforms>,
) {
    let resources = state.runtime.context.read().unwrap().resources.clone();
    let Some(resources) = resources else {
        return;
    };
    if state.runtime.render_pass.is_none() {
        return;
    }
    let uniform_bind_group = set_uniforms
        .map(|set_uniforms| set_uniforms(state, &wgpu_pipeline.uniform_bind_group_layout));
    let native = get_wgpu_render_state_native_device(state);
    // The layout always declares @group(0), so a pass whose shader takes no uniforms binds the
    // pipeline's zeroed placeholder group there. WebGPU draw validation requires every declared group
    // to be set; the source skips the bind and fails it (Principal cafc5d6b, logged as a TS defect).
    let uniform_bind_group =
        uniform_bind_group.unwrap_or_else(|| wgpu_pipeline.placeholder_uniform_bind_group.clone());
    let sampler = if state.render.allow_smoothing {
        resources.linear_sampler.clone()
    } else {
        resources.nearest_sampler.clone()
    };
    let mut input_bind_groups = Vec::new();
    for (index, input) in inputs.iter().enumerate() {
        let Some(layout) = wgpu_pipeline.texture_bind_group_layouts.get(index) else {
            continue;
        };
        input_bind_groups.push((
            index,
            native.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: None,
                layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&input.view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&sampler),
                    },
                ],
            }),
        ));
    }
    let pass = state.runtime.render_pass.as_mut().unwrap();
    pass.set_pipeline(&wgpu_pipeline.pipeline);
    pass.set_bind_group(0, &uniform_bind_group, &[]);
    for (index, bind_group) in &input_bind_groups {
        pass.set_bind_group(1 + *index as u32, bind_group, &[]);
    }
    pass.draw(0..3, 0..1);
}

// The vertex shader generates a full-screen triangle from the vertex index alone (no vertex buffer):
// three vertices cover the clip rect with one extra-large triangle, avoiding a quad's diagonal seam.
const FULLSCREEN_VERTEX_WGSL: &str = r#"
@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  // Full-screen triangle: three vertices covering the clip rect.
  let x = f32((vi & 1u) << 2u) - 1.0;
  let y = f32((vi & 2u) << 1u) - 1.0;
  return vec4f(x, y, 0.0, 1.0);
}
"#;
