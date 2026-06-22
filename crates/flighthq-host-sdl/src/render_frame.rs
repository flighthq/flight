//! wgpu surface creation from an SDL window and the per-frame render protocol.
//!
//! Mirrors the TS `render-webgpu` flow: acquire the surface texture, run the
//! prepare/update pass, then `render_wgpu_background` → `render_wgpu_display_object`
//! → `submit_wgpu_render_pass` → `present`.

use flighthq_render_wgpu::{
    WgpuRenderOptions, WgpuRenderState, create_wgpu_render_state, render_wgpu_background,
    set_wgpu_frame_target_view, submit_wgpu_render_pass,
};
use raw_window_handle::{HasDisplayHandle, HasWindowHandle};

/// Owns the wgpu `Surface` and its configuration alongside the Flight render
/// state, and keeps the SDL window alive for as long as the surface exists.
///
/// `sdl2::video::Window` is `!Send + !Sync` (it holds an `Rc`), so the surface
/// is created with `create_surface_unsafe` from the window's raw handles; the
/// owned `window` field is what makes that sound — the surface never outlives
/// the window because they are dropped together with this struct. The window is
/// declared *after* `surface` so drop order frees the surface first.
pub struct SdlRenderContext {
    pub surface: wgpu::Surface<'static>,
    pub config: wgpu::SurfaceConfiguration,
    pub render_state: WgpuRenderState,
    pub window: sdl2::video::Window,
}

/// Creates a wgpu surface from an SDL window, requests an adapter and device,
/// configures the surface, builds a `WgpuRenderState`, and takes ownership of
/// the window so the surface stays sound for the context's lifetime.
///
/// Returns `None` if the window's raw handles cannot be read or no compatible
/// GPU adapter is available.
pub fn create_sdl_render_context(
    window: sdl2::video::Window,
    width: u32,
    height: u32,
    options: &WgpuRenderOptions,
) -> Option<SdlRenderContext> {
    let instance = wgpu::Instance::default();

    // SAFETY: the window is moved into the returned SdlRenderContext and dropped
    // after the surface, so the raw handles remain valid for the surface's whole
    // lifetime. This is the standard pattern for `!Send + !Sync` window types.
    let surface = unsafe {
        let target = wgpu::SurfaceTargetUnsafe::RawHandle {
            raw_display_handle: window.display_handle().ok()?.as_raw(),
            raw_window_handle: window.window_handle().ok()?.as_raw(),
        };
        instance.create_surface_unsafe(target).ok()?
    };

    let adapter = pollster::block_on(
        instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: options
                .power_preference
                .unwrap_or(wgpu::PowerPreference::HighPerformance),
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
        }),
    )?;

    let (device, queue) = pollster::block_on(adapter.request_device(
        &wgpu::DeviceDescriptor {
            label: Some("flight-host-sdl-device"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::default(),
            memory_hints: wgpu::MemoryHints::default(),
        },
        None,
    ))
    .ok()?;

    let surface_caps = surface.get_capabilities(&adapter);
    let format = options
        .format
        .filter(|f| surface_caps.formats.contains(f))
        .unwrap_or_else(|| {
            // Prefer a non-sRGB 8-bit format so Flight's packed sRGB colors map
            // 1:1 (matches the TS renderers + host-web/capture); fall back to
            // the adapter's first format if none is non-sRGB.
            surface_caps
                .formats
                .iter()
                .copied()
                .find(|f| !f.is_srgb())
                .unwrap_or(surface_caps.formats[0])
        });

    let config = wgpu::SurfaceConfiguration {
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        format,
        width: width.max(1),
        height: height.max(1),
        present_mode: surface_caps
            .present_modes
            .first()
            .copied()
            .unwrap_or(wgpu::PresentMode::Fifo),
        alpha_mode: surface_caps.alpha_modes[0],
        view_formats: vec![],
        desired_maximum_frame_latency: 2,
    };
    surface.configure(&device, &config);

    let render_state =
        create_wgpu_render_state(device, queue, format, config.width, config.height, options);

    Some(SdlRenderContext {
        surface,
        config,
        render_state,
        window,
    })
}

/// Reconfigures the surface and updates the render state's recorded surface
/// dimensions after a window resize. A zero dimension is ignored.
pub fn resize_sdl_render_context(context: &mut SdlRenderContext, width: u32, height: u32) {
    if width == 0 || height == 0 {
        return;
    }
    context.config.width = width;
    context.config.height = height;
    context
        .surface
        .configure(&context.render_state.device, &context.config);
    context.render_state.surface_width = width;
    context.render_state.surface_height = height;
}

/// Runs the per-frame render protocol for one frame: acquire the surface texture,
/// run the Flight render background/draw/submit sequence, then present.
///
/// `draw_scene` runs between the background clear and submit with the render pass
/// open; the application runs its prepare pass and `render_wgpu_display_object`
/// walk there (it owns the arenas and the closures the id-based walk needs).
///
/// Returns `false` if the surface texture could not be acquired this frame
/// (for example, the surface is outdated and the caller should resize).
///
/// The acquired surface texture's view is set as the frame's color attachment via
/// [`set_wgpu_frame_target_view`], so the render pass draws straight into the live
/// window. `draw_scene` runs the prepare pass and `render_wgpu_display_object`
/// walk between the background clear and submit, then the frame is presented.
pub fn render_sdl_frame(
    context: &mut SdlRenderContext,
    draw_scene: &mut dyn FnMut(&mut WgpuRenderState),
) -> bool {
    let frame = match context.surface.get_current_texture() {
        Ok(frame) => frame,
        Err(_) => return false,
    };
    let view = frame
        .texture
        .create_view(&wgpu::TextureViewDescriptor::default());

    set_wgpu_frame_target_view(&mut context.render_state, Some(view));
    render_wgpu_background(&mut context.render_state);
    draw_scene(&mut context.render_state);
    submit_wgpu_render_pass(&mut context.render_state);

    frame.present();
    true
}

#[cfg(test)]
mod tests {
    // Surface, adapter, and device creation require a GPU and a window, which
    // are unavailable in this environment, so those paths are compile-checked
    // only. The CPU-testable seam (SDL event translation) is covered in
    // `event.rs`.
}
