//! wgpu background — begins the frame, clears the canvas to the background color.

use crate::render_state::WgpuRenderState;
use crate::surface::{acquire_wgpu_frame_capture_texture, encode_wgpu_frame_capture};

/// Begins a new frame: resets per-frame counters, ensures the depth-stencil
/// texture is current, acquires the target texture (frame-capture texture when
/// capture is enabled, otherwise a transient surface-sized texture), and begins
/// the initial render pass with the background clear color.
pub fn render_wgpu_background(state: &mut WgpuRenderState) {
    // End any previous open pass (safety guard).
    if let Some(pass) = state.runtime.render_pass.take() {
        drop(pass);
    }

    state.runtime.uniform_offset = 0;
    state.runtime.sprite_batch.buffer_pool_index = 0;
    state.runtime.current_blend_mode = None;
    state.runtime.current_mask_depth = 0;
    state.runtime.mask_write_mode = false;
    state.runtime.current_scissor_rect = None;
    state.runtime.scissor_stack.clear();

    let width = state.surface_width.max(1);
    let height = state.surface_height.max(1);

    ensure_wgpu_depth_stencil(state, width, height);

    // Acquire the color target, in priority order:
    //   1. Frame capture (offscreen COPY_SRC texture) when enabled, so software/headless adapters
    //      can read it back. The capture path always wins so capture stays correct even if a host
    //      target view was left set.
    //   2. A host-supplied surface view (`set_wgpu_frame_target_view`) — the acquired swapchain
    //      texture's view — so a live window shows the scene directly. Consumed (taken) here so a
    //      single set covers exactly one frame.
    //   3. A transient surface-sized texture (fallback) when neither is set. It is dropped before
    //      present, so nothing is shown; this keeps tests and detached render passes working.
    let canvas_view = match acquire_wgpu_frame_capture_texture(state) {
        Some(texture) => texture.create_view(&wgpu::TextureViewDescriptor::default()),
        None => match state.runtime.frame_target_view.take() {
            Some(view) => view,
            None => {
                let texture = state.device.create_texture(&wgpu::TextureDescriptor {
                    label: Some("flight-wgpu-frame-target"),
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
                        | wgpu::TextureUsages::TEXTURE_BINDING,
                    view_formats: &[],
                });
                texture.create_view(&wgpu::TextureViewDescriptor::default())
            }
        },
    };

    state.runtime.canvas_view_cleared = true;
    state.runtime.current_color_format = Some(state.format);
    state.runtime.render_target_viewport = None;

    let clear_value = unpack_clear_color(state.render_state.background_color);

    let encoder = state
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("flight-wgpu-frame-encoder"),
        });
    state.runtime.command_encoder = Some(encoder);

    // Begin the initial clear pass into the canvas view. The depth-stencil view is taken out and
    // restored around the begin to satisfy disjoint borrowing.
    let depth_view = state.runtime.depth_stencil_view.take();
    if let (Some(encoder), Some(depth_view)) =
        (state.runtime.command_encoder.as_mut(), depth_view.as_ref())
    {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("flight-wgpu-frame-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &canvas_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(clear_value),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: depth_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(1.0),
                    store: wgpu::StoreOp::Discard,
                }),
                stencil_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(0),
                    store: wgpu::StoreOp::Discard,
                }),
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
        });
        pass.set_viewport(0.0, 0.0, width as f32, height as f32, 0.0, 1.0);
        state.runtime.render_pass = Some(pass.forget_lifetime());
    }
    state.runtime.depth_stencil_view = depth_view;
    state.runtime.canvas_texture_view = Some(canvas_view);
}

/// Sets (or clears) the host-supplied color target for the next frame.
///
/// Pass the acquired swapchain surface texture's `wgpu::TextureView` to direct
/// the next `render_wgpu_background` pass into the live window; pass `None` to
/// fall back to the internal transient target. The view is consumed by the next
/// `render_wgpu_background`, so the host sets it once per frame before beginning.
///
/// Frame capture (when enabled) always takes precedence over this target, so the
/// offscreen readback path is unaffected by a left-over host target view.
pub fn set_wgpu_frame_target_view(state: &mut WgpuRenderState, view: Option<wgpu::TextureView>) {
    state.runtime.frame_target_view = view;
}

/// Ends the active render pass, uploads the used portion of the uniform ring
/// buffer, encodes any frame capture, and submits the command encoder.
pub fn submit_wgpu_render_pass(state: &mut WgpuRenderState) {
    if let Some(pass) = state.runtime.render_pass.take() {
        drop(pass);
    }

    let Some(mut encoder) = state.runtime.command_encoder.take() else {
        state.runtime.canvas_texture_view = None;
        state.runtime.canvas_view_cleared = false;
        return;
    };

    // Upload the used portion of the uniform ring buffer before submission.
    let uniform_offset = state.runtime.uniform_offset;
    if uniform_offset > 0 {
        let float_count = (uniform_offset / 4) as usize;
        let bytes = uniform_data_bytes(&state.runtime.uniform_data, float_count);
        state
            .queue
            .write_buffer(&state.runtime.uniform_buffer, 0, bytes);
    }

    encode_wgpu_frame_capture(state, &mut encoder);
    state.queue.submit(std::iter::once(encoder.finish()));

    // Free buffers retired mid-frame now that the submitted command buffer no longer references them.
    for buffer in state.runtime.retired_buffers.drain(..) {
        buffer.destroy();
    }

    state.runtime.canvas_texture_view = None;
    state.runtime.canvas_view_cleared = false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn ensure_wgpu_depth_stencil(state: &mut WgpuRenderState, width: u32, height: u32) {
    if state.runtime.depth_stencil_texture.is_some()
        && state.runtime.depth_stencil_width == width
        && state.runtime.depth_stencil_height == height
    {
        return;
    }
    if let Some(texture) = state.runtime.depth_stencil_texture.take() {
        texture.destroy();
    }
    let texture = state.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("flight-wgpu-depth-stencil"),
        size: wgpu::Extent3d {
            width: width.max(1),
            height: height.max(1),
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth24PlusStencil8,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    state.runtime.depth_stencil_view =
        Some(texture.create_view(&wgpu::TextureViewDescriptor::default()));
    state.runtime.depth_stencil_texture = Some(texture);
    state.runtime.depth_stencil_width = width;
    state.runtime.depth_stencil_height = height;
}

// Converts a packed 0xRRGGBBAA color into a wgpu clear color, mapping a zero alpha to a fully
// transparent clear (matching the TS behaviour).
fn unpack_clear_color(packed: u32) -> wgpu::Color {
    let r = ((packed >> 24) & 0xff) as f64 / 255.0;
    let g = ((packed >> 16) & 0xff) as f64 / 255.0;
    let b = ((packed >> 8) & 0xff) as f64 / 255.0;
    let a = (packed & 0xff) as f64 / 255.0;
    if a > 0.0 {
        wgpu::Color { r, g, b, a }
    } else {
        wgpu::Color {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: 0.0,
        }
    }
}

fn uniform_data_bytes(data: &[f32], float_count: usize) -> &[u8] {
    let n = float_count.min(data.len());
    let ptr = data.as_ptr() as *const u8;
    // SAFETY: f32 is plain-old-data with no padding; the slice covers n*4 in-bounds bytes.
    unsafe { std::slice::from_raw_parts(ptr, n * 4) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unpack_clear_color_decodes_rgba() {
        let c = unpack_clear_color(0xff_80_40_ff);
        assert!((c.r - 1.0).abs() < 1e-6);
        assert!((c.g - 128.0 / 255.0).abs() < 1e-6);
        assert!((c.b - 64.0 / 255.0).abs() < 1e-6);
        assert!((c.a - 1.0).abs() < 1e-6);
    }

    #[test]
    fn unpack_clear_color_zero_alpha_is_transparent() {
        let c = unpack_clear_color(0xff_ff_ff_00);
        assert_eq!(c.a, 0.0);
        assert_eq!(c.r, 0.0);
    }

    #[test]
    fn uniform_data_bytes_returns_used_span() {
        let data = vec![1.0f32, 2.0, 3.0];
        let bytes = uniform_data_bytes(&data, 2);
        assert_eq!(bytes.len(), 8);
        assert_eq!(&bytes[0..4], &1.0f32.to_le_bytes());
    }
}
