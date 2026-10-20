use crate::types::{Entity, EntityRuntime};

pub fn create_entity_runtime() -> EntityRuntime {
    return EntityRuntime {
        binding: None,
        uid: None,
    };
}

pub fn get_entity_runtime(source: &Entity) -> Option<&EntityRuntime> {
    return source.runtime.as_ref();
}

/// Returns true when the entity's runtime slot has been allocated -- i.e. the entity has been
/// bound (attach_entity_binding) or otherwise given a runtime. A fresh or cloned entity has no
/// runtime and returns false.
pub fn has_entity_runtime(source: &Entity) -> bool {
    return source.runtime.is_some();
}
