// flight-lint: allow-file(contract-vocabulary, sugar-delegates) D16 structural Surface trait and Deref accessors preserve the derived surface family and are contract dispatch, not convenience methods
//! The surface contract types: opaque native handle, D16 surface fields and trait, the canonical
//! canvas context record, and the host capabilities (TS `Surface.ts`, `HostSurface.ts`,
//! `HostCanvas.ts`, `CanvasSurface.ts`, `HostGl.ts`, `GlContext.ts`, `WgpuHost.ts`). The GL and WGPU
//! contracts are written in terms of the opaque host-vocabulary handles of flight-hostcapability
//! (D26): this crate has no GL or GPU dependency.

use std::any::Any;
use std::ops::{Deref, DerefMut};
use std::sync::Arc;

use flight_app::contract::AppWindow;
use std::future::Future;
use std::pin::Pin;

use flight_entity::{Entity, EntityRuntimeSlot, FlightError, Ref, Unknown};
use flight_hostcapability::{GlContext, GpuCanvasContext, GpuDevice, ProviderRef};

/// A host-defined native drawable identity (TS `NativeSurfaceHandle`): opaque, may be an object,
/// integer or null, and retains shared identity.
pub type NativeSurfaceHandle = Unknown;

/// The D16 fields base for every surface entity (TS `Surface extends Entity`). It carries the
/// private entity runtime (and thereby the host handle binding); per-kind surfaces compose it and
/// Deref to it.
#[derive(Default)]
pub struct SurfaceFields {
    runtime: EntityRuntimeSlot,
}

/// The object-safe surface trait (TS `Surface`). `Ref<dyn Surface>` preserves the original derived
/// object's identity; hosts narrow the concrete kind with `as_any` inside the borrow.
pub trait Surface: Entity + Any + Send + Sync {
    fn surface_fields(&self) -> &SurfaceFields;

    fn surface_fields_mut(&mut self) -> &mut SurfaceFields;

    fn as_any(&self) -> &dyn Any;
}

/// Shared erased surface handle (TS `Surface` object identity).
pub type SurfaceRef = Ref<dyn Surface>;

/// Per-surface runtime data (TS `SurfaceRuntime extends EntityRuntime`).
pub struct SurfaceRuntime {
    pub handle: NativeSurfaceHandle,
}

/// The base drawable entity used when no kind-specific context is needed (TS bare `Surface`).
#[derive(Default)]
pub struct SurfaceBase {
    fields: SurfaceFields,
}

/// The surface-owned, non-null Canvas 2D context record (TS `CanvasRenderingContext2D` residue).
/// The handle is opaque; `Arc` identity is the platform context identity. The SDK only retains and
/// passes it through.
#[derive(Clone)]
pub struct CanvasRenderingContext2D {
    pub provider: ProviderRef,
    pub handle: Arc<dyn Any + Send + Sync>,
}

/// The DOM 2D context settings (TS `CanvasRenderingContext2DSettings`). Every field is optional so
/// omission stays distinct; `color_space` is the closed predefined color-space union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CanvasColorSpace {
    Srgb,
    DisplayP3,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CanvasRenderingContext2DSettings {
    pub alpha: Option<bool>,
    pub color_space: Option<CanvasColorSpace>,
    pub desynchronized: Option<bool>,
    pub will_read_frequently: Option<bool>,
}

/// A host-allocated drawable with an acquired 2D context (TS `CanvasSurface`).
#[derive(Default)]
pub struct CanvasSurface {
    fields: SurfaceFields,
    pub context: CanvasRenderingContext2D,
}

/// Resizes a surface's backing store in device pixels (TS `HostSurfaceResizeCapability`).
#[derive(Clone)]
pub struct HostSurfaceResizeCapability {
    pub provider: ProviderRef,
    pub resize: Arc<dyn Fn(&SurfaceRef, f32, f32) + Send + Sync>,
}

/// Sets the logical presentation size (TS `HostSurfaceDisplayCapability`).
#[derive(Clone)]
pub struct HostSurfaceDisplayCapability {
    pub provider: ProviderRef,
    pub set_display_size: Arc<dyn Fn(&SurfaceRef, f32, f32) + Send + Sync>,
}

/// The Canvas 2D capability group (TS `HostCanvasCapabilities`). An omitted slot is capability
/// absence.
#[derive(Clone, Default)]
pub struct HostCanvasCapabilities {
    pub context: Option<HostCanvasCapability>,
}

/// The surface capability group (TS `HostSurfaceCapabilities`). An omitted slot is capability
/// absence.
#[derive(Clone, Default)]
pub struct HostSurfaceCapabilities {
    pub display: Option<HostSurfaceDisplayCapability>,
    pub resize: Option<HostSurfaceResizeCapability>,
}

/// Canvas 2D drawable lifecycle (TS `HostCanvasCapability`); context and handles stay opaque.
#[derive(Clone)]
pub struct HostCanvasCapability {
    pub provider: ProviderRef,
    pub acquire: Arc<
        dyn Fn(
                &SurfaceRef,
                Option<&CanvasRenderingContext2DSettings>,
            ) -> Option<CanvasRenderingContext2D>
            + Send
            + Sync,
    >,
    pub create: Arc<
        dyn Fn(
                &Ref<AppWindow>,
                f32,
                f32,
                Option<&CanvasRenderingContext2DSettings>,
            ) -> NativeSurfaceHandle
            + Send
            + Sync,
    >,
    pub create_surface: Arc<dyn Fn(f32, f32) -> Option<Ref<CanvasSurface>> + Send + Sync>,
    pub destroy_surface: Arc<dyn Fn(&Ref<CanvasSurface>) + Send + Sync>,
    pub release: Arc<dyn Fn(&SurfaceRef) + Send + Sync>,
}

/// The WebGL context-attribute preference (TS `WebGLPowerPreference`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WebGlPowerPreference {
    Default,
    HighPerformance,
    LowPower,
}

/// WebGL context-creation attributes (TS DOM `WebGLContextAttributes`). Every field is optional so
/// omission stays distinct.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WebGlContextAttributes {
    pub alpha: Option<bool>,
    pub antialias: Option<bool>,
    pub depth: Option<bool>,
    pub desynchronized: Option<bool>,
    pub fail_if_major_performance_caveat: Option<bool>,
    pub power_preference: Option<WebGlPowerPreference>,
    pub premultiplied_alpha: Option<bool>,
    pub preserve_drawing_buffer: Option<bool>,
    pub stencil: Option<bool>,
}

/// Options that affect only GL context acquisition (TS `GlContextOptions`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GlContextOptions {
    pub antialias: Option<bool>,
    pub context_attributes: Option<WebGlContextAttributes>,
    pub power_preference: Option<WebGlPowerPreference>,
}

/// GL drawable lifecycle (TS `HostGlCapability`). `create` is the allocating lane: it takes the
/// window and returns the platform drawable (or `None`), which the surface keeps on its runtime; the
/// context options belong to creation because EGL chooses its config before the window surface
/// exists. `acquire` returns `None` when the drawable cannot yield a context; `release` drops the
/// host's record without forcing context loss, which the driver owns and `subscribe` reports; the
/// returned closure unsubscribes.
#[derive(Clone)]
pub struct HostGlCapability {
    pub provider: ProviderRef,
    pub acquire:
        Arc<dyn Fn(&SurfaceRef, Option<&GlContextOptions>) -> Option<GlContext> + Send + Sync>,
    pub create: Arc<
        dyn Fn(&Ref<AppWindow>, f32, f32, Option<&GlContextOptions>) -> NativeSurfaceHandle
            + Send
            + Sync,
    >,
    pub release: Arc<dyn Fn(&SurfaceRef) + Send + Sync>,
    pub subscribe: Arc<
        dyn Fn(
                &SurfaceRef,
                Arc<dyn Fn() + Send + Sync>,
                Arc<dyn Fn() + Send + Sync>,
            ) -> Arc<dyn Fn() + Send + Sync>
            + Send
            + Sync,
    >,
}

/// The GL capability group (TS `HostGlCapabilities`). An omitted slot is capability absence.
#[derive(Clone, Default)]
pub struct HostGlCapabilities {
    pub context: Option<HostGlCapability>,
}

/// A WebGPU texture format (TS `GPUTextureFormat`), carried as its exact WebGPU string.
pub type GpuTextureFormat = String;

/// Alpha compositing of the swap-chain texture against the page (TS `GPUCanvasAlphaMode`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GpuCanvasAlphaMode {
    Opaque,
    Premultiplied,
}

/// The adapter preference for WebGPU device acquisition (TS `GPUPowerPreference`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GpuPowerPreference {
    HighPerformance,
    LowPower,
}

/// Who created a WGPU acquisition's handles (TS `'caller' | 'flight'`): `Flight` for handles created
/// for Flight, `Caller` for exact borrowed handles.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WgpuHostAcquisitionOwnership {
    Caller,
    Flight,
}

/// The presentation surface's current size, which every WGPU consumer reads once per frame (TS
/// `WgpuPresentationSurface`). The values are LIVE, never a snapshot: each read asks the provider for
/// the size the surface has now, so a resize is seen on the next read.
#[derive(Clone)]
pub struct WgpuPresentationSurface {
    pub height: Arc<dyn Fn() -> f32 + Send + Sync>,
    pub width: Arc<dyn Fn() -> f32 + Send + Sync>,
}

/// A WGPU device and presentation context acquired for a surface (TS `WgpuHostAcquisition`, an
/// Entity).
pub struct WgpuHostAcquisition {
    runtime: EntityRuntimeSlot,
    pub context: GpuCanvasContext,
    pub device: GpuDevice,
    pub format: GpuTextureFormat,
    pub ownership: WgpuHostAcquisitionOwnership,
    pub surface: WgpuPresentationSurface,
}

/// Options for WGPU acquisition (TS `WgpuHostAcquisitionOptions`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WgpuHostAcquisitionOptions {
    pub format: Option<GpuTextureFormat>,
    pub power_preference: Option<GpuPowerPreference>,
}

/// Binds a device to a presentation surface (TS `WgpuSurfaceAttachment`).
#[derive(Clone)]
pub struct WgpuSurfaceAttachment {
    pub alpha_mode: GpuCanvasAlphaMode,
    pub device: GpuDevice,
    pub format: GpuTextureFormat,
}

/// The configured swap-chain context and the resolved presentation surface (TS
/// `WgpuSurfaceAttachResult`).
#[derive(Clone)]
pub struct WgpuSurfaceAttachResult {
    pub context: GpuCanvasContext,
    pub surface: WgpuPresentationSurface,
}

/// The settled result of an asynchronous WGPU acquisition (TS `Promise`): a provider rejection is the
/// `Err` arm.
pub type WgpuProviderFuture<T> = Pin<Box<dyn Future<Output = Result<T, FlightError>> + Send>>;

/// Process-wide host seam for acquiring a WebGPU device and presentation context (TS
/// `HostWgpuCapability`). `create` is the allocating lane (as `HostGlCapability::create`);
/// `attach_surface` binds a device already in hand to another surface, or returns `None` when the
/// target cannot present; `release` ends an acquisition.
#[derive(Clone)]
pub struct HostWgpuCapability {
    pub provider: ProviderRef,
    pub acquire: Arc<
        dyn Fn(&SurfaceRef, &WgpuHostAcquisitionOptions) -> WgpuProviderFuture<WgpuHostAcquisition>
            + Send
            + Sync,
    >,
    pub attach_surface: Arc<
        dyn Fn(&SurfaceRef, &WgpuSurfaceAttachment) -> Option<WgpuSurfaceAttachResult>
            + Send
            + Sync,
    >,
    pub create: Arc<dyn Fn(&Ref<AppWindow>, f32, f32) -> NativeSurfaceHandle + Send + Sync>,
    pub is_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub release: Arc<dyn Fn(&WgpuHostAcquisition) + Send + Sync>,
}

/// The WGPU capability group (TS `HostWgpuCapabilities`). An omitted slot is capability absence.
#[derive(Clone, Default)]
pub struct HostWgpuCapabilities {
    pub context: Option<HostWgpuCapability>,
}

impl Default for CanvasRenderingContext2D {
    fn default() -> Self {
        return CanvasRenderingContext2D {
            provider: Arc::new(()),
            handle: Arc::new(()),
        };
    }
}

impl Default for WgpuHostAcquisition {
    fn default() -> Self {
        return WgpuHostAcquisition {
            runtime: EntityRuntimeSlot::default(),
            context: GpuCanvasContext {
                provider: Arc::new(()),
                handle: Arc::new(()),
            },
            device: GpuDevice {
                provider: Arc::new(()),
                handle: Arc::new(()),
            },
            format: String::new(),
            ownership: WgpuHostAcquisitionOwnership::Flight,
            surface: WgpuPresentationSurface::default(),
        };
    }
}

impl Default for WgpuPresentationSurface {
    fn default() -> Self {
        return WgpuPresentationSurface {
            height: Arc::new(|| 0.0),
            width: Arc::new(|| 0.0),
        };
    }
}

impl Deref for SurfaceBase {
    type Target = SurfaceFields;

    fn deref(&self) -> &SurfaceFields {
        return &self.fields;
    }
}

impl DerefMut for SurfaceBase {
    fn deref_mut(&mut self) -> &mut SurfaceFields {
        return &mut self.fields;
    }
}

impl Deref for CanvasSurface {
    type Target = SurfaceFields;

    fn deref(&self) -> &SurfaceFields {
        return &self.fields;
    }
}

impl DerefMut for CanvasSurface {
    fn deref_mut(&mut self) -> &mut SurfaceFields {
        return &mut self.fields;
    }
}

impl Surface for SurfaceBase {
    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn surface_fields(&self) -> &SurfaceFields {
        return &self.fields;
    }

    fn surface_fields_mut(&mut self) -> &mut SurfaceFields {
        return &mut self.fields;
    }
}

impl Surface for CanvasSurface {
    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn surface_fields(&self) -> &SurfaceFields {
        return &self.fields;
    }

    fn surface_fields_mut(&mut self) -> &mut SurfaceFields {
        return &mut self.fields;
    }
}

flight_entity::impl_entity!(SurfaceBase);
flight_entity::impl_entity!(CanvasSurface);
flight_entity::impl_entity!(WgpuHostAcquisition);
