//! Entity clone and strip utilities.

use crate::entity::EntityData;

/// Allocates a new `EntityData` with the runtime slot reset to `None`.
///
/// In TS, `cloneEntity` shallow-copies public data fields and strips the
/// runtime key. Since `EntityData` only holds the runtime slot, the clone
/// is structurally identical to a fresh entity. The source is not mutated.
pub fn clone_entity(_source: &EntityData) -> EntityData {
    EntityData { runtime: None }
}

/// Returns a new `EntityData` with no runtime attached, stripping any runtime
/// state from the source. The source entity is not mutated.
///
/// This is the Rust equivalent of the TS `stripEntityRuntime`, which copies
/// public fields but omits the `EntityRuntimeKey` slot. Since `EntityData`
/// only holds the runtime slot, the result is a fresh `EntityData { runtime:
/// None }`.
pub fn strip_entity_runtime(_source: &EntityData) -> EntityData {
    EntityData { runtime: None }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entity::{create_entity, ensure_entity_runtime};

    #[test]
    fn clone_entity_has_no_runtime() {
        let mut entity = create_entity();
        ensure_entity_runtime(&mut entity);
        assert!(entity.runtime.is_some());
        let cloned = clone_entity(&entity);
        assert!(cloned.runtime.is_none());
    }

    #[test]
    fn clone_entity_does_not_mutate_source() {
        let mut entity = create_entity();
        ensure_entity_runtime(&mut entity);
        let _cloned = clone_entity(&entity);
        assert!(entity.runtime.is_some());
    }

    #[test]
    fn clone_entity_on_fresh_entity() {
        let entity = create_entity();
        let cloned = clone_entity(&entity);
        assert!(cloned.runtime.is_none());
    }

    #[test]
    fn cloned_entity_is_valid() {
        let mut entity = create_entity();
        ensure_entity_runtime(&mut entity);
        let mut cloned = clone_entity(&entity);
        ensure_entity_runtime(&mut cloned);
        assert!(cloned.runtime.is_some());
    }

    #[test]
    fn strip_clears_runtime() {
        let mut entity = create_entity();
        ensure_entity_runtime(&mut entity);
        assert!(entity.runtime.is_some());
        let stripped = strip_entity_runtime(&entity);
        assert!(stripped.runtime.is_none());
    }

    #[test]
    fn strip_does_not_mutate_source() {
        let mut entity = create_entity();
        ensure_entity_runtime(&mut entity);
        let _stripped = strip_entity_runtime(&entity);
        assert!(entity.runtime.is_some());
    }

    #[test]
    fn strip_on_fresh_entity() {
        let entity = create_entity();
        let stripped = strip_entity_runtime(&entity);
        assert!(stripped.runtime.is_none());
    }

    #[test]
    fn stripped_entity_is_valid() {
        let mut entity = create_entity();
        ensure_entity_runtime(&mut entity);
        let mut stripped = strip_entity_runtime(&entity);
        ensure_entity_runtime(&mut stripped);
        assert!(stripped.runtime.is_some());
    }
}
