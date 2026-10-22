// flight-lint: allow-file(contract-vocabulary) D17: the recorded descriptors carry native wgpu values
//! Exact command recording for the device's queue writes and render-pass attachments (Principal
//! cafc5d6b, item D). A noop or headless device validates every call but keeps no texture
//! contents and runs no clears, so the values the source's tests read off GPU call arguments
//! (clear colors, load choices, written bytes and layouts, scissor rects, submits) are reported here, at the
//! real call sites, to an observer installed on the device. With no observer installed nothing is
//! recorded or copied.

use std::sync::Arc;

use crate::types::*;

/// One command the device recorded, with the exact values it was given.
#[derive(Clone, Debug)]
pub enum WgpuCommandRecord {
    BeginRenderPass(WgpuRenderPassBeginRecord),
    CreateRenderPipeline(WgpuRenderPipelineRecord),
    CreateSampler(WgpuSamplerRecord),
    SetScissorRect(WgpuScissorRectRecord),
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

/// Receives every command the device records while installed.
pub type WgpuCommandObserver = Arc<dyn Fn(&WgpuCommandRecord) + Send + Sync>;

// Reports a command to the installed observer, building the record only when one is installed.
pub(crate) fn record_wgpu_command(
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

// Writes bytes into a buffer through the queue and records the exact call.
pub(crate) fn write_wgpu_buffer(
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

// Writes texels through the queue and records the exact call.
pub(crate) fn write_wgpu_texture(
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
