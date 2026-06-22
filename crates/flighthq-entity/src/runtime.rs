//! Runtime creation and access for entities.
//!
//! The runtime is intentionally opaque to application code. Subsystems attach
//! their own state by adding nullable fields to richer runtime structs defined
//! in higher-level packages. This module provides the base primitives.

use flighthq_types::{BaseRuntime, EntityRuntime};

use crate::entity::EntityData;

/// Creates a new `BaseRuntime` with no binding attached.
pub fn create_entity_runtime() -> BaseRuntime {
    BaseRuntime { binding: None }
}

/// Returns a shared reference to the entity's runtime.
///
/// Returns `None` if no runtime has been initialized yet (i.e. no subsystem
/// has called `ensure_entity_runtime` or `attach_entity_binding`).
pub fn get_entity_runtime(entity: &EntityData) -> Option<&BaseRuntime> {
    entity.runtime.as_ref()
}

/// Returns a mutable reference to the entity's runtime.
///
/// Returns `None` if no runtime has been initialized yet.
pub fn get_entity_runtime_mut(entity: &mut EntityData) -> Option<&mut BaseRuntime> {
    entity.runtime.as_mut()
}

/// Returns the binding stored in the runtime, if any.
///
/// Mirrors the `EntityRuntime` trait's `binding()` accessor.
pub fn get_entity_runtime_binding(runtime: &BaseRuntime) -> Option<&dyn std::any::Any> {
    runtime.binding()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entity::create_entity;

    #[test]
    fn create_entity_runtime_has_no_binding() {
        let rt = create_entity_runtime();
        assert!(rt.binding.is_none());
    }

    #[test]
    fn get_entity_runtime_none_before_init() {
        let entity = create_entity();
        assert!(get_entity_runtime(&entity).is_none());
    }

    #[test]
    fn get_entity_runtime_mut_none_before_init() {
        let mut entity = create_entity();
        assert!(get_entity_runtime_mut(&mut entity).is_none());
    }

    #[test]
    fn get_entity_runtime_binding_none_when_unset() {
        let rt = create_entity_runtime();
        assert!(get_entity_runtime_binding(&rt).is_none());
    }

    #[test]
    fn get_entity_runtime_binding_returns_value() {
        let mut rt = create_entity_runtime();
        rt.binding = Some(Box::new(99u32));
        let val = get_entity_runtime_binding(&rt)
            .and_then(|b| b.downcast_ref::<u32>())
            .copied();
        assert_eq!(val, Some(99));
    }

    #[test]
    fn get_entity_runtime_some_after_init() {
        let mut entity = create_entity();
        entity.runtime = Some(create_entity_runtime());
        assert!(get_entity_runtime(&entity).is_some());
    }

    #[test]
    fn get_entity_runtime_mut_some_after_init() {
        let mut entity = create_entity();
        entity.runtime = Some(create_entity_runtime());
        assert!(get_entity_runtime_mut(&mut entity).is_some());
    }
}
