// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! GPU mip-chain generation by repeated downsampling (TS `wgpuMipmap.ts`). WebGPU has no
//! generateMipmap, so each level is rendered from the one above through a cached fullscreen
//! pipeline. The WGSL is the source text verbatim.

use crate::types::*;
use crate::wgpu_render_state::{
    get_wgpu_render_state_device_resources, get_wgpu_render_state_native_device,
};
use crate::wgpu_shader::create_wgpu_texture_sampler_bind_group_layout;

// The format-keyed downsample pipeline and its layout, cached on the device tier: linear and sRGB
// material textures need distinct pipeline targets.
fn ensure_wgpu_mipmap_pipeline(
    state: &WgpuRenderState,
    format: wgpu::TextureFormat,
) -> WgpuMipmapPipeline {
    let context = state.runtime.context.clone();
    if let Some(cached) = context.read().unwrap().mipmap_pipeline_cache.get(&format) {
        return cached.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
    let bind_group_layout = create_wgpu_texture_sampler_bind_group_layout(&native);
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(MIPMAP_WGSL.into()),
        });
    let layout = native
        .device
        .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[Some(&bind_group_layout)],
            immediate_size: 0,
        });
    let pipeline = native
        .device
        .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
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
                    format,
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
        });
    let result = WgpuMipmapPipeline {
        bind_group_layout,
        pipeline,
    };
    context
        .write()
        .unwrap()
        .mipmap_pipeline_cache
        .insert(format, result.clone());
    return result;
}

/// Renders levels 1.. of an uploaded texture by downsampling each level into the next (TS
/// `generateWgpuMipmaps`). The texture must carry the full chain and RENDER_ATTACHMENT usage; a
/// single-level base is a no-op.
pub fn generate_wgpu_mipmaps(
    state: &mut WgpuRenderState,
    texture: &wgpu::Texture,
    width: u32,
    height: u32,
    format: wgpu::TextureFormat,
) {
    let level_count = get_wgpu_mip_level_count(width, height);
    if level_count <= 1 {
        return;
    }
    let native = get_wgpu_render_state_native_device(state);
    let resources = get_wgpu_render_state_device_resources(state);
    let cached = ensure_wgpu_mipmap_pipeline(state, format);
    let mut encoder = native
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
    for level in 1..level_count {
        let src_view = texture.create_view(&wgpu::TextureViewDescriptor {
            base_mip_level: level - 1,
            mip_level_count: Some(1),
            ..wgpu::TextureViewDescriptor::default()
        });
        let dst_view = texture.create_view(&wgpu::TextureViewDescriptor {
            base_mip_level: level,
            mip_level_count: Some(1),
            ..wgpu::TextureViewDescriptor::default()
        });
        let bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &cached.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&src_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&resources.linear_sampler),
                },
            ],
        });
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &dst_view,
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
        pass.set_pipeline(&cached.pipeline);
        pass.set_bind_group(0, &bind_group, &[]);
        pass.draw(0..3, 0..1);
    }
    native.queue.submit([encoder.finish()]);
}

/// The number of levels in a full chain down to 1x1 (TS `getWgpuMipLevelCount`).
pub fn get_wgpu_mip_level_count(width: u32, height: u32) -> u32 {
    return 32 - width.max(height).max(1).leading_zeros();
}

/// Installs mip-chain generation on the state's upload paths (TS `registerWgpuMipmapGeneration`).
pub fn register_wgpu_mipmap_generation(state: &mut WgpuRenderState) {
    state.runtime.mipmap_generator = Some(generate_wgpu_mipmaps);
}

const MIPMAP_WGSL: &str = r#"
struct VsOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VsOut {
  // Full-screen triangle covering the clip rect; uv in [0,1] with v flipped into texture space.
  let x = f32((vi & 1u) << 2u) - 1.0;
  let y = f32((vi & 2u) << 1u) - 1.0;
  var out : VsOut;
  out.pos = vec4f(x, y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, (1.0 - y) * 0.5);
  return out;
}

@group(0) @binding(0) var srcTexture : texture_2d<f32>;
@group(0) @binding(1) var srcSampler : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSample(srcTexture, srcSampler, uv);
}
"#;
