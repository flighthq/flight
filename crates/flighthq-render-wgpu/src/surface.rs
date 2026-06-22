//! wgpu frame capture — opt-in readback of the rendered frame to CPU pixels.
//!
//! Headless / software adapters never present the swapchain and read back as
//! zeros, so capture redirects the frame into an offscreen `COPY_SRC` texture
//! and copies it into a retained readback buffer in the same frame.

use crate::render_state::WgpuRenderState;

// wgpu requires the per-row copy stride to be a multiple of 256 bytes.
const COPY_BYTES_PER_ROW_ALIGNMENT: u32 = 256;

/// Returns the offscreen texture the frame should render into when capture is
/// enabled, creating or resizing it to the surface on demand, or `None` when
/// capture is off (the caller then renders to the swapchain).
pub fn acquire_wgpu_frame_capture_texture(state: &mut WgpuRenderState) -> Option<&wgpu::Texture> {
    if !state.runtime.frame_capture_enabled {
        return None;
    }
    let width = state.surface_width.max(1);
    let height = state.surface_height.max(1);
    let needs_alloc = state.runtime.frame_capture_texture.is_none()
        || state.runtime.frame_capture_width != width
        || state.runtime.frame_capture_height != height;

    if needs_alloc {
        if let Some(texture) = state.runtime.frame_capture_texture.take() {
            texture.destroy();
        }
        if let Some(buffer) = state.runtime.frame_capture_buffer.take() {
            buffer.destroy();
        }
        let texture = state.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("flight-wgpu-frame-capture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: state.format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let bytes_per_row = wgpu_aligned_bytes_per_row(width, 4);
        let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("flight-wgpu-frame-capture-readback"),
            size: bytes_per_row as u64 * height as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        state.runtime.frame_capture_texture = Some(texture);
        state.runtime.frame_capture_view = Some(view);
        state.runtime.frame_capture_buffer = Some(buffer);
        state.runtime.frame_capture_width = width;
        state.runtime.frame_capture_height = height;
    }

    state.runtime.frame_capture_texture.as_ref()
}

/// Enables opt-in capture of the rendered frame for later CPU readback.
pub fn enable_wgpu_frame_capture(state: &mut WgpuRenderState) {
    state.runtime.frame_capture_enabled = true;
}

/// Records a copy of the capture texture into the retained readback buffer on
/// `encoder`, so the pixels survive on adapters that drop later-queued work.
pub fn encode_wgpu_frame_capture(state: &mut WgpuRenderState, encoder: &mut wgpu::CommandEncoder) {
    if !state.runtime.frame_capture_enabled {
        return;
    }
    let width = state.runtime.frame_capture_width;
    let height = state.runtime.frame_capture_height;
    let bytes_per_row = wgpu_aligned_bytes_per_row(width, 4);
    let (Some(texture), Some(buffer)) = (
        state.runtime.frame_capture_texture.as_ref(),
        state.runtime.frame_capture_buffer.as_ref(),
    ) else {
        return;
    };
    encoder.copy_texture_to_buffer(
        wgpu::ImageCopyTexture {
            texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::ImageCopyBuffer {
            buffer,
            layout: wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(bytes_per_row),
                rows_per_image: Some(height),
            },
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Rounds the per-row byte count up to wgpu's 256-byte copy alignment.
fn wgpu_aligned_bytes_per_row(width: u32, bytes_per_pixel: u32) -> u32 {
    let unaligned = width * bytes_per_pixel;
    let rem = unaligned % COPY_BYTES_PER_ROW_ALIGNMENT;
    if rem == 0 {
        unaligned
    } else {
        unaligned + (COPY_BYTES_PER_ROW_ALIGNMENT - rem)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aligned_bytes_per_row_rounds_up_to_256() {
        // 100px * 4 bytes = 400 -> next multiple of 256 = 512
        assert_eq!(wgpu_aligned_bytes_per_row(100, 4), 512);
    }

    #[test]
    fn aligned_bytes_per_row_keeps_exact_multiples() {
        // 64px * 4 = 256 (already aligned)
        assert_eq!(wgpu_aligned_bytes_per_row(64, 4), 256);
        // 128px * 4 = 512 (already aligned)
        assert_eq!(wgpu_aligned_bytes_per_row(128, 4), 512);
    }

    #[test]
    fn aligned_bytes_per_row_handles_small_widths() {
        // 1px * 4 = 4 -> 256
        assert_eq!(wgpu_aligned_bytes_per_row(1, 4), 256);
    }
}
