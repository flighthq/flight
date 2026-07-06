//! The browser host: canvas + wgpu surface + device + the render frame protocol.
//!
//! This module is compiled only for `wasm32`. It owns the `<canvas>`, the
//! `wgpu::Surface` targeting it, the requested adapter/device/queue, and a
//! `WgpuRenderState`. Per frame it points the render pass at the surface's
//! current texture via [`set_wgpu_frame_target_view`] and runs the
//! `render-webgpu` protocol straight into the live canvas — the same
//! present seam `host-winit` and `host-sdl` use, so there is no offscreen
//! target or blit copy.

use std::cell::RefCell;
use std::rc::Rc;

use flighthq_input::InputManager;
use flighthq_render_wgpu::{
    WgpuRenderOptions, WgpuRenderState, create_wgpu_render_state, destroy_wgpu_render_state,
    register_default_wgpu_material, register_wgpu_color_transform_materials,
    register_wgpu_display_object_renderer, register_wgpu_sprite_renderers, render_wgpu_background,
    set_wgpu_frame_target_view, submit_wgpu_render_pass,
};
use wasm_bindgen::JsCast;
use web_sys::HtmlCanvasElement;

/// Options for [`create_web_host`].
#[derive(Clone, Debug, Default)]
pub struct WebHostOptions {
    /// Packed `0xRRGGBBaa` clear color. `None` clears to transparent.
    pub background_color: Option<u32>,
    /// Device pixel ratio override. `None` uses `window.devicePixelRatio`.
    pub pixel_ratio: Option<f32>,
    /// GPU power-preference hint passed to the adapter request.
    pub power_preference: Option<wgpu::PowerPreference>,
}

/// The live browser host. Owns the canvas, the wgpu surface, the render state,
/// and the shared input manager.
pub struct WebHost {
    pub canvas: HtmlCanvasElement,
    pub surface: wgpu::Surface<'static>,
    pub surface_config: wgpu::SurfaceConfiguration,
    pub state: WgpuRenderState,
    pub input: Rc<RefCell<InputManager>>,
}

/// Acquires the `<canvas>` with the given DOM id, creates a wgpu surface over
/// it, asynchronously requests an adapter and device, and builds a ready
/// [`WebHost`] with the standard renderers registered.
///
/// Returns `None` (an expected failure) when the document/canvas is missing or
/// no compatible GPU adapter/device can be acquired.
pub async fn create_web_host(canvas_id: &str, options: &WebHostOptions) -> Option<WebHost> {
    console_error_panic_hook::set_once();

    let window = web_sys::window()?;
    let document = window.document()?;
    let element = document.get_element_by_id(canvas_id)?;
    let canvas: HtmlCanvasElement = element.dyn_into::<HtmlCanvasElement>().ok()?;

    let pixel_ratio = options
        .pixel_ratio
        .unwrap_or_else(|| window.device_pixel_ratio() as f32)
        .max(1.0);

    let css_width = canvas.client_width().max(1) as u32;
    let css_height = canvas.client_height().max(1) as u32;
    let width = ((css_width as f32) * pixel_ratio).round().max(1.0) as u32;
    let height = ((css_height as f32) * pixel_ratio).round().max(1.0) as u32;
    canvas.set_width(width);
    canvas.set_height(height);

    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::default());
    let surface_target = wgpu::SurfaceTarget::Canvas(canvas.clone());
    let surface = instance.create_surface(surface_target).ok()?;

    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: options.power_preference.unwrap_or_default(),
            force_fallback_adapter: false,
            compatible_surface: Some(&surface),
        })
        .await?;

    let (device, queue) = adapter
        .request_device(
            &wgpu::DeviceDescriptor {
                label: Some("flight-host-web-device"),
                required_features: wgpu::Features::empty(),
                // downlevel_webgl2_defaults keeps the host runnable on the WebGL fallback path.
                required_limits: wgpu::Limits::downlevel_webgl2_defaults()
                    .using_resolution(adapter.limits()),
                memory_hints: wgpu::MemoryHints::default(),
            },
            None,
        )
        .await
        .ok()?;

    let capabilities = surface.get_capabilities(&adapter);
    let format = pick_surface_format(&capabilities);

    let surface_config = wgpu::SurfaceConfiguration {
        // The render pass draws straight into the surface view, so RENDER_ATTACHMENT
        // (the default) is all the surface needs.
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        format,
        width,
        height,
        present_mode: pick_present_mode(&capabilities),
        desired_maximum_frame_latency: 2,
        alpha_mode: capabilities
            .alpha_modes
            .first()
            .copied()
            .unwrap_or(wgpu::CompositeAlphaMode::Auto),
        view_formats: vec![],
    };
    surface.configure(&device, &surface_config);

    let render_options = WgpuRenderOptions {
        power_preference: options.power_preference,
        format: Some(format),
        image_smoothing_enabled: true,
        pixel_ratio,
        round_pixels: false,
        background_color: options.background_color,
    };
    let mut state = create_wgpu_render_state(device, queue, format, width, height, &render_options);

    register_wgpu_display_object_renderer(&mut state);
    register_wgpu_sprite_renderers(&mut state);
    register_default_wgpu_material(&mut state);
    register_wgpu_color_transform_materials(&mut state);

    let input = Rc::new(RefCell::new(flighthq_input::create_input_manager()));

    Some(WebHost {
        canvas,
        surface,
        surface_config,
        state,
        input,
    })
}

/// Frees the host's GPU resources: the render state's owned buffers/textures.
/// The `wgpu::Device`/`Queue` and the surface drop with the host. This is a
/// `destroy_*` teardown — it frees GPU resources.
pub fn destroy_web_host(host: &mut WebHost) {
    destroy_wgpu_render_state(&mut host.state);
}

/// Renders one frame and presents it to the surface. Call once per
/// `requestAnimationFrame`.
///
/// Acquires the surface's current texture, points the render pass at its view
/// via [`set_wgpu_frame_target_view`] so the scene draws straight into the live
/// canvas, runs the background clear, then `draw_scene`, then submit before
/// presenting — the same present seam `host-winit` and `host-sdl` use.
///
/// `draw_scene` runs between the background clear and submit with a mutable
/// borrow of the [`WgpuRenderState`]. The application runs its prepare pass
/// (`prepare_display_object_render`) and the `render_wgpu_display_object` walk
/// there — it owns the scene arena and the id-graph closures the walk needs, not
/// the host.
///
/// Returns `false` (an expected failure) when the surface texture cannot be
/// acquired this frame (e.g. the surface is outdated and the caller should
/// resize); returns `true` once the frame is submitted and presented.
pub fn render_web_host_frame(
    host: &mut WebHost,
    draw_scene: &mut dyn FnMut(&mut WgpuRenderState),
) -> bool {
    let surface_texture = match host.surface.get_current_texture() {
        Ok(texture) => texture,
        Err(_) => return false,
    };
    let view = surface_texture
        .texture
        .create_view(&wgpu::TextureViewDescriptor::default());

    set_wgpu_frame_target_view(&mut host.state, Some(view));
    render_wgpu_background(&mut host.state);
    draw_scene(&mut host.state);
    submit_wgpu_render_pass(&mut host.state);

    surface_texture.present();
    true
}

/// Resizes the surface, render state, and scene target to `css_width` ×
/// `css_height` CSS pixels (scaled by the host pixel ratio). Call on window /
/// canvas resize before the next frame.
pub fn resize_web_host(host: &mut WebHost, css_width: u32, css_height: u32) {
    let pixel_ratio = host.state.render_state.pixel_ratio.max(1.0);
    let width = ((css_width.max(1) as f32) * pixel_ratio).round().max(1.0) as u32;
    let height = ((css_height.max(1) as f32) * pixel_ratio).round().max(1.0) as u32;

    if width == host.surface_config.width && height == host.surface_config.height {
        return;
    }

    host.canvas.set_width(width);
    host.canvas.set_height(height);

    host.surface_config.width = width;
    host.surface_config.height = height;
    host.surface
        .configure(&host.state.device, &host.surface_config);

    host.state.surface_width = width;
    host.state.surface_height = height;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Prefers a non-sRGB 8-bit format so packed colors map 1:1; falls back to the
// adapter's first reported format.
fn pick_surface_format(capabilities: &wgpu::SurfaceCapabilities) -> wgpu::TextureFormat {
    capabilities
        .formats
        .iter()
        .copied()
        .find(|format| {
            matches!(
                format,
                wgpu::TextureFormat::Rgba8Unorm | wgpu::TextureFormat::Bgra8Unorm
            )
        })
        .or_else(|| capabilities.formats.first().copied())
        .unwrap_or(wgpu::TextureFormat::Bgra8Unorm)
}

fn pick_present_mode(capabilities: &wgpu::SurfaceCapabilities) -> wgpu::PresentMode {
    if capabilities
        .present_modes
        .contains(&wgpu::PresentMode::Fifo)
    {
        wgpu::PresentMode::Fifo
    } else {
        capabilities
            .present_modes
            .first()
            .copied()
            .unwrap_or(wgpu::PresentMode::Fifo)
    }
}

#[cfg(test)]
mod tests {}
