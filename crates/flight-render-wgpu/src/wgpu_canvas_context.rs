// flight-lint: allow-file(contract-vocabulary) D17/D26 Principal 1180c6be: the native payload of WgpuSurfaceContext is a trait object mirroring the GPUCanvasContext members the source uses
//! The native payload behind a `flight_host::WgpuSurfaceContext` (D17 wgpu native narrowing,
//! Principal 1180c6be): `Arc<dyn WgpuCanvasContext>`, a trait mirroring the three `GPUCanvasContext`
//! members the source uses (`configure`, `get_current_texture`, `unconfigure`) plus the native-only
//! `present`. It is implemented for `wgpu::Surface<'static>`; tests implement it as the source's
//! canvas-context fakes. In TS `present` lowers to nothing.

use std::sync::Arc;

use flight_host::WgpuSurfaceContext;

use crate::types::WgpuNativeDevice;

/// How a canvas context is configured (TS `GPUCanvasConfiguration` plus the native surface extent).
#[derive(Clone, Debug)]
pub struct WgpuCanvasConfiguration {
    pub alpha_mode: wgpu::CompositeAlphaMode,
    pub device: WgpuNativeDevice,
    pub format: wgpu::TextureFormat,
    pub height: u32,
    pub usage: wgpu::TextureUsages,
    pub width: u32,
}

/// One acquired presentation frame: the texture a screen frame draws into and, natively, the
/// surface lease that must be presented exactly once after the frame's submit.
pub struct WgpuCanvasFrame {
    pub texture: wgpu::Texture,
    pub(crate) surface_texture: Option<wgpu::SurfaceTexture>,
}

/// Why a native acquisition produced no frame (wgpu's surface errors, D17).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuCanvasFrameError {
    Lost,
    Other,
    OutOfMemory,
    Outdated,
    Timeout,
}

/// The canvas-context operations render-wgpu consumes (TS `GPUCanvasContext`).
pub trait WgpuCanvasContext: Send + Sync {
    fn configure(&self, configuration: &WgpuCanvasConfiguration);
    fn get_current_texture(&self) -> Result<WgpuCanvasFrame, WgpuCanvasFrameError>;
    fn present(&self, device: &WgpuNativeDevice, frame: WgpuCanvasFrame);
    fn unconfigure(&self);
}

/// Wraps a texture as an acquired frame with no native surface lease (a context whose present
/// needs no lease, such as a test fake).
// flight-lint: allow(conform-extra) D17: the frame constructor native and test canvas contexts build presentation frames with
pub fn create_wgpu_canvas_frame(texture: wgpu::Texture) -> WgpuCanvasFrame {
    return WgpuCanvasFrame {
        texture,
        surface_texture: None,
    };
}

/// Wraps a canvas context as the host-vocabulary handle a host supplies, keeping the context's
/// `Arc` identity as the platform identity.
// flight-lint: allow(conform-extra) D26/D17: the handle constructor for the approved canvas-context payload
pub fn create_wgpu_surface_context(
    provider: flight_host::ProviderRef,
    context: Arc<dyn WgpuCanvasContext>,
) -> WgpuSurfaceContext {
    return WgpuSurfaceContext {
        provider,
        handle: Arc::new(context),
    };
}

fn acquire_wgpu_native_surface_frame(
    surface: &wgpu::Surface<'static>,
) -> Result<WgpuCanvasFrame, WgpuCanvasFrameError> {
    return match surface.get_current_texture() {
        wgpu::CurrentSurfaceTexture::Success(surface_texture)
        | wgpu::CurrentSurfaceTexture::Suboptimal(surface_texture) => Ok(WgpuCanvasFrame {
            texture: surface_texture.texture.clone(),
            surface_texture: Some(surface_texture),
        }),
        wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => {
            Err(WgpuCanvasFrameError::Timeout)
        }
        wgpu::CurrentSurfaceTexture::Outdated => Err(WgpuCanvasFrameError::Outdated),
        wgpu::CurrentSurfaceTexture::Lost => Err(WgpuCanvasFrameError::Lost),
        _ => Err(WgpuCanvasFrameError::Other),
    };
}

fn configure_wgpu_native_surface(
    surface: &wgpu::Surface<'static>,
    configuration: &WgpuCanvasConfiguration,
) {
    surface.configure(
        &configuration.device.device,
        &wgpu::SurfaceConfiguration {
            usage: configuration.usage,
            format: configuration.format,
            width: configuration.width.max(1),
            height: configuration.height.max(1),
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 2,
            alpha_mode: configuration.alpha_mode,
            view_formats: Vec::new(),
            color_space: wgpu::SurfaceColorSpace::Auto,
        },
    );
}

// The private narrowing of a host context handle to its canvas-context payload. A foreign payload is
// a host-provider programming error (D10): the source's context type admits no other value.
pub(crate) fn narrow_wgpu_canvas_context(
    context: &WgpuSurfaceContext,
) -> Arc<dyn WgpuCanvasContext> {
    return context
        .handle
        .downcast_ref::<Arc<dyn WgpuCanvasContext>>()
        .expect("WgpuSurfaceContext handle must carry an Arc<dyn flight_render_wgpu::WgpuCanvasContext>")
        .clone();
}

fn present_wgpu_native_surface_frame(device: &WgpuNativeDevice, frame: WgpuCanvasFrame) {
    if let Some(surface_texture) = frame.surface_texture {
        device.queue.present(surface_texture);
    }
}

// A native surface keeps its configuration until reconfigured or dropped; there is nothing to
// release early.
fn unconfigure_wgpu_native_surface(_surface: &wgpu::Surface<'static>) {}

impl WgpuCanvasContext for wgpu::Surface<'static> {
    fn configure(&self, configuration: &WgpuCanvasConfiguration) {
        configure_wgpu_native_surface(self, configuration);
    }

    fn get_current_texture(&self) -> Result<WgpuCanvasFrame, WgpuCanvasFrameError> {
        return acquire_wgpu_native_surface_frame(self);
    }

    fn present(&self, device: &WgpuNativeDevice, frame: WgpuCanvasFrame) {
        present_wgpu_native_surface_frame(device, frame);
    }

    fn unconfigure(&self) {
        unconfigure_wgpu_native_surface(self);
    }
}
