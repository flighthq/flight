// flight-lint: allow-file(contract-vocabulary) native host: the offscreen presentation context implements the native wgpu canvas-context trait
//! The windowless presentation surface: a fixed-size extent whose canvas context hands out one
//! offscreen texture instead of a swap-chain image. The SDK's screen render target draws into it
//! exactly as it would a window, and its capture path reads frames back.

use std::sync::{Arc, Mutex};

use flight_host::{NativeSurfaceHandle, ProviderRef};
use flight_render_wgpu::{
    WgpuCanvasConfiguration, WgpuCanvasContext, WgpuCanvasFrame, WgpuCanvasFrameError,
    WgpuNativeDevice, create_wgpu_canvas_frame, create_wgpu_surface_context,
    get_wgpu_texture_format,
};
use flight_surface::{
    GpuCanvasAlphaMode, SurfaceBase, SurfaceRef, WgpuPresentationSurface, WgpuSurfaceAttachResult,
    WgpuSurfaceAttachment, allocate_surface, get_surface_runtime,
};

use crate::types::*;

// The surface a headless host creates: its extent, fixed at creation, and its one context.
pub(crate) struct HeadlessSurface {
    pub(crate) context: Arc<HeadlessCanvasContext>,
    pub(crate) height: u32,
    pub(crate) width: u32,
}

// The offscreen stand-in for a swap chain: `configure` records the device, format and extent, and
// `get_current_texture` returns the one texture of that configuration, recreated only when the
// configuration changes. `present` has nothing to show.
#[derive(Default)]
pub(crate) struct HeadlessCanvasContext {
    configuration: Mutex<Option<WgpuCanvasConfiguration>>,
    texture: Mutex<Option<wgpu::Texture>>,
}

pub(crate) fn create_headless_attach_result(
    headless: &Arc<HeadlessSurface>,
    provider: &ProviderRef,
) -> WgpuSurfaceAttachResult {
    let context: Arc<dyn WgpuCanvasContext> = headless.context.clone();
    return WgpuSurfaceAttachResult {
        context: create_wgpu_surface_context(provider.clone(), context),
        surface: create_headless_presentation_surface(headless),
    };
}

/// Creates a windowless `width`x`height` surface the host's wgpu capability can attach to. The
/// surface is the drawable `create_wgpu_screen_render_target` takes; its frames are never shown,
/// and the SDK's screen-target capture reads them back.
pub fn create_headless_host_surface(host: &HeadlessHost, width: u32, height: u32) -> SurfaceRef {
    return create_headless_surface_ref(&host.provider, width, height);
}

pub(crate) fn create_headless_presentation_surface(
    headless: &Arc<HeadlessSurface>,
) -> WgpuPresentationSurface {
    let width = headless.width as f32;
    let height = headless.height as f32;
    return WgpuPresentationSurface {
        height: Arc::new(move || height),
        width: Arc::new(move || width),
    };
}

pub(crate) fn create_headless_surface_handle(
    provider: &ProviderRef,
    width: u32,
    height: u32,
) -> NativeSurfaceHandle {
    return NativeSurfaceHandle {
        provider: provider.clone(),
        handle: Arc::new(HeadlessSurface {
            context: Arc::new(HeadlessCanvasContext::default()),
            height: height.max(1),
            width: width.max(1),
        }),
    };
}

pub(crate) fn create_headless_surface_ref(
    provider: &ProviderRef,
    width: u32,
    height: u32,
) -> SurfaceRef {
    let surface: SurfaceRef = allocate_surface::<SurfaceBase>(Some(
        create_headless_surface_handle(provider, width, height),
    ));
    return surface;
}

pub(crate) fn attach_headless_surface(
    surface: &SurfaceRef,
    attachment: &WgpuSurfaceAttachment,
    provider: &ProviderRef,
) -> Option<WgpuSurfaceAttachResult> {
    let headless = get_headless_surface(surface)?;
    let native = attachment
        .device
        .handle
        .downcast_ref::<WgpuNativeDevice>()?
        .clone();
    let format = get_wgpu_texture_format(&attachment.format)?;
    configure_headless_canvas_context(
        &headless.context,
        &WgpuCanvasConfiguration {
            alpha_mode: match attachment.alpha_mode {
                GpuCanvasAlphaMode::Opaque => wgpu::CompositeAlphaMode::Opaque,
                GpuCanvasAlphaMode::Premultiplied => wgpu::CompositeAlphaMode::PreMultiplied,
            },
            device: native,
            format,
            height: headless.height,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            width: headless.width,
        },
    );
    return Some(create_headless_attach_result(&headless, provider));
}

// Records the configuration and drops the texture of the previous one.
fn configure_headless_canvas_context(
    context: &HeadlessCanvasContext,
    configuration: &WgpuCanvasConfiguration,
) {
    *context.configuration.lock().unwrap() = Some(configuration.clone());
    if let Some(texture) = context.texture.lock().unwrap().take() {
        texture.destroy();
    }
}

// The one texture of the current configuration, created on first use; `Outdated` before any
// configuration, so the SDK reconfigures rather than drawing nowhere.
fn get_headless_canvas_context_frame(
    context: &HeadlessCanvasContext,
) -> Result<WgpuCanvasFrame, WgpuCanvasFrameError> {
    let configuration = context.configuration.lock().unwrap();
    let Some(configuration) = configuration.as_ref() else {
        return Err(WgpuCanvasFrameError::Outdated);
    };
    let mut texture = context.texture.lock().unwrap();
    let texture = texture.get_or_insert_with(|| {
        return configuration
            .device
            .device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("flight-host-headless surface"),
                size: wgpu::Extent3d {
                    width: configuration.width.max(1),
                    height: configuration.height.max(1),
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: configuration.format,
                usage: configuration.usage,
                view_formats: &[],
            });
    });
    return Ok(create_wgpu_canvas_frame(texture.clone()));
}

// The headless surface behind `surface`, or `None` for a surface another host created.
pub(crate) fn get_headless_surface(surface: &SurfaceRef) -> Option<Arc<HeadlessSurface>> {
    let surface = surface.read().unwrap();
    let handle = get_surface_runtime(&*surface).handle.as_ref()?;
    return handle.handle.clone().downcast::<HeadlessSurface>().ok();
}

// A windowless frame has nowhere to be shown; it stays in the surface texture.
fn present_headless_canvas_context_frame(
    _context: &HeadlessCanvasContext,
    _frame: WgpuCanvasFrame,
) {
}

// Forgets the configuration and frees its texture now.
fn unconfigure_headless_canvas_context(context: &HeadlessCanvasContext) {
    *context.configuration.lock().unwrap() = None;
    if let Some(texture) = context.texture.lock().unwrap().take() {
        texture.destroy();
    }
}

impl WgpuCanvasContext for HeadlessCanvasContext {
    fn configure(&self, configuration: &WgpuCanvasConfiguration) {
        configure_headless_canvas_context(self, configuration);
    }

    fn get_current_texture(&self) -> Result<WgpuCanvasFrame, WgpuCanvasFrameError> {
        return get_headless_canvas_context_frame(self);
    }

    fn present(&self, _device: &WgpuNativeDevice, frame: WgpuCanvasFrame) {
        present_headless_canvas_context_frame(self, frame);
    }

    fn unconfigure(&self) {
        unconfigure_headless_canvas_context(self);
    }
}
