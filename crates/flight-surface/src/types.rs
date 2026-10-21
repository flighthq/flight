// flight-lint: allow-file(contract-vocabulary, sugar-delegates) D16 structural Surface trait and Deref accessors preserve the derived surface family and are contract dispatch, not convenience methods
//! The surface contract types: opaque native handle, D16 surface fields and trait, the canonical
//! canvas context record, and the host capabilities (TS `Surface.ts`, `HostSurface.ts`,
//! `HostCanvas.ts`, `CanvasSurface.ts`).

use std::any::Any;
use std::ops::{Deref, DerefMut};
use std::sync::Arc;

use flight_app::contract::AppWindow;
use flight_entity::{Entity, EntityRuntimeSlot, Ref, Unknown};
use flight_hostcapability::ProviderRef;

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

impl Default for CanvasRenderingContext2D {
    fn default() -> Self {
        return CanvasRenderingContext2D {
            provider: Arc::new(()),
            handle: Arc::new(()),
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
