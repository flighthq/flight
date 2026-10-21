//! The surface contract types: the opaque native handle, the base surface entity and its private
//! runtime (TS `types/src/Surface.ts`).

use flight_entity::{EntityRuntimeSlot, Unknown};

/// A host-defined native drawable identity (TS `NativeSurfaceHandle`). Web supplies a canvas
/// element, SDL a window, EGL a surface, and lower-level hosts may use an integer; the common
/// contract deliberately does not narrow it, so `Unknown` preserves the opaque representation and
/// its shared identity.
pub type NativeSurfaceHandle = Unknown;

/// The base drawable entity (TS `Surface`, an Entity). It carries no public data: the drawable the
/// host allocated lives on the private runtime binding, so portable layers can name no platform
/// type. A surface without a drawable is meaningless, so the handle is set once at construction.
#[derive(Default)]
pub struct Surface {
    runtime: EntityRuntimeSlot,
}

/// Per-surface runtime data retained beside the entity (TS `SurfaceRuntime extends EntityRuntime`).
/// The handle is required rather than optional: it lives exactly as long as the surface, and storing
/// it here replaces the source entity-runtime key with the package's private binding.
pub struct SurfaceRuntime {
    pub handle: NativeSurfaceHandle,
}

flight_entity::impl_entity!(Surface);
