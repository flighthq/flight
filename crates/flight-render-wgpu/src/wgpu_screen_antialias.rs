// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Opt-in 2x-per-axis supersampling for screen targets (TS `wgpuScreenAntialias.ts`): the frame
//! draws into a 2x texture and one fullscreen linear-sampling pass resolves it into the
//! presentation view immediately before submit. The WGSL is the source text verbatim.

use crate::types::*;
use crate::wgpu_render_state::get_wgpu_render_state_device_resources;
use crate::wgpu_screen_render_target::sync_wgpu_screen_render_target_extent;
use crate::wgpu_shader::create_wgpu_texture_sampler_bind_group_layout;

fn acquire_wgpu_screen_render_target_antialias_view(
    state: &mut WgpuRenderState,
    target: &mut WgpuScreenRenderTarget,
) -> wgpu::TextureView {
    let width = target.width;
    let height = target.height;
    let max_dimension = target.device.device.limits().max_texture_dimension_2d;
    if width > max_dimension || height > max_dimension {
        panic!(
            "enableWgpuScreenRenderTargetAntialias requires a {width}x{height} supersample surface, exceeding maxTextureDimension2D {max_dimension}."
        );
    }
    if let Some(existing) = &target.antialias_texture
        && existing.width() == width
        && existing.height() == height
    {
        return target.antialias_view.clone().unwrap();
    }
    if let Some(existing) = target.antialias_texture.take() {
        existing.destroy();
    }
    let texture = target
        .device
        .device
        .create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: target.format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let layout = ensure_wgpu_screen_antialias_pipeline(state, target);
    let resources = get_wgpu_render_state_device_resources(state);
    target.antialias_resolve_bind_group = Some(target.device.device.create_bind_group(
        &wgpu::BindGroupDescriptor {
            label: None,
            layout: &layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&resources.linear_sampler),
                },
            ],
        },
    ));
    target.antialias_texture = Some(texture);
    target.antialias_view = Some(view.clone());
    return view;
}

/// Turns on supersampling for a screen target and installs its realization slots (TS
/// `enableWgpuScreenRenderTargetAntialias`), re-syncing the extent the factor scales.
pub fn enable_wgpu_screen_render_target_antialias(target: &mut WgpuScreenRenderTarget) {
    target.antialias = true;
    target.acquire_antialias_view = Some(acquire_wgpu_screen_render_target_antialias_view);
    target.encode_antialias_resolve = Some(encode_wgpu_screen_render_target_resolve);
    sync_wgpu_screen_render_target_extent(target);
}

fn encode_wgpu_screen_render_target_resolve(
    state: &WgpuRenderState,
    target: &WgpuScreenRenderTarget,
    encoder: &mut wgpu::CommandEncoder,
) {
    let (Some(presentation_view), Some(pipeline), Some(bind_group)) = (
        &target.presentation_view,
        &state.runtime.surface_antialias_resolve_pipeline,
        &target.antialias_resolve_bind_group,
    ) else {
        return;
    };
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: None,
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: presentation_view,
            depth_slice: None,
            resolve_target: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, bind_group, &[]);
    pass.draw(0..3, 0..1);
}

// The resolve pipeline is per state on the shared device, compiled once; returns the layout the
// target's bind group is built against.
fn ensure_wgpu_screen_antialias_pipeline(
    state: &mut WgpuRenderState,
    target: &WgpuScreenRenderTarget,
) -> wgpu::BindGroupLayout {
    if let (Some(existing), Some(_)) = (
        &state.runtime.surface_antialias_resolve_bind_group_layout,
        &state.runtime.surface_antialias_resolve_pipeline,
    ) {
        return existing.clone();
    }
    let device = &target.device.device;
    let bind_group_layout = create_wgpu_texture_sampler_bind_group_layout(&target.device);
    let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[Some(&bind_group_layout)],
        immediate_size: 0,
    });
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: None,
        source: wgpu::ShaderSource::Wgsl(SCREEN_ANTIALIAS_WGSL.into()),
    });
    state.runtime.surface_antialias_resolve_bind_group_layout = Some(bind_group_layout.clone());
    state.runtime.surface_antialias_resolve_pipeline = Some(device.create_render_pipeline(
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
                targets: &[Some(wgpu::ColorTargetState {
                    format: target.format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            depth_stencil: None,
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..wgpu::PrimitiveState::default()
            },
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        },
    ));
    return bind_group_layout;
}

const SCREEN_ANTIALIAS_WGSL: &str = r#"
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  let position = positions[index];
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = position * vec2f(0.5, -0.5) + vec2f(0.5);
  return output;
}

@group(0) @binding(0) var source_texture: texture_2d<f32>;
@group(0) @binding(1) var source_sampler: sampler;

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(source_texture, source_sampler, input.uv);
}
"#;
