//! Host-provided opaque platform handles (D26 host vocabulary): objects the SDK passes but does not
//! define. Each is `{ provider, handle }`. The `Arc` identity of `handle` is the platform object's
//! identity, and only the backend that consumes a handle narrows it to its native type. Where TS
//! allows the object to be null, the SDK field is an `Option` of the handle. No GL, GPU or windowing
//! dependency lives here.

use std::any::Any;
use std::fmt;
use std::sync::Arc;

use crate::provider_ref::ProviderRef;

/// The platform Canvas 2D drawing API (the subset of the DOM `CanvasRenderingContext2D` the SDK
/// calls), host vocabulary the way `glow::Context` is the GL API. Each member maps 1:1 to the DOM
/// member: a method to the method of the same name (`fill_rect` → `fillRect`), a `set_*` to the
/// property assignment (`set_fill_style(s)` → `fillStyle = s`). The web target is the browser
/// object itself; native 2D providers (tiny-skia / Cairo hosts, D19) implement it, and tests use a
/// recording fake. Every member takes `&self`: a context is a shared host object.
pub trait Canvas2DContext: Send + Sync {
    fn begin_path(&self);
    fn clear_rect(&self, x: f32, y: f32, width: f32, height: f32);
    fn clip(&self);
    fn fill_rect(&self, x: f32, y: f32, width: f32, height: f32);
    fn fill_text(&self, text: &str, x: f32, y: f32);
    fn line_to(&self, x: f32, y: f32);
    fn measure_text(&self, text: &str) -> CanvasTextMetrics;
    fn move_to(&self, x: f32, y: f32);
    fn rect(&self, x: f32, y: f32, width: f32, height: f32);
    fn restore(&self);
    fn save(&self);
    fn set_fill_style(&self, style: &str);
    fn set_font(&self, font: &str);
    fn set_global_alpha(&self, alpha: f32);
    fn set_line_width(&self, width: f32);
    fn set_stroke_style(&self, style: &str);
    fn set_text_align(&self, align: &str);
    fn set_text_baseline(&self, baseline: &str);
    fn set_transform(&self, a: f32, b: f32, c: f32, d: f32, e: f32, f: f32);
    fn stroke(&self);
    fn stroke_rect(&self, x: f32, y: f32, width: f32, height: f32);
}

/// A host Canvas 2D context (TS `CanvasRenderingContext2D`), returned by `HostCanvasCapability`.
/// The handle is the platform drawing API itself; its `Arc` identity is the platform object.
// flight-lint: allow(contract-vocabulary) D26 host vocabulary: the handle is the platform Canvas 2D API (a trait object the host implements), as glow::Context is the GL API
#[derive(Clone)]
pub struct CanvasRenderingContext2D {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Canvas2DContext>,
}

/// The measured extent of a text run (the subset of the DOM `TextMetrics` the SDK reads), returned
/// by `Canvas2DContext::measure_text`.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CanvasTextMetrics {
    pub width: f32,
}

/// A host-loaded font face (TS `FontFace`, the platform object). Font's SDK `FontFace` record holds
/// this handle together with its family metadata.
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct FontFaceHandle {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// A GL backend's context (TS `GlContext`, a structural WebGL2 subset). The handle is a `Send`
/// token: a GL renderer builds its thread-bound native context from it on its own GL thread (D17).
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct GlContext {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// An opaque host-side image handle carried across the native seam (TS `HostImageSource`; the web
/// target aliases the platform's drawable-source union). Shared as `Arc<HostImageSource>`, whose
/// `Arc::ptr_eq` is the source's object identity; it is never null (an absent source is
/// `Option<Arc<HostImageSource>>`). `provider` is the host that produced the handle, and `handle` the
/// host's own value, which portable code never inspects. Resources never own or free the handle.
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
pub struct HostImageSource {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// The host-neutral identity of one input source (TS `InputIngressSource`, an `object` whose exact
/// identity the installed ingress backend interprets). Attachments are keyed by the `Arc` identity
/// of `handle`.
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct InputIngressSource {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// A host media stream (TS `MediaStream`, the `HostVideoCapability.attachStream` input), produced by
/// the webcam capability.
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct MediaStreamHandle {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// A host-defined native drawable identity (TS `NativeSurfaceHandle`; on the web an
/// `HTMLCanvasElement`, natively an `SDL_Window`, `EGLSurface` or similar).
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct NativeSurfaceHandle {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// A host element or platform view an `HtmlView` stands in for (TS `HTMLElement`; natively a
/// platform view).
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct NativeViewHandle {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// A host-defined native window identity (TS `NativeWindowHandle`: an Electron `BrowserWindow`, a
/// Tauri `Window` or a platform window).
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct NativeWindowHandle {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// A WebGPU device (TS `GPUDevice`). The queue is reached through the device (`device.queue`); a
/// native device handle carries device and queue together.
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct WgpuDevice {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// A configured WebGPU presentation context (TS `GPUCanvasContext`).
// flight-lint: allow(contract-vocabulary) D26 opaque host-vocabulary handle: the Arc<dyn Any> identity is the platform object
#[derive(Clone)]
pub struct WgpuSurfaceContext {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the handle is opaque, so Debug reports only that a source is present
impl fmt::Debug for HostImageSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f.debug_struct("HostImageSource").finish_non_exhaustive();
    }
}
