//! The per-frame render protocol, mirroring the TS render-webgpu flow.
//!
//! Sequence per frame:
//!   1. acquire the surface texture and create its view.
//!   2. `set_wgpu_frame_target_view` directs the frame's color attachment at the
//!      surface view, so the render pass draws straight into the live window.
//!   3. `render_wgpu_background` begins the frame and clears.
//!   4. the `draw_scene` callback runs the application's prepare pass
//!      (`prepare_display_object_render`) and then the scene walk
//!      (`render_wgpu_display_object`) with the application's own topology /
//!      proxy / shape-geometry closures — the scene graph → render-proxy bridge
//!      and the arenas it reads are owned by the application, not the host.
//!   5. `submit_wgpu_render_pass` submits the encoder.
//!   6. `SurfaceTexture::present` shows the frame.
//!
//! This is compile-checked only — it needs a real GPU surface to run.

use flighthq_render_wgpu::{
    render_wgpu_background, set_wgpu_frame_target_view, submit_wgpu_render_pass,
};

use crate::bootstrap::HostWinitSurface;

/// Renders one frame and presents it.
///
/// Acquires the surface texture, points the render pass at its view via
/// [`set_wgpu_frame_target_view`], then runs the background clear, `draw_scene`,
/// and submit before presenting.
///
/// `draw_scene` is invoked between the background clear and submit with a mutable
/// borrow of the `WgpuRenderState`; the application runs its prepare pass and
/// `render_wgpu_display_object` walk there (it owns the arenas and the closures
/// the id-based walk needs).
///
/// Returns `false` when the surface texture could not be acquired (e.g. the
/// swapchain is outdated and needs reconfiguring) — the caller should resize and
/// retry next frame.
pub fn render_winit_frame(
    host: &mut HostWinitSurface,
    draw_scene: &mut dyn FnMut(&mut flighthq_render_wgpu::WgpuRenderState),
) -> bool {
    let Ok(frame) = host.surface.get_current_texture() else {
        return false;
    };
    let view = frame
        .texture
        .create_view(&wgpu::TextureViewDescriptor::default());

    set_wgpu_frame_target_view(&mut host.render_state, Some(view));
    render_wgpu_background(&mut host.render_state);
    draw_scene(&mut host.render_state);
    submit_wgpu_render_pass(&mut host.render_state);

    host.window.pre_present_notify();
    frame.present();
    true
}

#[cfg(test)]
mod tests {
    // The frame protocol requires a live surface/device; it is exercised by the
    // `cargo run` demo on a host machine.
}
