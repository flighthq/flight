//! Surface allocation, private runtime and handle access (TS `surface.ts`).

use std::sync::RwLock;

use flight_entity::{Entity, Ref, allocate_entity, attach_entity_binding};
use flight_host::NativeSurfaceHandle;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn base_handle_and_runtime_methods_match_the_free_functions() {
        let drawable = Some(NativeSurfaceHandle {
            provider: std::sync::Arc::new(()),
            handle: std::sync::Arc::new("drawable"),
        });
        let surface: Ref<SurfaceBase> = allocate_surface(drawable);
        let borrowed = surface.read().unwrap();
        let method_handle = SurfaceBaseMethods::handle(&*borrowed).expect("handle");
        let free_handle = get_surface_handle(&*borrowed).expect("handle");
        assert!(std::sync::Arc::ptr_eq(
            &method_handle.handle,
            &free_handle.handle
        ));
        assert!(std::ptr::eq(
            SurfaceBaseMethods::runtime(&*borrowed),
            get_surface_runtime(&*borrowed)
        ));
    }
}

/// Allocates an entity around a drawable the host just created (TS `allocateSurface`). The handle
/// lives on the private runtime binding; per-kind factories add their own context afterward.
pub fn allocate_surface<T: Entity + Default>(handle: Option<NativeSurfaceHandle>) -> Ref<T> {
    let mut out: T = allocate_entity();
    attach_entity_binding(&mut out, Box::new(SurfaceRuntime { handle }));
    return Ref::new(RwLock::new(out));
}

/// Reads the drawable a surface was built around (TS `getSurfaceHandle`); identity is preserved.
// flight-lint: allow(contract-vocabulary) D16 structural surface dispatch (Principal batch13): the open Surface trait is the approved object-safe family, not a closed IR type
pub fn get_surface_handle(surface: &dyn Surface) -> Option<NativeSurfaceHandle> {
    return get_surface_runtime(surface).handle.clone();
}

/// Reads the surface's private runtime binding (TS `getSurfaceRuntime`).
// flight-lint: allow(contract-vocabulary) D16 structural surface dispatch (Principal batch13): the private runtime reader takes the same open Surface trait object
pub fn get_surface_runtime(surface: &dyn Surface) -> &SurfaceRuntime {
    return surface
        .entity_runtime()
        .data
        .as_ref()
        .and_then(|runtime| runtime.binding.as_ref())
        .and_then(|binding| binding.downcast_ref::<SurfaceRuntime>())
        .expect("surface runtime is attached by allocate_surface");
}

/// Sugar for the owned base surface entity.
pub trait SurfaceBaseMethods {
    fn handle(&self) -> Option<NativeSurfaceHandle>;
    fn runtime(&self) -> &SurfaceRuntime;
}

impl SurfaceBaseMethods for SurfaceBase {
    fn handle(&self) -> Option<NativeSurfaceHandle> {
        return get_surface_handle(self);
    }

    fn runtime(&self) -> &SurfaceRuntime {
        return get_surface_runtime(self);
    }
}
