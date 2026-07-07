//! wgpu fullscreen pass — the substrate-level fullscreen-pass primitive.
//!
//! Ports the TS `@flighthq/render-wgpu/wgpuFullscreenPass` helpers. Filter and
//! effect leaf packages draw through this; it is not filter-specific. The vertex
//! shader generates a full-screen triangle from the vertex index alone (no
//! vertex buffer): three vertices cover clip space with one oversized triangle,
//! avoiding the diagonal seam a quad would introduce.

use crate::render_state::{WgpuRenderState, WgpuRenderTarget};

// ---------------------------------------------------------------------------
// WgpuFullscreenPipeline
// ---------------------------------------------------------------------------

/// A fullscreen-pass pipeline over a fragment shader module.
///
/// Layout expectations:
///   `@group(0) @binding(0)` — optional uniform buffer (if the shader declares it),
///   `@group(1 + i)` — texture input `i` at `@binding(0)` with a paired sampler at `@binding(1)`.
pub struct WgpuFullscreenPipeline {
    pub pipeline: wgpu::RenderPipeline,
    pub pipeline_layout: wgpu::PipelineLayout,
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,
    /// One bind-group layout per input texture (`texture_input_count` entries).
    pub texture_bind_group_layouts: Vec<wgpu::BindGroupLayout>,
}

/// Per-pass uniform uploader passed to `draw_wgpu_fullscreen_pass`: builds the
/// `@group(0)` bind group for the pass from the pipeline's uniform layout.
pub type WgpuFullscreenUniformSetter =
    dyn Fn(&WgpuRenderState, &wgpu::BindGroupLayout) -> wgpu::BindGroup;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Creates a fullscreen-pass pipeline for `fragment_wgsl` and `format`.
///
/// `texture_input_count` controls how many input-texture bind group layouts are
/// built (`@group(1)`..`@group(texture_input_count)`).
pub fn create_wgpu_fullscreen_pipeline(
    state: &WgpuRenderState,
    fragment_wgsl: &str,
    texture_input_count: u32,
    format: wgpu::TextureFormat,
) -> WgpuFullscreenPipeline {
    let device = &state.device;

    let uniform_bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("flight-wgpu-fullscreen-uniform-bgl"),
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

    let mut texture_bind_group_layouts: Vec<wgpu::BindGroupLayout> =
        Vec::with_capacity(texture_input_count as usize);
    for _ in 0..texture_input_count {
        texture_bind_group_layouts.push(device.create_bind_group_layout(
            &wgpu::BindGroupLayoutDescriptor {
                label: Some("flight-wgpu-fullscreen-texture-bgl"),
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
            },
        ));
    }

    let mut bind_group_layouts: Vec<&wgpu::BindGroupLayout> =
        Vec::with_capacity(1 + texture_bind_group_layouts.len());
    bind_group_layouts.push(&uniform_bind_group_layout);
    for layout in &texture_bind_group_layouts {
        bind_group_layouts.push(layout);
    }

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("flight-wgpu-fullscreen-pipeline-layout"),
        bind_group_layouts: &bind_group_layouts,
        push_constant_ranges: &[],
    });

    let vs_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-fullscreen-vs"),
        source: wgpu::ShaderSource::Wgsl(FULLSCREEN_VERTEX_WGSL.into()),
    });
    let fs_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-fullscreen-fs"),
        source: wgpu::ShaderSource::Wgsl(fragment_wgsl.into()),
    });

    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("flight-wgpu-fullscreen-pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &vs_module,
            entry_point: "vs_main",
            buffers: &[],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &fs_module,
            entry_point: "fs_main",
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    });

    WgpuFullscreenPipeline {
        pipeline,
        pipeline_layout,
        uniform_bind_group_layout,
        texture_bind_group_layouts,
    }
}

/// Destroys a fullscreen pipeline's GPU resources. WebGPU pipelines and layouts
/// are GC-managed and have no explicit `destroy()`; this is a no-op kept for API
/// symmetry with `create_wgpu_fullscreen_pipeline` and to signal that the caller
/// should drop its reference.
pub fn destroy_wgpu_fullscreen_pipeline(
    _state: &WgpuRenderState,
    _pipeline: &WgpuFullscreenPipeline,
) {
    // wgpu pipelines/layouts have no destroy() — dropping the reference frees them.
}

/// Draws a fullscreen pass into the current render pass.
///
/// Binds `inputs[i]` as texture `@group(1 + i)`, calls `set_uniforms` for the
/// per-pass upload (pass `None` when the shader declares no uniforms), then draws
/// 3 vertices. Requires an open render pass (`render_wgpu_background` or a render
/// target begin must have run first); no-op otherwise.
///
/// `dest` is accepted for API parity but the current open pass is always used,
/// matching the TS reference.
pub fn draw_wgpu_fullscreen_pass(
    state: &mut WgpuRenderState,
    wgpu_pipeline: &WgpuFullscreenPipeline,
    inputs: &[&WgpuRenderTarget],
    _dest: Option<&WgpuRenderTarget>,
    set_uniforms: Option<&WgpuFullscreenUniformSetter>,
) {
    if state.runtime.render_pass.is_none() {
        return;
    }

    // Build the uniform + texture bind groups up front (immutable borrows of
    // `state`) so the render pass can then be borrowed mutably to record them.
    let uniform_bind_group =
        set_uniforms.map(|make| make(state, &wgpu_pipeline.uniform_bind_group_layout));

    let allow_smoothing = state.render_state.allow_smoothing;
    let mut texture_bind_groups: Vec<(u32, wgpu::BindGroup)> = Vec::with_capacity(inputs.len());
    for (i, input) in inputs.iter().enumerate() {
        let Some(layout) = wgpu_pipeline.texture_bind_group_layouts.get(i) else {
            continue;
        };
        let sampler = if allow_smoothing {
            &state.runtime.linear_sampler
        } else {
            &state.runtime.nearest_sampler
        };
        let bind_group = state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("flight-wgpu-fullscreen-input"),
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&input.view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(sampler),
                },
            ],
        });
        texture_bind_groups.push((1 + i as u32, bind_group));
    }

    let pass = state
        .runtime
        .render_pass
        .as_mut()
        .expect("render pass present after check");
    pass.set_pipeline(&wgpu_pipeline.pipeline);
    if let Some(bind_group) = &uniform_bind_group {
        pass.set_bind_group(0, bind_group, &[]);
    }
    for (slot, bind_group) in &texture_bind_groups {
        pass.set_bind_group(*slot, bind_group, &[]);
    }
    pass.draw(0..3, 0..1);
}

// ---------------------------------------------------------------------------
// Shader source
// ---------------------------------------------------------------------------

// Generates a full-screen triangle from the vertex index alone (no vertex
// buffer): three vertices cover clip space (-1..1 in both axes).
const FULLSCREEN_VERTEX_WGSL: &str = r#"
@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  let x = f32((vi & 1u) << 2u) - 1.0;
  let y = f32((vi & 2u) << 1u) - 1.0;
  return vec4f(x, y, 0.0, 1.0);
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    // FULLSCREEN_VERTEX_WGSL

    #[test]
    fn fullscreen_vertex_wgsl_declares_index_driven_vertex_entry() {
        assert!(FULLSCREEN_VERTEX_WGSL.contains("@vertex"));
        assert!(FULLSCREEN_VERTEX_WGSL.contains("fn vs_main"));
        assert!(FULLSCREEN_VERTEX_WGSL.contains("@builtin(vertex_index)"));
    }
}
