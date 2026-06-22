//! Entity base struct and trait.
//!
//! Public objects are plain data structs. Each entity optionally carries a
//! `BaseRuntime` for package-private state (graph linkage, caches, signals).
//! Application code treats the runtime as opaque.

use flighthq_types::{BaseRuntime, Entity};

use crate::runtime::create_entity_runtime;

/// A concrete base entity that holds an optional runtime slot.
///
/// Higher-level packages embed this (or a richer runtime struct) alongside
/// their own public fields. The runtime is intentionally opaque to callers.
pub struct EntityData {
    /// Package-private runtime state; `None` until first subsystem attaches.
    pub(crate) runtime: Option<BaseRuntime>,
}

impl Entity for EntityData {}

/// Creates a new `EntityData` with no runtime attached.
///
/// The runtime slot starts as `None` and is initialized lazily on first
/// subsystem attach (e.g. `attach_entity_binding`).
pub fn create_entity() -> EntityData {
    EntityData { runtime: None }
}

/// Ensures the runtime slot on `entity` is initialized, then returns a mutable
/// reference to it.
///
/// Equivalent to the TS lazy-initialize pattern:
/// ```ts
/// if (entity[EntityRuntimeKey] === undefined) {
///   entity[EntityRuntimeKey] = createEntityRuntime();
/// }
/// ```
pub fn ensure_entity_runtime(entity: &mut EntityData) -> &mut BaseRuntime {
    if entity.runtime.is_none() {
        entity.runtime = Some(create_entity_runtime());
    }
    entity.runtime.as_mut().unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_entity_has_no_runtime() {
        let entity = create_entity();
        assert!(entity.runtime.is_none());
    }

    #[test]
    fn ensure_entity_runtime_initializes_once() {
        let mut entity = create_entity();
        {
            let rt = ensure_entity_runtime(&mut entity);
            rt.binding = None;
        }
        // Second call should not reinitialize — runtime slot is Some.
        assert!(entity.runtime.is_some());
    }

    #[test]
    fn ensure_entity_runtime_returns_same_slot() {
        let mut entity = create_entity();
        ensure_entity_runtime(&mut entity).binding = Some(Box::new(42u32));
        // Slot persists between calls.
        let val = entity
            .runtime
            .as_ref()
            .unwrap()
            .binding
            .as_ref()
            .and_then(|b| b.downcast_ref::<u32>())
            .copied();
        assert_eq!(val, Some(42));
    }
}
