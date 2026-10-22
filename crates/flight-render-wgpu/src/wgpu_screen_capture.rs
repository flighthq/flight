// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Opt-in capture of a screen target's frame to a CPU Bitmap (TS `wgpuScreenCapture.ts`). The frame
//! renders into an offscreen COPY_SRC texture the target owns, the frame's own submit copies it
//! into a retained buffer, and the readback maps only that buffer. One buffer serves both sides, so
//! they take turns: the writer skips its copy while the reader holds a map.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use flight_bitmap::{Bitmap, create_bitmap};
use flight_entity::{FlightError, FlightErrorKind, Ref};

use crate::types::*;

/// Maps the retained capture buffer and returns its frame as an RGBA Bitmap (TS
/// `createBitmapFromWgpuScreenRenderTarget`). BGRA formats are swizzled to RGBA; pixels stay
/// premultiplied (the texture's stored form). The map gives up by name after `timeout_ms` (0 waits
/// indefinitely). Rejects when capture was not enabled before a submitted frame.
pub async fn create_bitmap_from_wgpu_screen_render_target(
    target: &Ref<WgpuScreenRenderTarget>,
    timeout_ms: Option<u32>,
) -> Result<Bitmap, FlightError> {
    let timeout_ms = timeout_ms.unwrap_or(DEFAULT_MAP_TIMEOUT_MS);
    let (buffer, width, height, bytes_per_row, format, device) = {
        let mut current = target.write().unwrap();
        let Some(buffer) = current.capture_buffer.clone() else {
            return Err(FlightError {
                kind: FlightErrorKind::Error,
                message: "createBitmapFromWgpuScreenRenderTarget requires enableWgpuScreenRenderTargetCapture(target) before rendering, then a submitted frame.".to_string(),
            });
        };
        current.capture_map_pending = true;
        (
            buffer,
            current.capture_width,
            current.capture_height,
            current.capture_bytes_per_row,
            current.format,
            current.device.clone(),
        )
    };

    let mapped = map_wgpu_capture_buffer(&device, &buffer, timeout_ms);
    // A late resolution after the deadline leaves the buffer mapped; the timeout ends this
    // capture rather than retrying against the same buffer.
    mapped?;

    let mut bitmap = create_bitmap(width, height, None);
    {
        let view = buffer
            .slice(..)
            .get_mapped_range()
            .expect("the capture buffer is mapped for reading");
        let out = &mut bitmap.data;
        // The preferred canvas format is BGRA on most platforms and RGBA on software adapters;
        // normalize to the Bitmap's RGBA byte order. Pixels are left premultiplied: dividing by an
        // 8-bit alpha would amplify quantization in exactly the semi-transparent pixels a
        // comparison cares about.
        let swizzle_bgra = matches!(
            format,
            wgpu::TextureFormat::Bgra8Unorm | wgpu::TextureFormat::Bgra8UnormSrgb
        );
        for y in 0..height as usize {
            let src_row = y * bytes_per_row as usize;
            let dst_row = y * width as usize * 4;
            for x in 0..width as usize {
                let s = src_row + x * 4;
                let d = dst_row + x * 4;
                out[d] = if swizzle_bgra { view[s + 2] } else { view[s] };
                out[d + 1] = view[s + 1];
                out[d + 2] = if swizzle_bgra { view[s] } else { view[s + 2] };
                out[d + 3] = view[s + 3];
            }
        }
    }
    // Unmap (not destroy) so the next frame's submit can copy into the retained buffer again.
    buffer.unmap();
    target.write().unwrap().capture_map_pending = false;
    return Ok(bitmap);
}

// The offscreen texture a captured frame renders into, sized to the logical extent (a supersampled
// frame resolves down into it).
fn acquire_wgpu_screen_render_target_capture_texture(
    target: &mut WgpuScreenRenderTarget,
) -> wgpu::Texture {
    let scale = if target.antialias { 2 } else { 1 };
    let width = (target.width / scale).max(1);
    let height = (target.height / scale).max(1);
    if let Some(existing) = &target.capture_texture
        && existing.width() == width
        && existing.height() == height
    {
        return existing.clone();
    }
    if let Some(existing) = target.capture_texture.take() {
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
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
    target.capture_texture = Some(texture.clone());
    return texture;
}

/// Enables capture on a screen target (TS `enableWgpuScreenRenderTargetCapture`): the frame then
/// renders into an offscreen texture instead of the swap chain, and is not presented.
pub fn enable_wgpu_screen_render_target_capture(target: &mut WgpuScreenRenderTarget) {
    target.capture_enabled = true;
    target.acquire_capture_texture = Some(acquire_wgpu_screen_render_target_capture_texture);
    target.encode_capture = Some(encode_wgpu_screen_render_target_capture);
}

/// Encodes the capture-texture to capture-buffer copy into the frame's encoder, sizing the retained
/// buffer on demand (TS `encodeWgpuScreenRenderTargetCapture`). Skipped while the reader holds a
/// map, so a frame encoded during a readback neither invalidates it nor queues work ahead of it.
/// Rows are padded to WebGPU's 256-byte copy alignment.
pub fn encode_wgpu_screen_render_target_capture(
    target: &mut WgpuScreenRenderTarget,
    encoder: &mut wgpu::CommandEncoder,
) {
    let Some(texture) = target.capture_texture.clone() else {
        return;
    };
    if !target.capture_enabled || target.capture_map_pending {
        return;
    }
    let width = texture.width();
    let height = texture.height();
    let bytes_per_row = (width * 4).div_ceil(256) * 256;
    if target.capture_buffer.is_none()
        || target.capture_width != width
        || target.capture_height != height
    {
        if let Some(buffer) = target.capture_buffer.take() {
            buffer.destroy();
        }
        target.capture_buffer = Some(target.device.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: (bytes_per_row * height) as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        }));
        target.capture_bytes_per_row = bytes_per_row;
        target.capture_width = width;
        target.capture_height = height;
    }
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: target.capture_buffer.as_ref().unwrap(),
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(bytes_per_row),
                rows_per_image: None,
            },
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
}

// Maps the retained buffer, giving up by name after `timeout_ms` (0 waits indefinitely).
fn map_wgpu_capture_buffer(
    device: &WgpuNativeDevice,
    buffer: &wgpu::Buffer,
    timeout_ms: u32,
) -> Result<(), FlightError> {
    let settled: Arc<Mutex<Option<Result<(), wgpu::BufferAsyncError>>>> =
        Arc::new(Mutex::new(None));
    let record = settled.clone();
    buffer
        .slice(..)
        .map_async(wgpu::MapMode::Read, move |result| {
            *record.lock().unwrap() = Some(result);
        });
    let _ = device.device.poll(wgpu::PollType::Wait {
        submission_index: None,
        timeout: if timeout_ms == 0 {
            None
        } else {
            Some(Duration::from_millis(timeout_ms as u64))
        },
    });
    return match settled.lock().unwrap().take() {
        Some(Ok(())) => Ok(()),
        Some(Err(error)) => Err(FlightError {
            kind: FlightErrorKind::Error,
            message: format!("createBitmapFromWgpuScreenRenderTarget: {error}"),
        }),
        None => Err(FlightError {
            kind: FlightErrorKind::Error,
            message: format!(
                "createBitmapFromWgpuScreenRenderTarget: capture buffer did not map within {timeout_ms}ms"
            ),
        }),
    };
}

// Generous by design: this bounds a driver that has stopped answering, not a slow one.
const DEFAULT_MAP_TIMEOUT_MS: u32 = 10_000;
