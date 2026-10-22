// flight-lint: allow-file(contract-vocabulary) D17: the recorded descriptors carry native wgpu values
//! Exact command recording for the device's queue writes and render-pass attachments (Principal
//! cafc5d6b, item D). A noop or headless device validates every call but keeps no texture
//! contents and runs no clears, so the values the source's tests read off GPU call arguments
//! (clear colors, load choices, written bytes and layouts, scissor rects, submits, and the bind
//! groups, pipelines and draws the effect passes record) are reported here, at the real call sites,
//! to an observer installed on the device. With no observer installed nothing is recorded or
//! copied. Backend packages layered on this crate (effects-wgpu) report through the same hook.

use std::sync::Arc;

use crate::types::*;

/// One command the device recorded, with the exact values it was given.
#[derive(Clone, Debug)]
pub enum WgpuCommandRecord {
    // A depth-only render pass (no color attachment) a backend opened on the frame's encoder.
    BeginDepthRenderPass(WgpuDepthRenderPassBeginRecord),
    BeginRenderPass(WgpuRenderPassBeginRecord),
    CreateBindGroup(WgpuBindGroupRecord),
    // A bind group created through `create_wgpu_bind_group`, with every entry it was given.
    CreateBindGroupEntries(WgpuBindGroupEntriesRecord),
    CreateBindGroupLayout(WgpuBindGroupLayoutRecord),
    CreateBuffer(WgpuBufferRecord),
    CreatePipelineLayout(WgpuPipelineLayoutRecord),
    CreateRenderPipeline(WgpuRenderPipelineRecord),
    // A render pipeline created through `create_wgpu_render_pipeline`, with its whole descriptor.
    CreateRenderPipelineDescriptor(WgpuRenderPipelineDescriptorRecord),
    CreateSampler(WgpuSamplerRecord),
    CreateShaderModule(WgpuShaderModuleRecord),
    CreateTexture(WgpuTextureRecord),
    Draw(WgpuDrawRecord),
    DrawIndexed(WgpuDrawIndexedRecord),
    // A backend-opened pass ended (TS `GPURenderPassEncoder.end`).
    EndRenderPass,
    SetBindGroup(WgpuSetBindGroupRecord),
    SetIndexBuffer(WgpuSetIndexBufferRecord),
    SetPipeline(wgpu::RenderPipeline),
    SetScissorRect(WgpuScissorRectRecord),
    SetVertexBuffer(WgpuSetVertexBufferRecord),
    // One queue submit, with the number of command buffers it carried.
    Submit(usize),
    WriteBuffer(WgpuBufferWriteRecord),
    WriteTexture(WgpuTextureWriteRecord),
}

/// How a pass's color attachment starts (TS `loadOp` plus `clearValue`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum WgpuColorLoadRecord {
    Clear(WgpuClearColorRecord),
    Load,
}

/// A recorded clear color (TS `GPUColorDict`).
// flight-lint: allow(f64) clear colors are the wgpu::Color doubles the pass was given
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WgpuClearColorRecord {
    pub a: f64,
    pub b: f64,
    pub g: f64,
    pub r: f64,
}

/// The attachments one render pass began with.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuRenderPassBeginRecord {
    pub color: WgpuColorLoadRecord,
    pub color_view: wgpu::TextureView,
    pub depth_clear: Option<f32>,
    pub stencil_clear: u32,
}

/// The depth attachment a depth-only pass began with.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuDepthRenderPassBeginRecord {
    pub depth_clear: Option<f32>,
    pub depth_view: wgpu::TextureView,
}

/// A bind group the backend created, with the texture views it binds, in entry order.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuBindGroupRecord {
    pub bind_group: wgpu::BindGroup,
    pub views: Vec<wgpu::TextureView>,
}

/// One draw recorded on an open pass.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuDrawRecord {
    pub instance_count: u32,
    pub vertex_count: u32,
}

/// A bind group set on an open pass at `index`, with its dynamic offsets.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuSetBindGroupRecord {
    pub bind_group: wgpu::BindGroup,
    pub index: u32,
    pub offsets: Vec<u32>,
}

/// A sampler the backend created, with the descriptor it was built from.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuSamplerRecord {
    pub address_mode_u: wgpu::AddressMode,
    pub address_mode_v: wgpu::AddressMode,
    pub anisotropy_clamp: u16,
    pub mag_filter: wgpu::FilterMode,
    pub min_filter: wgpu::FilterMode,
    pub mipmap_filter: wgpu::MipmapFilterMode,
    pub sampler: wgpu::Sampler,
}

/// A render pipeline the backend created, with the attachment state it was built for.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuRenderPipelineRecord {
    pub depth_stencil: Option<wgpu::DepthStencilState>,
    pub pipeline: wgpu::RenderPipeline,
    pub targets: Vec<Option<wgpu::ColorTargetState>>,
}

/// A scissor rectangle set on the open pass, in attachment pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuScissorRectRecord {
    pub height: u32,
    pub width: u32,
    pub x: u32,
    pub y: u32,
}

/// A queue buffer write: the destination, offset and exact bytes.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuBufferWriteRecord {
    pub buffer: wgpu::Buffer,
    pub data: Vec<u8>,
    pub offset: u64,
}

/// A queue texture write: the destination subresource, data layout, extent and exact bytes.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuTextureWriteRecord {
    pub bytes_per_row: Option<u32>,
    pub data: Vec<u8>,
    pub mip_level: u32,
    pub origin: [u32; 3],
    pub rows_per_image: Option<u32>,
    pub size: [u32; 3],
    pub texture: wgpu::Texture,
}

/// A bind group and every entry it was created with, in entry order.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuBindGroupEntriesRecord {
    pub bind_group: wgpu::BindGroup,
    pub entries: Vec<WgpuBindGroupEntryRecord>,
    pub layout: wgpu::BindGroupLayout,
}

/// One bind-group entry: its binding index and the resource bound there.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuBindGroupEntryRecord {
    pub binding: u32,
    pub resource: WgpuBindingResourceRecord,
}

/// The resource one bind-group entry binds (TS `GPUBindingResource`).
#[derive(Clone, Debug, PartialEq)]
pub enum WgpuBindingResourceRecord {
    Buffer(WgpuBufferBindingRecord),
    Sampler(wgpu::Sampler),
    TextureView(wgpu::TextureView),
}

/// A buffer range bound into a bind group (TS `GPUBufferBinding`).
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuBufferBindingRecord {
    pub buffer: wgpu::Buffer,
    pub offset: u64,
    pub size: Option<u64>,
}

/// A bind-group layout and the entries it declares.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuBindGroupLayoutRecord {
    pub entries: Vec<wgpu::BindGroupLayoutEntry>,
    pub layout: wgpu::BindGroupLayout,
}

/// A buffer the backend created, with its size and usage.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuBufferRecord {
    pub buffer: wgpu::Buffer,
    pub size: u64,
    pub usage: wgpu::BufferUsages,
}

/// A pipeline layout and the bind-group layouts it was built over, in group order.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuPipelineLayoutRecord {
    pub bind_group_layouts: Vec<wgpu::BindGroupLayout>,
    pub layout: wgpu::PipelineLayout,
}

/// One vertex buffer layout of a recorded pipeline.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuVertexBufferLayoutRecord {
    pub array_stride: u64,
    pub attributes: Vec<wgpu::VertexAttribute>,
    pub step_mode: wgpu::VertexStepMode,
}

/// A render pipeline and its whole descriptor (TS `GPURenderPipelineDescriptor`).
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuRenderPipelineDescriptorRecord {
    pub depth_stencil: Option<wgpu::DepthStencilState>,
    pub fragment_entry_point: Option<String>,
    pub layout: Option<wgpu::PipelineLayout>,
    pub module: wgpu::ShaderModule,
    pub pipeline: wgpu::RenderPipeline,
    pub primitive: wgpu::PrimitiveState,
    pub targets: Vec<Option<wgpu::ColorTargetState>>,
    pub vertex_buffers: Vec<Option<WgpuVertexBufferLayoutRecord>>,
    pub vertex_entry_point: Option<String>,
}

/// A shader module and the exact WGSL it was compiled from.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuShaderModuleRecord {
    pub module: wgpu::ShaderModule,
    pub source: String,
}

/// A texture the backend created, with its descriptor.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuTextureRecord {
    pub dimension: wgpu::TextureDimension,
    pub format: wgpu::TextureFormat,
    pub mip_level_count: u32,
    pub sample_count: u32,
    pub size: [u32; 3],
    pub texture: wgpu::Texture,
    pub usage: wgpu::TextureUsages,
}

/// One indexed draw recorded on an open pass.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WgpuDrawIndexedRecord {
    pub base_vertex: i32,
    pub first_index: u32,
    pub first_instance: u32,
    pub index_count: u32,
    pub instance_count: u32,
}

/// An index buffer set on an open pass.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuSetIndexBufferRecord {
    pub buffer: wgpu::Buffer,
    pub format: wgpu::IndexFormat,
}

/// A vertex buffer set on an open pass at `slot`.
#[derive(Clone, Debug, PartialEq)]
pub struct WgpuSetVertexBufferRecord {
    pub buffer: wgpu::Buffer,
    pub slot: u32,
}

/// Receives every command the device records while installed.
pub type WgpuCommandObserver = Arc<dyn Fn(&WgpuCommandRecord) + Send + Sync>;

/// Creates a bind group and records every entry it was given.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded device call backend packages layered on render-wgpu share
pub fn create_wgpu_bind_group(
    device: &WgpuNativeDevice,
    layout: &wgpu::BindGroupLayout,
    entries: &[wgpu::BindGroupEntry<'_>],
) -> wgpu::BindGroup {
    let bind_group = device.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout,
        entries,
    });
    record_wgpu_command(device, || {
        let mut records = Vec::with_capacity(entries.len());
        for entry in entries {
            let resource = match &entry.resource {
                wgpu::BindingResource::Buffer(binding) => {
                    WgpuBindingResourceRecord::Buffer(WgpuBufferBindingRecord {
                        buffer: binding.buffer.clone(),
                        offset: binding.offset,
                        size: binding.size.map(|size| size.get()),
                    })
                }
                wgpu::BindingResource::Sampler(sampler) => {
                    WgpuBindingResourceRecord::Sampler((*sampler).clone())
                }
                wgpu::BindingResource::TextureView(view) => {
                    WgpuBindingResourceRecord::TextureView((*view).clone())
                }
                _ => panic!("create_wgpu_bind_group: unrecorded binding resource form"),
            };
            records.push(WgpuBindGroupEntryRecord {
                binding: entry.binding,
                resource,
            });
        }
        return WgpuCommandRecord::CreateBindGroupEntries(WgpuBindGroupEntriesRecord {
            bind_group: bind_group.clone(),
            entries: records,
            layout: layout.clone(),
        });
    });
    return bind_group;
}

/// Creates a bind-group layout and records its entries.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded device call backend packages layered on render-wgpu share
pub fn create_wgpu_bind_group_layout(
    device: &WgpuNativeDevice,
    entries: &[wgpu::BindGroupLayoutEntry],
) -> wgpu::BindGroupLayout {
    let layout = device
        .device
        .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries,
        });
    record_wgpu_command(device, || {
        return WgpuCommandRecord::CreateBindGroupLayout(WgpuBindGroupLayoutRecord {
            entries: entries.to_vec(),
            layout: layout.clone(),
        });
    });
    return layout;
}

/// Creates a buffer and records its size and usage.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded device call backend packages layered on render-wgpu share
pub fn create_wgpu_buffer(
    device: &WgpuNativeDevice,
    size: u64,
    usage: wgpu::BufferUsages,
) -> wgpu::Buffer {
    let buffer = device.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size,
        usage,
        mapped_at_creation: false,
    });
    record_wgpu_command(device, || {
        return WgpuCommandRecord::CreateBuffer(WgpuBufferRecord {
            buffer: buffer.clone(),
            size,
            usage,
        });
    });
    return buffer;
}

/// Creates a pipeline layout over `bind_group_layouts` and records it.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded device call backend packages layered on render-wgpu share
pub fn create_wgpu_pipeline_layout_recorded(
    device: &WgpuNativeDevice,
    bind_group_layouts: &[wgpu::BindGroupLayout],
) -> wgpu::PipelineLayout {
    let references: Vec<Option<&wgpu::BindGroupLayout>> =
        bind_group_layouts.iter().map(Some).collect();
    let layout = device
        .device
        .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &references,
            immediate_size: 0,
        });
    record_wgpu_command(device, || {
        return WgpuCommandRecord::CreatePipelineLayout(WgpuPipelineLayoutRecord {
            bind_group_layouts: bind_group_layouts.to_vec(),
            layout: layout.clone(),
        });
    });
    return layout;
}

/// Creates a render pipeline and records its whole descriptor.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded device call backend packages layered on render-wgpu share
pub fn create_wgpu_render_pipeline(
    device: &WgpuNativeDevice,
    descriptor: &wgpu::RenderPipelineDescriptor<'_>,
) -> wgpu::RenderPipeline {
    let pipeline = device.device.create_render_pipeline(descriptor);
    record_wgpu_command(device, || {
        let mut vertex_buffers = Vec::with_capacity(descriptor.vertex.buffers.len());
        for buffer in descriptor.vertex.buffers {
            vertex_buffers.push(buffer.as_ref().map(|buffer| {
                return WgpuVertexBufferLayoutRecord {
                    array_stride: buffer.array_stride,
                    attributes: buffer.attributes.to_vec(),
                    step_mode: buffer.step_mode,
                };
            }));
        }
        let targets = match &descriptor.fragment {
            Some(fragment) => fragment.targets.to_vec(),
            None => Vec::new(),
        };
        return WgpuCommandRecord::CreateRenderPipelineDescriptor(
            WgpuRenderPipelineDescriptorRecord {
                depth_stencil: descriptor.depth_stencil.clone(),
                fragment_entry_point: descriptor
                    .fragment
                    .as_ref()
                    .and_then(|fragment| fragment.entry_point.map(str::to_string)),
                layout: descriptor.layout.cloned(),
                module: descriptor.vertex.module.clone(),
                pipeline: pipeline.clone(),
                primitive: descriptor.primitive,
                targets,
                vertex_buffers,
                vertex_entry_point: descriptor.vertex.entry_point.map(str::to_string),
            },
        );
    });
    return pipeline;
}

/// Compiles a WGSL shader module and records its exact source.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded device call backend packages layered on render-wgpu share
pub fn create_wgpu_shader_module(device: &WgpuNativeDevice, source: &str) -> wgpu::ShaderModule {
    let module = device
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Owned(source.to_string())),
        });
    record_wgpu_command(device, || {
        return WgpuCommandRecord::CreateShaderModule(WgpuShaderModuleRecord {
            module: module.clone(),
            source: source.to_string(),
        });
    });
    return module;
}

/// Creates a texture and records its descriptor.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded device call backend packages layered on render-wgpu share
pub fn create_wgpu_texture(
    device: &WgpuNativeDevice,
    descriptor: &wgpu::TextureDescriptor<'_>,
) -> wgpu::Texture {
    let texture = device.device.create_texture(descriptor);
    record_wgpu_command(device, || {
        return WgpuCommandRecord::CreateTexture(WgpuTextureRecord {
            dimension: descriptor.dimension,
            format: descriptor.format,
            mip_level_count: descriptor.mip_level_count,
            sample_count: descriptor.sample_count,
            size: [
                descriptor.size.width,
                descriptor.size.height,
                descriptor.size.depth_or_array_layers,
            ],
            texture: texture.clone(),
            usage: descriptor.usage,
        });
    });
    return texture;
}

/// Issues a non-indexed draw on the state's open pass and records it; a no-op with no pass open.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded pass call backend packages layered on render-wgpu share
pub fn draw_wgpu_render_pass(
    state: &mut WgpuRenderState,
    vertex_count: u32,
    instance_count: u32,
    first_vertex: u32,
    first_instance: u32,
) {
    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    pass.draw(
        first_vertex..first_vertex + vertex_count,
        first_instance..first_instance + instance_count,
    );
    let native = state.runtime.context.read().unwrap().native.clone();
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::Draw(WgpuDrawRecord {
            instance_count,
            vertex_count,
        });
    });
}

/// Issues an indexed draw on the state's open pass and records it; a no-op with no pass open.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded pass call backend packages layered on render-wgpu share
pub fn draw_wgpu_render_pass_indexed(
    state: &mut WgpuRenderState,
    index_count: u32,
    instance_count: u32,
    first_index: u32,
    base_vertex: i32,
    first_instance: u32,
) {
    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    pass.draw_indexed(
        first_index..first_index + index_count,
        base_vertex,
        first_instance..first_instance + instance_count,
    );
    let native = state.runtime.context.read().unwrap().native.clone();
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::DrawIndexed(WgpuDrawIndexedRecord {
            base_vertex,
            first_index,
            first_instance,
            index_count,
            instance_count,
        });
    });
}

/// Reports a command to the installed observer, building the record only when one is installed.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): backend packages layered on render-wgpu report their GPU calls through the same exact-recording hook
pub fn record_wgpu_command(
    device: &WgpuNativeDevice,
    record: impl FnOnce() -> WgpuCommandRecord,
) {
    let observer = device.command_observer.read().unwrap().clone();
    if let Some(observer) = observer {
        observer(&record());
    }
}

/// Installs or clears the device's command observer, shared by every clone of the payload.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the exact-recording hook for values a headless device cannot expose
pub fn set_wgpu_native_device_command_observer(
    device: &WgpuNativeDevice,
    observer: Option<WgpuCommandObserver>,
) {
    *device.command_observer.write().unwrap() = observer;
}

/// Sets a bind group on the state's open pass and records it; a no-op with no pass open.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded pass call backend packages layered on render-wgpu share
pub fn set_wgpu_render_pass_bind_group(
    state: &mut WgpuRenderState,
    index: u32,
    bind_group: &wgpu::BindGroup,
    offsets: &[u32],
) {
    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    pass.set_bind_group(index, bind_group, offsets);
    let native = state.runtime.context.read().unwrap().native.clone();
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::SetBindGroup(WgpuSetBindGroupRecord {
            bind_group: bind_group.clone(),
            index,
            offsets: offsets.to_vec(),
        });
    });
}

/// Sets the index buffer on the state's open pass and records it; a no-op with no pass open.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded pass call backend packages layered on render-wgpu share
pub fn set_wgpu_render_pass_index_buffer(
    state: &mut WgpuRenderState,
    buffer: &wgpu::Buffer,
    format: wgpu::IndexFormat,
) {
    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    pass.set_index_buffer(buffer.slice(..), format);
    let native = state.runtime.context.read().unwrap().native.clone();
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::SetIndexBuffer(WgpuSetIndexBufferRecord {
            buffer: buffer.clone(),
            format,
        });
    });
}

/// Sets the pipeline on the state's open pass and records it; a no-op with no pass open.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded pass call backend packages layered on render-wgpu share
pub fn set_wgpu_render_pass_pipeline(state: &mut WgpuRenderState, pipeline: &wgpu::RenderPipeline) {
    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    pass.set_pipeline(pipeline);
    let native = state.runtime.context.read().unwrap().native.clone();
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::SetPipeline(pipeline.clone());
    });
}

/// Sets a vertex buffer on the state's open pass and records it; a no-op with no pass open.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded pass call backend packages layered on render-wgpu share
pub fn set_wgpu_render_pass_vertex_buffer(
    state: &mut WgpuRenderState,
    slot: u32,
    buffer: &wgpu::Buffer,
) {
    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    pass.set_vertex_buffer(slot, buffer.slice(..));
    let native = state.runtime.context.read().unwrap().native.clone();
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::SetVertexBuffer(WgpuSetVertexBufferRecord {
            buffer: buffer.clone(),
            slot,
        });
    });
}

/// Writes bytes into a buffer through the queue and records the exact call.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded queue write backend packages layered on render-wgpu share
pub fn write_wgpu_buffer(
    device: &WgpuNativeDevice,
    buffer: &wgpu::Buffer,
    offset: u64,
    data: &[u8],
) {
    record_wgpu_command(device, || {
        return WgpuCommandRecord::WriteBuffer(WgpuBufferWriteRecord {
            buffer: buffer.clone(),
            data: data.to_vec(),
            offset,
        });
    });
    device.queue.write_buffer(buffer, offset, data);
}

/// Writes texels through the queue and records the exact call.
// flight-lint: allow(conform-extra) Principal cafc5d6b (item D): the recorded queue write backend packages layered on render-wgpu share
pub fn write_wgpu_texture(
    device: &WgpuNativeDevice,
    destination: wgpu::TexelCopyTextureInfo<'_>,
    data: &[u8],
    layout: wgpu::TexelCopyBufferLayout,
    size: wgpu::Extent3d,
) {
    record_wgpu_command(device, || {
        return WgpuCommandRecord::WriteTexture(WgpuTextureWriteRecord {
            bytes_per_row: layout.bytes_per_row,
            data: data.to_vec(),
            mip_level: destination.mip_level,
            origin: [
                destination.origin.x,
                destination.origin.y,
                destination.origin.z,
            ],
            rows_per_image: layout.rows_per_image,
            size: [size.width, size.height, size.depth_or_array_layers],
            texture: destination.texture.clone(),
        });
    });
    device.queue.write_texture(destination, data, layout, size);
}
