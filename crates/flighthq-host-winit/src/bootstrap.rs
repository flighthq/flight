//! wgpu bootstrap over a winit window: instance, surface, adapter, device, and
//! a configured `WgpuRenderState`.
//!
//! This is the GPU-and-display half of the host — it cannot run in CI (no
//! adapter/surface without a real display), so it is compile-checked only.

use std::sync::Arc;

use flighthq_render_wgpu::{WgpuRenderOptions, WgpuRenderState, create_wgpu_render_state};

use winit::window::Window;

/// Owns the wgpu objects whose lifetime must outlast individual frames: the
/// surface (and the `Arc<Window>` it borrows), the adapter, and the configured
/// `WgpuRenderState` (which owns the device and queue).
///
/// The `WgpuRenderState` is the renderer seam; `surface` is presented to each
/// frame. Drop order matters — `render_state` (device/queue) and `surface` must
/// drop before the `Arc<Window>` they reference; struct fields drop top-to-bottom.
pub struct HostWinitSurface {
    pub render_state: WgpuRenderState,
    pub surface: wgpu::Surface<'static>,
    pub surface_config: wgpu::SurfaceConfiguration,
    pub adapter: wgpu::Adapter,
    pub window: Arc<Window>,
}

/// Creates a wgpu surface for `window`, requests an adapter and device, configures
/// the swapchain, and builds a `WgpuRenderState` sized to the window's current
/// physical size. The render path targets the surface directly each frame via
/// [`flighthq_render_wgpu::set_wgpu_frame_target_view`], so no capture texture or
/// blit is needed (see [`crate::frame::render_winit_frame`]).
///
/// Returns `None` if no compatible adapter is available or the surface cannot be
/// configured — both expected runtime failures on a machine without a usable GPU.
///
/// `options` is forwarded to `create_wgpu_render_state`; its `format` field is
/// ignored here because the swapchain format is dictated by the surface.
pub fn create_winit_surface(
    instance: &wgpu::Instance,
    window: Arc<Window>,
    options: &WgpuRenderOptions,
) -> Option<HostWinitSurface> {
    let size = window.inner_size();
    let width = size.width.max(1);
    let height = size.height.max(1);

    // The surface borrows the window; the `Arc<Window>` gives it a `'static`
    // lifetime so the surface can be stored alongside the window it depends on.
    let surface = instance.create_surface(Arc::clone(&window)).ok()?;

    let adapter = pollster::block_on(
        instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: options
                .power_preference
                .unwrap_or(wgpu::PowerPreference::default()),
            force_fallback_adapter: false,
            compatible_surface: Some(&surface),
        }),
    )?;

    let (device, queue) = pollster::block_on(adapter.request_device(
        &wgpu::DeviceDescriptor {
            label: Some("flight-host-winit-device"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_defaults().using_resolution(adapter.limits()),
            memory_hints: wgpu::MemoryHints::default(),
        },
        None,
    ))
    .ok()?;

    let mut surface_config = surface.get_default_config(&adapter, width, height)?;
    // Prefer a non-sRGB 8-bit surface format so Flight's packed sRGB colors map
    // 1:1 (matches the TS renderers, host-sdl, host-web, and capture). The
    // adapter default is often an sRGB format, which would gamma-shift colors.
    if surface_config.format.is_srgb() {
        let surface_caps = surface.get_capabilities(&adapter);
        if let Some(non_srgb) = surface_caps.formats.iter().copied().find(|f| !f.is_srgb()) {
            surface_config.format = non_srgb;
        }
    }
    // The render pass draws straight into the acquired surface texture's view, so
    // RENDER_ATTACHMENT (the default usage) is all the surface needs.
    surface.configure(&device, &surface_config);

    let format = surface_config.format;
    let render_state = create_wgpu_render_state(device, queue, format, width, height, options);

    Some(HostWinitSurface {
        render_state,
        surface,
        surface_config,
        adapter,
        window,
    })
}

/// Reconfigures the surface and resizes the render state to `width` x `height`
/// physical pixels. Call from `WindowEvent::Resized`. A zero dimension is
/// clamped to 1 so the swapchain stays valid when the window is minimized.
pub fn resize_winit_surface(host: &mut HostWinitSurface, width: u32, height: u32) {
    let width = width.max(1);
    let height = height.max(1);
    host.surface_config.width = width;
    host.surface_config.height = height;
    host.surface
        .configure(&host.render_state.device, &host.surface_config);
    host.render_state.surface_width = width;
    host.render_state.surface_height = height;
}

#[cfg(test)]
mod tests {
    // The surface/adapter/device path needs a real display and GPU driver, which
    // are not available in CI; it is exercised by the `cargo run` demo on a host
    // machine. The pure CPU seams are tested in `input_translation` and
    // `screen_backend`.
}
