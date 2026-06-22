//! Binding utilities for entities.
//!
//! A binding connects an entity to an external platform or host object (for
//! example, a DOM element on the web or a native view handle). Bindings are
//! stored in the entity's runtime and are opaque to the SDK.

use crate::entity::{EntityData, ensure_entity_runtime};
use crate::runtime::get_entity_runtime;

/// Attaches a binding to the entity's runtime.
///
/// Lazily initializes the runtime if it has not been created yet.
/// Any previous binding is replaced.
pub fn attach_entity_binding(entity: &mut EntityData, binding: Box<dyn std::any::Any>) {
    let rt = ensure_entity_runtime(entity);
    rt.binding = Some(binding);
}

/// Returns a shared reference to the entity's binding, if any.
///
/// Returns `None` when no runtime has been initialized or no binding has been
/// attached.
pub fn get_entity_binding(entity: &EntityData) -> Option<&dyn std::any::Any> {
    let rt = get_entity_runtime(entity)?;
    rt.binding.as_deref()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entity::create_entity;

    #[test]
    fn attach_entity_binding_initializes_runtime() {
        let mut entity = create_entity();
        attach_entity_binding(&mut entity, Box::new(42u32));
        assert!(entity.runtime.is_some());
    }

    #[test]
    fn attach_entity_binding_stores_value() {
        let mut entity = create_entity();
        attach_entity_binding(&mut entity, Box::new(7u64));
        let val = get_entity_binding(&entity)
            .and_then(|b| b.downcast_ref::<u64>())
            .copied();
        assert_eq!(val, Some(7));
    }

    #[test]
    fn attach_entity_binding_replaces_previous() {
        let mut entity = create_entity();
        attach_entity_binding(&mut entity, Box::new(1u32));
        attach_entity_binding(&mut entity, Box::new(2u32));
        let val = get_entity_binding(&entity)
            .and_then(|b| b.downcast_ref::<u32>())
            .copied();
        assert_eq!(val, Some(2));
    }

    #[test]
    fn get_entity_binding_none_before_attach() {
        let entity = create_entity();
        assert!(get_entity_binding(&entity).is_none());
    }

    #[test]
    fn get_entity_binding_none_after_clear() {
        let mut entity = create_entity();
        attach_entity_binding(&mut entity, Box::new(true));
        // Clear the binding directly on the runtime.
        entity.runtime.as_mut().unwrap().binding = None;
        assert!(get_entity_binding(&entity).is_none());
    }

    #[test]
    fn get_entity_binding_different_types() {
        let mut entity = create_entity();
        attach_entity_binding(&mut entity, Box::new("hello"));
        let val = get_entity_binding(&entity)
            .and_then(|b| b.downcast_ref::<&str>())
            .copied();
        assert_eq!(val, Some("hello"));
    }
}
