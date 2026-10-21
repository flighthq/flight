//! Surface allocation, private runtime and handle access (TS `surface.ts`).

use flight_entity::{
    Entity, Unknown, allocate_entity, attach_entity_binding, get_entity_binding_as,
};

use crate::types::*;

/// Allocates an entity around a drawable the host just created, before any context is acquired (TS
/// `allocateSurface`). The handle goes on the private runtime because only the allocating host may
/// narrow it; per-kind factories add their own context field before finishing the entity.
pub fn allocate_surface<T: Entity + Default>(handle: NativeSurfaceHandle) -> T {
    let mut out: T = allocate_entity();
    attach_entity_binding(&mut out, Box::new(SurfaceRuntime { handle }));
    return out;
}

/// Reads the drawable a surface was built around (TS `getSurfaceHandle`). Hosts narrow this to
/// their platform type; portable code never reads through it.
pub fn get_surface_handle<T: Entity>(surface: &T) -> NativeSurfaceHandle {
    return get_surface_runtime(surface).handle.clone();
}

/// Reads the surface's private runtime binding (TS `getSurfaceRuntime`).
pub fn get_surface_runtime<T: Entity>(surface: &T) -> &SurfaceRuntime {
    return get_entity_binding_as::<SurfaceRuntime, T>(surface)
        .expect("surface runtime is attached by allocate_surface");
}
